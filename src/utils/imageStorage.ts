/**
 * Работа с файлами изображений.
 *
 * `expo-image-picker` возвращает URI во временном кеше: система может удалить
 * такой файл в любой момент, поэтому после выбора изображение копируется в
 * `documentDirectory` (постоянное хранилище приложения), а в базу пишется уже
 * новый путь.
 *
 * На веб `expo-file-system` недоступен, поэтому там изображение переводится в
 * data URI и хранится прямо в базе.
 */

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { logger, toError } from '../utils/logger';

/** Папка внутри `documentDirectory`, где лежат все копии изображений. */
export const IMAGE_DIRECTORY_NAME = 'marker-images';

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];

function imagesDirectory(): Directory {
  return new Directory(Paths.document, IMAGE_DIRECTORY_NAME);
}

/** Создаёт папку для изображений, если её ещё нет. */
function ensureImagesDirectory(): Directory {
  const directory = imagesDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function guessExtension(sourceUri: string): string {
  const withoutQuery = sourceUri.split('?')[0];
  const rawExtension = withoutQuery.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_EXTENSIONS.includes(rawExtension) ? rawExtension : 'jpg';
}

function buildFileName(sourceUri: string): string {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${unique}.${guessExtension(sourceUri)}`;
}

/** Переводит `blob:`/`http:` URI в data URI — веб-аналог копирования файла. */
async function toDataUri(sourceUri: string): Promise<string> {
  if (sourceUri.startsWith('data:')) {
    return sourceUri;
  }

  const response = await fetch(sourceUri);
  if (!response.ok) {
    throw new Error(`Не удалось прочитать изображение (${response.status})`);
  }

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Не удалось прочитать выбранное изображение'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/**
 * Сохраняет выбранное изображение в постоянное хранилище и возвращает URI,
 * который нужно записать в таблицу `marker_images`.
 */
export async function persistPickedImage(sourceUri: string): Promise<string> {
  if (!sourceUri) {
    throw new Error('Не передан путь к изображению');
  }

  if (Platform.OS === 'web') {
    const dataUri = await toDataUri(sourceUri);
    logger.info('Изображение сохранено как data URI (web)');
    return dataUri;
  }

  try {
    const directory = ensureImagesDirectory();
    const source = new File(sourceUri);

    if (!source.exists) {
      throw new Error('Выбранный файл больше недоступен');
    }

    const destination = new File(directory, buildFileName(sourceUri));
    await source.copy(destination);

    logger.info(`Изображение сохранено: ${destination.uri}`);
    return destination.uri;
  } catch (error) {
    logger.error('Не удалось сохранить изображение', toError(error));
    throw new Error(
      `Не удалось сохранить изображение: ${toError(error).message}`
    );
  }
}

/** Проверяет, что URI указывает на файл внутри папки приложения. */
function isManagedImageUri(uri: string): boolean {
  return uri.startsWith('file://') && uri.includes(`/${IMAGE_DIRECTORY_NAME}/`);
}

/**
 * Удаляет файл изображения. Ошибки не пробрасываются: запись в базе уже
 * удалена, и «мусорный» файл не должен ломать сценарий удаления.
 */
export async function deleteStoredImage(uri: string): Promise<void> {
  if (Platform.OS === 'web' || !isManagedImageUri(uri)) {
    // data URI и файлы вне папки приложения не трогаем.
    return;
  }

  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
      logger.info(`Удалён файл изображения: ${uri}`);
    }
  } catch (error) {
    logger.warn('Не удалось удалить файл изображения', toError(error));
  }
}

/** Удаляет несколько файлов подряд (например, при удалении маркера). */
export async function deleteStoredImages(uris: readonly string[]): Promise<void> {
  await Promise.all(uris.map((uri) => deleteStoredImage(uri)));
}
