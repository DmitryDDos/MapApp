/**
 * Типы для платформенного компонента карты.
 *
 * Сам компонент существует в двух реализациях — `Map.native.tsx` (react-native-maps)
 * и `Map.web.tsx` (Leaflet). Metro выбирает нужную по расширению, а TypeScript
 * такого выбора не делает, поэтому здесь описано только то, что общего у обеих
 * реализаций: компонент без пропсов.
 */
import type { ComponentType } from 'react';

declare const Map: ComponentType;
export default Map;
