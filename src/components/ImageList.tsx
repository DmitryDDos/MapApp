import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { MarkerImage } from '../../types';
import { confirmDestructive } from '../utils/confirm';

interface ImageListProps {
  images: MarkerImage[];
  onDelete: (imageId: number) => void | Promise<void>;
}

export default function ImageList({ images, onDelete }: ImageListProps) {
  const [pendingId, setPendingId] = useState<number | null>(null);

  const remove = async (imageId: number) => {
    setPendingId(imageId);
    try {
      await onDelete(imageId);
    } finally {
      setPendingId(null);
    }
  };

  const confirmDelete = (imageId: number) => {
    confirmDestructive(
      'Удалить изображение?',
      'Это действие нельзя отменить.',
      () => {
        void remove(imageId);
      }
    );
  };

  const renderItem = ({ item }: { item: MarkerImage }) => {
    const isPending = pendingId === item.id;

    return (
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: item.uri }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={`Изображение ${item.id}`}
        />
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => confirmDelete(item.id)}
          accessibilityLabel="Удалить изображение"
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.deleteText}>✕</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <FlatList
      data={images}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <Text style={styles.emptyText}>Нет изображений. Добавьте первое!</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 20 },
  imageWrapper: {
    marginBottom: 16,
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e1e1e1',
  },
  image: {
    width: '100%',
    height: undefined,
    aspectRatio: 16 / 9,
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 20 },
});
