/**
 * Контекст базы данных.
 *
 * Единственное место в приложении, которое владеет соединением SQLite:
 *  • открывает базу при монтировании провайдера и закрывает при размонтировании;
 *  • держит кэш маркеров в состоянии React, чтобы экраны не делали запросы
 *    вручную при каждом рендере;
 *  • оборачивает все операции в обработку ошибок: любая проблема попадает в
 *    `error` и в лог, а вызывающий код получает reject, чтобы показать
 *    пользователю понятное сообщение.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Marker, MarkerImage } from '../../types';
import {
  initializeDatabase,
  DATABASE_VERSION,
} from '../database/schema';
import {
  deleteMarker as deleteMarkerRow,
  deleteMarkerImage as deleteMarkerImageRow,
  insertMarker,
  insertMarkerImage,
  selectMarkerImages,
  selectMarkers,
  selectStats,
} from '../database/operations';
import { deleteStoredImage, deleteStoredImages } from '../utils/imageStorage';
import { getErrorMessage, logger, toError } from '../utils/logger';

/**
 * Публичный интерфейс контекста. Первые шесть методов — обязательные из
 * задания, остальные добавлены для удобства UI.
 */
export interface DatabaseContextType {
  addMarker: (latitude: number, longitude: number) => Promise<number>;
  deleteMarker: (id: number) => Promise<void>;
  getMarkers: () => Promise<Marker[]>;
  addImage: (markerId: number, uri: string) => Promise<void>;
  deleteImage: (id: number) => Promise<void>;
  getMarkerImages: (markerId: number) => Promise<MarkerImage[]>;

  isLoading: boolean;
  error: Error | null;

  /** Кэш маркеров: обновляется после каждой мутации. */
  markers: Marker[];
  /** `true`, когда соединение открыто и схема готова. */
  isReady: boolean;
  /** Маркер из кэша по id (без запроса в базу). */
  getMarker: (id: number) => Marker | null;
  /** Повторная инициализация после ошибки. */
  retryInitialization: () => void;
  /** Сброс ошибки без повторного подключения. */
  clearError: () => void;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const dbRef = useRef<SQLiteDatabase | null>(null);
  const isMountedRef = useRef(true);

  const [markers, setMarkers] = useState<Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const handleError = useCallback((message: string, cause: unknown): never => {
    const normalized = toError(cause);
    logger.error(message, normalized);

    if (isMountedRef.current) {
      setError(normalized);
    }

    // Сохраняем исходное сообщение: экраны показывают именно его.
    throw normalized;
  }, []);

  /** Возвращает открытое соединение или бросает понятную ошибку. */
  const requireDatabase = useCallback((): SQLiteDatabase => {
    const db = dbRef.current;
    if (!db) {
      throw new Error(
        'База данных ещё не готова. Дождитесь загрузки или перезапустите приложение.'
      );
    }
    return db;
  }, []);

  const loadMarkers = useCallback(async (): Promise<Marker[]> => {
    const db = requireDatabase();
    const list = await selectMarkers(db);
    if (isMountedRef.current) {
      setMarkers(list);
    }
    return list;
  }, [requireDatabase]);

  // Открытие базы и очистка ресурсов при размонтировании.
  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    const connect = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const db = await initializeDatabase();

        // Провайдер размонтировали, пока открывалось соединение: закрываем его,
        // чтобы не оставить открытый файл базы.
        if (cancelled) {
          await db.closeAsync().catch(() => undefined);
          return;
        }

        dbRef.current = db;
        const list = await selectMarkers(db);
        const stats = await selectStats(db);

        if (cancelled) {
          return;
        }

        setMarkers(list);
        setIsReady(true);
        logger.info(
          `Схема v${DATABASE_VERSION}: маркеров — ${stats.markers}, изображений — ${stats.images}`
        );
      } catch (cause) {
        if (!cancelled) {
          const normalized = toError(cause);
          logger.error('Не удалось инициализировать базу данных', normalized);
          setError(normalized);
          setIsReady(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      isMountedRef.current = false;

      const db = dbRef.current;
      dbRef.current = null;

      if (db) {
        db.closeAsync().catch((cause: unknown) => {
          logger.warn('Не удалось закрыть соединение с базой', toError(cause));
        });
      }
    };
  }, [connectionAttempt]);

  const retryInitialization = useCallback(() => {
    logger.info('Повторная инициализация базы данных');
    // Сбрасываем кэш: после переподключения данные прочитаются заново.
    setMarkers([]);
    setIsReady(false);
    setConnectionAttempt((attempt) => attempt + 1);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const addMarker = useCallback(
    async (latitude: number, longitude: number): Promise<number> => {
      try {
        const db = requireDatabase();
        const id = await insertMarker(db, latitude, longitude);
        await loadMarkers();
        return id;
      } catch (cause) {
        return handleError('Не удалось добавить маркер', cause);
      }
    },
    [handleError, loadMarkers, requireDatabase]
  );

  const deleteMarker = useCallback(
    async (id: number): Promise<void> => {
      try {
        const db = requireDatabase();
        const { deleted, imageUris } = await deleteMarkerRow(db, id);

        if (!deleted) {
          throw new Error('Маркер уже был удалён');
        }

        // Файлы удаляем только после успешного коммита транзакции.
        await deleteStoredImages(imageUris);
        await loadMarkers();
      } catch (cause) {
        handleError('Не удалось удалить маркер', cause);
      }
    },
    [handleError, loadMarkers, requireDatabase]
  );

  const getMarkers = useCallback(async (): Promise<Marker[]> => {
    try {
      return await loadMarkers();
    } catch (cause) {
      return handleError('Не удалось загрузить маркеры', cause);
    }
  }, [handleError, loadMarkers]);

  const addImage = useCallback(
    async (markerId: number, uri: string): Promise<void> => {
      try {
        const db = requireDatabase();
        await insertMarkerImage(db, markerId, uri);
        await loadMarkers();
      } catch (cause) {
        // Если запись в базу не удалась, скопированный файл останется
        // «сиротой» — убираем его (для data URI и чужих путей это no-op).
        await deleteStoredImage(uri);
        handleError('Не удалось добавить изображение', cause);
      }
    },
    [handleError, loadMarkers, requireDatabase]
  );

  const deleteImage = useCallback(
    async (id: number): Promise<void> => {
      try {
        const db = requireDatabase();
        const { deleted, uri } = await deleteMarkerImageRow(db, id);

        if (!deleted) {
          throw new Error('Изображение уже было удалено');
        }

        if (uri) {
          await deleteStoredImage(uri);
        }

        await loadMarkers();
      } catch (cause) {
        handleError('Не удалось удалить изображение', cause);
      }
    },
    [handleError, loadMarkers, requireDatabase]
  );

  const getMarkerImages = useCallback(
    async (markerId: number): Promise<MarkerImage[]> => {
      try {
        const db = requireDatabase();
        return await selectMarkerImages(db, markerId);
      } catch (cause) {
        return handleError('Не удалось загрузить изображения', cause);
      }
    },
    [handleError, requireDatabase]
  );

  const getMarker = useCallback(
    (id: number): Marker | null => markers.find((marker) => marker.id === id) ?? null,
    [markers]
  );

  const value = useMemo<DatabaseContextType>(
    () => ({
      addMarker,
      deleteMarker,
      getMarkers,
      addImage,
      deleteImage,
      getMarkerImages,
      isLoading,
      error,
      markers,
      isReady,
      getMarker,
      retryInitialization,
      clearError,
    }),
    [
      addImage,
      addMarker,
      clearError,
      deleteImage,
      deleteMarker,
      error,
      getMarker,
      getMarkerImages,
      getMarkers,
      isLoading,
      isReady,
      markers,
      retryInitialization,
    ]
  );

  return (
    <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
  );
}

/** Хук доступа к базе. Бросает ошибку, если провайдер не подключён. */
export function useDatabase(): DatabaseContextType {
  const context = useContext(DatabaseContext);

  if (!context) {
    throw new Error('useDatabase должен использоваться внутри DatabaseProvider');
  }

  return context;
}

/** Удобный геттер текста последней ошибки для экранов. */
export function useDatabaseErrorMessage(): string | null {
  const { error } = useDatabase();
  return error ? getErrorMessage(error) : null;
}
