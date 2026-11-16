/** Небольшие переиспользуемые состояния экрана: загрузка и баннер ошибки. */

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export function LoadingView({ text = 'Загрузка…' }: { text?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#208AEF" />
      <Text style={styles.loadingText}>{text}</Text>
    </View>
  );
}

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/**
 * Баннер не скрывает данные: список маркеров остаётся доступным даже если
 * последняя операция завершилась ошибкой.
 */
export function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{message}</Text>
      <View style={styles.bannerActions}>
        {onRetry ? (
          <TouchableOpacity onPress={onRetry} accessibilityRole="button">
            <Text style={styles.bannerAction}>Повторить</Text>
          </TouchableOpacity>
        ) : null}
        {onDismiss ? (
          <TouchableOpacity onPress={onDismiss} accessibilityRole="button">
            <Text style={styles.bannerAction}>Скрыть</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: { marginTop: 12, color: '#52606d', fontSize: 14 },
  banner: {
    backgroundColor: '#fdecea',
    borderLeftWidth: 4,
    borderLeftColor: '#d9534f',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 6,
  },
  bannerText: { color: '#8a2c28', fontSize: 13, lineHeight: 18 },
  bannerActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  bannerAction: { color: '#1b5fb3', fontSize: 13, fontWeight: '600' },
});
