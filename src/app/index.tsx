import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Map from '../components/Map';
import { useDatabase } from '../contexts/DatabaseContext';

export default function HomeScreen() {
  const router = useRouter();
  const { markers } = useDatabase();

  return (
    <View style={styles.container}>
      <Map />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/markers')}
        accessibilityLabel="Открыть список маркеров"
        accessibilityRole="button"
      >
        <Text style={styles.fabText}>☰</Text>
        {markers.length > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{markers.length}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#208AEF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: 'white', fontSize: 22 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#d9534f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
});
