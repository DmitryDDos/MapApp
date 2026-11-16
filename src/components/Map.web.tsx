import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDatabase } from '../contexts/DatabaseContext';
import { getErrorMessage } from '../utils/logger';
import MapStatusOverlay from './MapStatusOverlay';

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const INITIAL_CENTER: [number, number] = [55.751244, 37.618423];
const INITIAL_ZOOM = 12;

/** Leaflet хранит признак инициализации прямо в DOM-узле. */
type LeafletContainer = HTMLDivElement & { _leaflet_id?: number };

export default function Map() {
  const router = useRouter();
  const { markers, addMarker, isLoading, error, retryInitialization } =
    useDatabase();

  const containerRef = useRef<LeafletContainer | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletMarkersRef = useRef<L.Marker[]>([]);

  const [initAttempt, setInitAttempt] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tileWarning, setTileWarning] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const isAddingRef = useRef(false);

  // Колбэки карты создаются один раз, поэтому актуальные функции держим в
  // ref: иначе обработчик dblclick «запомнит» первый рендер и будет писать в
  // устаревшее состояние базы.
  const addMarkerRef = useRef(addMarker);
  const routerRef = useRef(router);

  useEffect(() => {
    addMarkerRef.current = addMarker;
  }, [addMarker]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    let map: L.Map | null = null;

    try {
      map = L.map(container).setView(INITIAL_CENTER, INITIAL_ZOOM);
      mapRef.current = map;

      map.doubleClickZoom.disable();

      const tileLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution:
            '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }
      );

      tileLayer.on('tileerror', () => setTileWarning(true));
      tileLayer.on('load', () => setTileWarning(false));
      tileLayer.addTo(map);

      map.on('dblclick', async (event: L.LeafletMouseEvent) => {
        if (isAddingRef.current) {
          return;
        }

        isAddingRef.current = true;
        setIsAdding(true);

        try {
          const id = await addMarkerRef.current(
            event.latlng.lat,
            event.latlng.lng
          );
          routerRef.current.push({
            pathname: '/marker/[id]',
            params: { id: String(id) },
          });
        } catch (cause) {
          setMapError(getErrorMessage(cause, 'Не удалось добавить маркер'));
        } finally {
          isAddingRef.current = false;
          setIsAdding(false);
        }
      });
    } catch (cause) {
      // Ошибку показываем в микрозадаче: setState прямо в эффекте вызвал бы
      // каскадный рендер, а пользователь всё равно увидит сообщение после
      // завершения текущего прохода отрисовки.
      const message = getErrorMessage(
        cause,
        'Не удалось инициализировать карту'
      );
      queueMicrotask(() => setMapError(message));

      if (map) {
        map.remove();
        mapRef.current = null;
      }
      // Неудачная инициализация могла оставить флаг в узле — снимаем его,
      // иначе повторная попытка упадёт с «Map container is already initialized».
      delete container._leaflet_id;
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      leafletMarkersRef.current = [];
    };
  }, [initAttempt]);

  // Синхронизация меток: список пересоздаётся при каждом изменении маркеров.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    leafletMarkersRef.current.forEach((leafletMarker) => {
      leafletMarker.remove();
    });
    leafletMarkersRef.current = [];

    markers.forEach((marker) => {
      const leafletMarker = L.marker([marker.latitude, marker.longitude])
        .addTo(map)
        .on('click', () => {
          routerRef.current.push({
            pathname: '/marker/[id]',
            params: { id: String(marker.id) },
          });
        });

      leafletMarkersRef.current.push(leafletMarker);
    });
  }, [markers, initAttempt]);

  const handleRetry = useCallback(() => {
    if (error) {
      retryInitialization();
      return;
    }

    setMapError(null);
    setInitAttempt((attempt) => attempt + 1);
  }, [error, retryInitialization]);

  const openList = useCallback(() => router.push('/markers'), [router]);

  const errorMessage = error ? getErrorMessage(error) : mapError;

  return (
    <View style={styles.container}>
      <div
        ref={(node) => {
          containerRef.current = node as LeafletContainer | null;
        }}
        style={{ width: '100%', height: '100%' }}
      />

      {tileWarning ? (
        <View style={styles.tileWarning} pointerEvents="none">
          <Text style={styles.tileWarningText}>
            Не удалось загрузить часть карты. Проверьте соединение.
          </Text>
        </View>
      ) : null}

      {isAdding ? (
        <View style={styles.addingBadge} pointerEvents="none">
          <Text style={styles.addingText}>Добавляем маркер…</Text>
        </View>
      ) : null}

      <MapStatusOverlay
        isLoading={isLoading}
        errorMessage={errorMessage}
        onRetry={handleRetry}
        onOpenList={openList}
        hint="Двойное нажатие на карте добавляет маркер."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tileWarning: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: '#fff4e5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tileWarningText: { color: '#8a5a00', fontSize: 12, textAlign: 'center' },
  addingBadge: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: 'rgba(32, 138, 239, 0.92)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  addingText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
});
