/**
 * Слой доступа к данным.
 *
 * Здесь нет ни одного обращения к React: только чистые функции, принимающие
 * соединение `SQLiteDatabase`. Благодаря этому операции легко тестировать и
 * переиспользовать, а UI-компоненты не знают про SQL.
 *
 * Все функции возвращают доменные объекты (`Marker`, `MarkerImage`) с
 * camelCase-полями: преобразование из snake_case-колонок происходит только
 * в этом файле.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { Marker, MarkerImage } from '../../types';
import { logger } from '../utils/logger';

interface MarkerRow {
  id: number;
  latitude: number;
  longitude: number;
  created_at: string | null;
}

interface MarkerImageRow {
  id: number;
  marker_id: number;
  uri: string;
  created_at: string | null;
}

const MARKER_COLUMNS = 'id, latitude, longitude, created_at';
const IMAGE_COLUMNS = 'id, marker_id, uri, created_at';

/**
 * SQLite хранит `CURRENT_TIMESTAMP` как `YYYY-MM-DD HH:MM:SS` в UTC.
 * Приводим его к ISO 8601, чтобы `new Date(...)` одинаково работал на всех
 * платформах (включая Hermes и JavaScriptCore на iOS).
 */
function normalizeTimestamp(value: string | null): string {
  if (!value) {
    return new Date().toISOString();
  }
  if (value.includes('T')) {
    return value;
  }
  return `${value.replace(' ', 'T')}Z`;
}

function mapMarkerRow(row: MarkerRow): Marker {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: normalizeTimestamp(row.created_at),
    images: [],
  };
}

function mapImageRow(row: MarkerImageRow): MarkerImage {
  return {
    id: row.id,
    markerId: row.marker_id,
    uri: row.uri,
    createdAt: normalizeTimestamp(row.created_at),
  };
}

/** Проверяет координаты до записи в базу. */
function assertCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`Некорректная широта: ${String(latitude)}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Некорректная долгота: ${String(longitude)}`);
  }
}

/** Проверяет идентификатор, пришедший из навигации (там он всегда строка). */
function assertId(id: number, entity: string): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Некорректный идентификатор ${entity}: ${String(id)}`);
  }
}

/**
 * Создаёт маркер и возвращает его id.
 * Если вставка не удалась, `runAsync` бросит ошибку — вызывающий код её
 * обработает.
 */
export async function insertMarker(
  db: SQLiteDatabase,
  latitude: number,
  longitude: number
): Promise<number> {
  assertCoordinates(latitude, longitude);

  const result = await db.runAsync(
    'INSERT INTO markers (latitude, longitude) VALUES (?, ?);',
    latitude,
    longitude
  );

  if (result.changes !== 1) {
    throw new Error('Маркер не был добавлен в базу данных');
  }

  logger.info(`Добавлен маркер #${result.lastInsertRowId}`);
  return result.lastInsertRowId;
}

/** Возвращает все маркеры вместе с их изображениями (2 запроса вместо N+1). */
export async function selectMarkers(db: SQLiteDatabase): Promise<Marker[]> {
  // Запросы выполняются последовательно: на веб-платформе (wa-sqlite) и на
  // Android параллельные обращения к одному соединению могут конфликтовать.
  const markerRows = await db.getAllAsync<MarkerRow>(
    `SELECT ${MARKER_COLUMNS} FROM markers ORDER BY id DESC;`
  );
  const imageRows = await db.getAllAsync<MarkerImageRow>(
    `SELECT ${IMAGE_COLUMNS} FROM marker_images ORDER BY id ASC;`
  );

  const markersById = new Map<number, Marker>();
  for (const row of markerRows) {
    markersById.set(row.id, mapMarkerRow(row));
  }

  for (const row of imageRows) {
    markersById.get(row.marker_id)?.images.push(mapImageRow(row));
  }

  return Array.from(markersById.values());
}

/** Возвращает маркер по id или `null`, если его нет. */
export async function selectMarkerById(
  db: SQLiteDatabase,
  id: number
): Promise<Marker | null> {
  assertId(id, 'маркера');

  const row = await db.getFirstAsync<MarkerRow>(
    `SELECT ${MARKER_COLUMNS} FROM markers WHERE id = ?;`,
    id
  );

  if (!row) {
    return null;
  }

  const marker = mapMarkerRow(row);
  marker.images = await selectMarkerImages(db, id);
  return marker;
}

/**
 * Удаляет маркер вместе со связанными изображениями.
 *
 * Возвращает URI удалённых изображений, чтобы вызывающий код мог убрать файлы
 * с диска уже после успешного коммита транзакции (файловая система не умеет
 * откатываться вместе с SQLite).
 */
export async function deleteMarker(
  db: SQLiteDatabase,
  id: number
): Promise<{ deleted: boolean; imageUris: string[] }> {
  assertId(id, 'маркера');

  const imageUris: string[] = [];
  let deleted = false;

  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ uri: string }>(
      'SELECT uri FROM marker_images WHERE marker_id = ?;',
      id
    );

    const result = await db.runAsync('DELETE FROM markers WHERE id = ?;', id);
    deleted = result.changes > 0;

    if (!deleted) {
      return;
    }

    // Основную работу делает ON DELETE CASCADE. Проверка ниже — страховка на
    // случай платформы, где `PRAGMA foreign_keys` не применилась: иначе в базе
    // остались бы «осиротевшие» изображения.
    const leftover = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM marker_images WHERE marker_id = ?;',
      id
    );

    if (leftover && leftover.count > 0) {
      logger.warn(
        `Каскадное удаление не сработало для маркера #${id}, удаляю изображения вручную`
      );
      await db.runAsync('DELETE FROM marker_images WHERE marker_id = ?;', id);
    }

    imageUris.push(...rows.map((row) => row.uri));
  });

  if (deleted) {
    logger.info(
      `Удалён маркер #${id} и ${imageUris.length} изображени(й)`
    );
  } else {
    logger.warn(`Маркер #${id} не найден при удалении`);
  }

  return { deleted, imageUris };
}

/** Возвращает все изображения конкретного маркера. */
export async function selectMarkerImages(
  db: SQLiteDatabase,
  markerId: number
): Promise<MarkerImage[]> {
  assertId(markerId, 'маркера');

  const rows = await db.getAllAsync<MarkerImageRow>(
    `SELECT ${IMAGE_COLUMNS} FROM marker_images WHERE marker_id = ? ORDER BY id ASC;`,
    markerId
  );

  return rows.map(mapImageRow);
}

/**
 * Добавляет изображение к маркеру и возвращает id записи.
 *
 * Если маркера нет, SQLite выбросит ошибку ограничения внешнего ключа —
 * именно так требование «обрабатывать нарушения ограничений» проверяется на
 * практике. Проверяем существование заранее, чтобы сообщение было понятным.
 */
export async function insertMarkerImage(
  db: SQLiteDatabase,
  markerId: number,
  uri: string
): Promise<number> {
  assertId(markerId, 'маркера');

  const trimmedUri = uri.trim();
  if (!trimmedUri) {
    throw new Error('Пустой путь к изображению');
  }

  const markerExists = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM markers WHERE id = ?;',
    markerId
  );

  if (!markerExists) {
    throw new Error(`Маркер #${markerId} не найден: изображение не добавлено`);
  }

  const result = await db.runAsync(
    'INSERT INTO marker_images (marker_id, uri) VALUES (?, ?);',
    markerId,
    trimmedUri
  );

  if (result.changes !== 1) {
    throw new Error('Изображение не было добавлено в базу данных');
  }

  logger.info(`Добавлено изображение #${result.lastInsertRowId} к маркеру #${markerId}`);
  return result.lastInsertRowId;
}

/**
 * Удаляет запись об изображении и возвращает её URI (или `null`, если записи
 * не было) — файл удаляется вызывающим кодом.
 */
export async function deleteMarkerImage(
  db: SQLiteDatabase,
  id: number
): Promise<{ deleted: boolean; uri: string | null }> {
  assertId(id, 'изображения');

  const row = await db.getFirstAsync<{ uri: string }>(
    'SELECT uri FROM marker_images WHERE id = ?;',
    id
  );

  if (!row) {
    logger.warn(`Изображение #${id} не найдено при удалении`);
    return { deleted: false, uri: null };
  }

  const result = await db.runAsync('DELETE FROM marker_images WHERE id = ?;', id);

  if (result.changes === 0) {
    return { deleted: false, uri: null };
  }

  logger.info(`Удалено изображение #${id}`);
  return { deleted: true, uri: row.uri };
}

/** Сколько всего маркеров и изображений в базе — для диагностических логов. */
export async function selectStats(
  db: SQLiteDatabase
): Promise<{ markers: number; images: number }> {
  const row = await db.getFirstAsync<{ markers: number; images: number }>(
    `SELECT
       (SELECT COUNT(*) FROM markers) AS markers,
       (SELECT COUNT(*) FROM marker_images) AS images;`
  );

  return { markers: row?.markers ?? 0, images: row?.images ?? 0 };
}
