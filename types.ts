/**
 * Доменные типы приложения.
 *
 * В базе данных поля называются в snake_case (`marker_id`, `created_at`),
 * а в UI используется camelCase. Преобразование выполняется в
 * `database/operations.ts`, поэтому компоненты работают только с этими типами.
 */

export interface MarkerImage {
  id: number;
  markerId: number;
  uri: string;
  createdAt: string;
}

export interface Marker {
  id: number;
  latitude: number;
  longitude: number;
  createdAt: string;
  images: MarkerImage[];
}

/** Параметры навигации для экранов приложения. */
export type RootStackParamList = {
  index: undefined;
  markers: undefined;
  'marker/[id]': { id: string };
};
