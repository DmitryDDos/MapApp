import { Platform, Alert } from 'react-native';

export function confirmDestructive(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = 'Удалить'
) {
  if (Platform.OS === 'web') {
    const ok =
      typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function showError(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }
  Alert.alert(title, message);
}