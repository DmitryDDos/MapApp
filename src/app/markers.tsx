import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDatabase } from '../contexts/DatabaseContext';
import MarkerList from '../components/MarkerList';
import { ErrorBanner, LoadingView } from '../components/Feedback';
import { getErrorMessage } from '../utils/logger';

export default function MarkersScreen() {
  const router = useRouter();
  const {
    markers,
    deleteMarker,
    isLoading,
    error,
    clearError,
    retryInitialization,
  } = useDatabase();

  const handleSelect = useCallback(
    (id: number) => {
      router.push({
        pathname: '/marker/[id]',
        params: { id: String(id) },
      });
    },
    [router]
  );

  const handleRemove = useCallback(
    async (id: number) => {
      try {
        await deleteMarker(id);
      } catch {
        // Ошибка уже сохранена в контексте и показана баннером ниже.
      }
    },
    [deleteMarker]
  );

  if (isLoading) {
    return <LoadingView text="Загружаем маркеры…" />;
  }

  return (
    <View style={styles.container}>
      {error ? (
        <ErrorBanner
          message={getErrorMessage(error)}
          onRetry={retryInitialization}
          onDismiss={clearError}
        />
      ) : null}
      <MarkerList
        markers={markers}
        onSelect={handleSelect}
        onRemove={handleRemove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
