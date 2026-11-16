import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useDatabase } from '../../contexts/DatabaseContext';
import ImageList from '../../components/ImageList';
import { ErrorBanner } from '../../components/Feedback';
import { confirmDestructive, showError } from '../../utils/confirm';
import { persistPickedImage } from '../../utils/imageStorage';
import { getErrorMessage } from '../../utils/logger';
import type { RootStackParamList } from '../../../types';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
}

export default function MarkerDetailScreen() {
  const { id } = useLocalSearchParams<RootStackParamList['marker/[id]']>();
  const router = useRouter();
  const {
    getMarker,
    deleteMarker,
    addImage,
    deleteImage,
    error,
    clearError,
    retryInitialization,
  } = useDatabase();

  const [isPicking, setIsPicking] = useState(false);

  const markerId = Number.parseInt(id ?? '', 10);
  const marker = Number.isInteger(markerId) ? getMarker(markerId) : null;

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  const pickImage = useCallback(async () => {
    if (!marker) {
      return;
    }

    setIsPicking(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showError(
          'Нет доступа к галерее',
          'Разрешите приложению доступ к фотографиям в настройках устройства.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        return;
      }

      // Сначала копируем файл в постоянное хранилище, затем пишем путь в базу.
      const storedUri = await persistPickedImage(asset.uri);
      await addImage(marker.id, storedUri);
    } catch (cause) {
      showError(
        'Ошибка',
        getErrorMessage(cause, 'Не удалось выбрать изображение. Попробуйте снова.')
      );
    } finally {
      setIsPicking(false);
    }
  }, [addImage, marker]);

  const handleDeleteImage = useCallback(
    async (imageId: number) => {
      try {
        await deleteImage(imageId);
      } catch {
        // Контекст уже сохранил ошибку — покажем её баннером.
      }
    },
    [deleteImage]
  );

  const confirmDeleteMarker = useCallback(() => {
    if (!marker) {
      return;
    }

    confirmDestructive(
      'Удалить маркер?',
      'Все привязанные изображения также будут удалены.',
      () => {
        void (async () => {
          try {
            await deleteMarker(marker.id);
            goBack();
          } catch {
            // Ошибка отобразится баннером на этом же экране.
          }
        })();
      }
    );
  }, [deleteMarker, goBack, marker]);

  if (!marker) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Маркер не найден</Text>
        <Text style={styles.notFoundHint}>
          Возможно, он уже удалён. Вернитесь к карте или к списку маркеров.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={goBack}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Назад</Text>
        </TouchableOpacity>
      </View>
    );
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

      <View style={styles.infoSection}>
        <Text style={styles.coordText}>
          Широта: {marker.latitude.toFixed(6)}
        </Text>
        <Text style={styles.coordText}>
          Долгота: {marker.longitude.toFixed(6)}
        </Text>
        <Text style={styles.createdText}>
          Создан: {formatDate(marker.createdAt)}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            isPicking ? styles.buttonDisabled : null,
          ]}
          onPress={pickImage}
          disabled={isPicking}
          accessibilityRole="button"
        >
          {isPicking ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Добавить изображение</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={goBack}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Назад к карте</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={confirmDeleteMarker}
          accessibilityRole="button"
        >
          <Text style={styles.dangerButtonText}>Удалить маркер</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>
        Изображения ({marker.images.length})
      </Text>

      <ImageList images={marker.images} onDelete={handleDeleteImage} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  notFoundText: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  notFoundHint: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  infoSection: {
    backgroundColor: '#f0f4f8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  coordText: { fontSize: 16, fontFamily: 'monospace' },
  createdText: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  actions: { marginBottom: 20, gap: 10 },
  primaryButton: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  secondaryButton: {
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#1b5fb3', fontSize: 15, fontWeight: '600' },
  dangerButton: {
    backgroundColor: '#fdecea',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: { color: '#a94442', fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
});
