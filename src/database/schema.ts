/**
 * Инициализация базы данных и управление её версиями.
 *
 * Схема соответствует заданию: таблица `markers` и связанная с ней
 * `marker_images` с внешним ключом `ON DELETE CASCADE`.
 *
 * Версионирование построено на встроенном `PRAGMA user_version`: при запуске
 * приложение читает текущую версию и последовательно применяет недостающие
 * миграции. Каждая миграция выполняется в транзакции, поэтому прерванная
 * миграция не оставит базу в «полуприменённом» состоянии.
 */

import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { logger, toError } from '../utils/logger';

/** Имя файла базы. На Android/iOS он лежит в каталоге `SQLite` песочницы приложения. */
export const DATABASE_NAME = 'markers.db';

/** Актуальная версия схемы. Увеличивайте её при добавлении новой миграции. */
export const DATABASE_VERSION = 1;

type Migration = (db: SQLite.SQLiteDatabase) => Promise<void>;

/**
 * Набор миграций: ключ — версия, до которой база поднимается после применения.
 * Миграции должны быть идемпотентными (`IF NOT EXISTS`) на случай повторного
 * запуска после сбоя.
 */
const MIGRATIONS: Record<number, Migration> = {
  1: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS markers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS marker_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          marker_id INTEGER NOT NULL,
          uri TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (marker_id) REFERENCES markers (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_marker_images_marker_id
          ON marker_images (marker_id);
    `);
  },
};

/**
 * Включает проверку внешних ключей. В SQLite она выключена по умолчанию и
 * задаётся для каждого соединения отдельно, поэтому вызывается сразу после
 * открытия базы и обязательно вне транзакции.
 */
async function enableForeignKeys(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    const result = await db.getFirstAsync<{ foreign_keys: number }>(
      'PRAGMA foreign_keys;'
    );
    if (result?.foreign_keys !== 1) {
      logger.warn(
        'PRAGMA foreign_keys не включился — каскадное удаление может не сработать'
      );
    }
  } catch (error) {
    // На веб-платформе (wa-sqlite) прагма может быть недоступна: не считаем
    // это фатальной ошибкой — операции дополнительно удаляют связанные строки.
    logger.warn('Не удалось включить PRAGMA foreign_keys', toError(error));
  }
}

/** Переводит базу в режим WAL: быстрее запись и меньше блокировок при чтении. */
async function enableWalMode(db: SQLite.SQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') {
    // OPFS-драйвер expo-sqlite на веб не поддерживает WAL.
    return;
  }
  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  } catch (error) {
    logger.warn('Не удалось включить режим WAL', toError(error));
  }
}

/** Читает текущую версию схемы из `PRAGMA user_version`. */
export async function getDatabaseVersion(
  db: SQLite.SQLiteDatabase
): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  return row?.user_version ?? 0;
}

/**
 * Применяет все миграции, которых ещё нет в базе.
 *
 * @returns номер версии, до которой обновлена база
 */
export async function migrateDatabaseIfNeeded(
  db: SQLite.SQLiteDatabase
): Promise<number> {
  let currentVersion = await getDatabaseVersion(db);

  if (currentVersion > DATABASE_VERSION) {
    throw new Error(
      `Версия базы (${currentVersion}) новее поддерживаемой приложением (${DATABASE_VERSION}). ` +
        'Обновите приложение или удалите локальную базу.'
    );
  }

  if (currentVersion === DATABASE_VERSION) {
    logger.info(`Схема актуальна (версия ${currentVersion})`);
    return currentVersion;
  }

  logger.info(`Обновление схемы: ${currentVersion} → ${DATABASE_VERSION}`);

  while (currentVersion < DATABASE_VERSION) {
    const nextVersion = currentVersion + 1;
    const migration = MIGRATIONS[nextVersion];

    if (!migration) {
      throw new Error(`Не найдена миграция для версии ${nextVersion}`);
    }

    try {
      await db.withTransactionAsync(async () => {
        await migration(db);
      });
      // `PRAGMA user_version` не принимает параметры, поэтому число
      // подставляется в строку — оно берётся из константы, а не из ввода.
      await db.execAsync(`PRAGMA user_version = ${nextVersion};`);
      currentVersion = nextVersion;
      logger.info(`Миграция ${nextVersion} применена`);
    } catch (error) {
      logger.error(`Ошибка миграции ${nextVersion}`, toError(error));
      throw new Error(
        `Не удалось обновить базу до версии ${nextVersion}: ${
          toError(error).message
        }`
      );
    }
  }

  return currentVersion;
}

/**
 * Открывает базу данных и приводит её схему к актуальной версии.
 * Бросает ошибку, если базу не удалось открыть или мигрировать, —
 * контекст покажет её пользователю.
 */
export async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  let db: SQLite.SQLiteDatabase | null = null;

  try {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await enableForeignKeys(db);
    await enableWalMode(db);
    await migrateDatabaseIfNeeded(db);
    logger.info(`База «${DATABASE_NAME}» готова к работе`);
    return db;
  } catch (error) {
    // Не оставляем «висящее» соединение при неудачной инициализации.
    if (db) {
      try {
        await db.closeAsync();
      } catch {
        // Соединение уже могло быть закрыто драйвером.
      }
    }
    logger.error('Ошибка инициализации базы данных', toError(error));
    throw error;
  }
}
