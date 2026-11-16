import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, {
  Marker,
  type LongPressEvent,
  type Region,
} from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useDatabase } from '../contexts/DatabaseContext';
import { getErrorMessage } from '../utils/logger';
import MapStatusOverlay from './MapStatusOverlay';

const INITIAL_REGION: Region = {
  latitude: 55.751244,
  longitude: 37.618423,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

interface MapState {
  /** Сколько маркеров было при прошлом рендере. */
  markerCount: number;
  /** Ключ `MapView`: увеличение пересоздаёт нативную карту. */
  mapKey: number;
}

export default function Map() {
  const router = useRouter();
  const { markers, addMarker, isLoading, error, isReady, retryInitialization } =
    useDatabase();

  const [isAdding, setIsAdding] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [mapState, setMapState] = useState<MapState>({
    markerCount: markers.length,
    mapKey: 0,
  });

  /**
   * Обновление состояния во время рендера — рекомендованный React способ
   * «подстроить» состояние под изменившиеся данные (см. «Adjusting state when
   * a prop changes»). Здесь это нужно для обхода бага react-native-maps:
   * на Android (Fabric) после удаления маркера иногда остаётся «фантомная»
   * метка. Как только маркеров стало меньше, карта пересоздаётся, а
   * сохранённый `region` не даёт ей «прыгнуть» в начальную точку.
   */
  if (markers.length !== mapState.markerCount) {
    setMapState({
      markerCount: markers.length,
      mapKey:
        markers.length < mapState.markerCount
          ? mapState.mapKey + 1
          : mapState.mapKey,
    });
  }

  const handleRegionChangeComplete = useCallback((nextRegion: Region) => {
    setRegion(nextRegion);
  }, []);

  const handleLongPress = useCallback(
    async (event: LongPressEvent) => {
      if (isAdding) {
        return;
      }

      setIsAdding(true);

      try {
        const { latitude, longitude } = event.nativeEvent.coordinate;
        const id = await addMarker(latitude, longitude);

        router.push({
          pathname: '/marker/[id]',
          params: { id: String(id) },
        });
      } catch (cause) {
        setMapError(getErrorMessage(cause, 'Не удалось добавить маркер'));
      } finally {
        setIsAdding(false);
      }
    },
    [addMarker, isAdding, router]
  );

  const goToMarker = useCallback(
    (id: number) => {
      router.push({
        pathname: '/marker/[id]',
        params: { id: String(id) },
      });
    },
    [router]
  );

  const handleRetry = useCallback(() => {
    setMapError(null);
    if (!isReady) {
      retryInitialization();
    }
  }, [isReady, retryInitialization]);

  const openList = useCallback(() => router.push('/markers'), [router]);

  const errorMessage = error ? getErrorMessage(error) : mapError;

  return (
    <View style={styles.container}>
      <MapView
        key={mapState.mapKey}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChangeComplete}
        onLongPress={handleLongPress}
        loadingEnabled
        loadingIndicatorColor="#208AEF"
        loadingBackgroundColor="#f4f7fb"
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            identifier={String(marker.id)}
            coordinate={{
              latitude: marker.latitude,
              longitude: marker.longitude,
            }}
            title="Нажмите для деталей"
            description={`Изображений: ${marker.images.length}`}
            onPress={() => goToMarker(marker.id)}
          />
        ))}
      </MapView>

      <MapStatusOverlay
        isLoading={isLoading}
        errorMessage={errorMessage}
        onRetry={handleRetry}
        onOpenList={openList}
        hint="Долгое нажатие на карте добавляет маркер."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
});
