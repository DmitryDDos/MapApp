import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Marker } from '../../types';
import { confirmDestructive } from '../utils/confirm';

interface MarkerListProps {
  markers: Marker[];
  onSelect: (markerId: number) => void;
  onRemove: (markerId: number) => void | Promise<void>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export default function MarkerList({
  markers,
  onSelect,
  onRemove,
}: MarkerListProps) {
  const [pendingId, setPendingId] = useState<number | null>(null);

  const remove = async (id: number) => {
    setPendingId(id);
    try {
      await onRemove(id);
    } finally {
      setPendingId(null);
    }
  };

  const confirmRemove = (id: number) => {
    confirmDestructive(
      'Удалить маркер?',
      'Все изображения также будут удалены.',
      () => {
        void remove(id);
      }
    );
  };

  const renderItem = ({ item }: { item: Marker }) => {
    const isPending = pendingId === item.id;

    return (
      <View style={styles.item}>
        <TouchableOpacity
          style={styles.itemContent}
          onPress={() => onSelect(item.id)}
          accessibilityLabel={`Маркер ${item.id}`}
          disabled={isPending}
        >
          <Text style={styles.coordText}>
            Широта: {item.latitude.toFixed(6)}
          </Text>
          <Text style={styles.coordText}>
            Долгота: {item.longitude.toFixed(6)}
          </Text>
          <Text style={styles.metaText}>
            Изображений: {item.images.length} · {formatDate(item.createdAt)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => confirmRemove(item.id)}
          accessibilityLabel="Удалить маркер"
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#a94442" />
          ) : (
            <Text style={styles.deleteText}>✕</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <FlatList
      data={markers}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Пока нет маркеров. Двойное нажатие на карте (в вебе) или долгое
            нажатие (на телефоне) добавит первый.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16 },
  item: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  itemContent: { flex: 1, padding: 12 },
  coordText: { fontSize: 14, fontFamily: 'monospace' },
  metaText: { fontSize: 12, color: '#666', marginTop: 4 },
  deleteButton: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8d7da',
  },
  deleteText: { color: '#a94442', fontSize: 18, fontWeight: 'bold' },
  emptyContainer: { padding: 24, alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#888' },
});
