/**
 * Наложение поверх карты для состояний «загрузка» и «ошибка».
 *
 * Раньше ошибка заменяла весь контейнер карты: после «Повторить» карта
 * создавалась заново, а Leaflet на веб терял ссылку на уже удалённый DOM-узел.
 * Теперь карта всегда смонтирована, а поверх неё показывается слой.
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface MapStatusOverlayProps {
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onOpenList: () => void;
  /** Подсказка под сообщением об ошибке. */
  hint?: string;
}

export default function MapStatusOverlay({
  isLoading,
  errorMessage,
  onRetry,
  onOpenList,
  hint,
}: MapStatusOverlayProps) {
  if (!isLoading && !errorMessage) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        {isLoading ? (
          <>
            <ActivityIndicator size="large" color="#208AEF" />
            <Text style={styles.title}>Загружаем базу данных…</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Не удалось загрузить данные</Text>
            <Text style={styles.message}>{errorMessage}</Text>
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={onRetry}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>Повторить</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={onOpenList}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Список маркеров</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2933',
    marginTop: 12,
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#a94442',
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', marginTop: 16, gap: 8 },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryButton: { backgroundColor: '#208AEF' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: { backgroundColor: '#e8f0fe' },
  secondaryButtonText: { color: '#1b5fb3', fontWeight: '600' },
});
