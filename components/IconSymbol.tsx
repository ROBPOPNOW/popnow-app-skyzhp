
import React from "react";
import { SymbolWeight } from "expo-symbols";
import {
  OpaqueColorValue,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

// Mapping of SF Symbols to Material Icons (for backward compatibility)
const MAPPING = {
  'house.fill': 'home',
  'magnifyingglass': 'search',
  'plus': 'add',
  'person.fill': 'person',
  'map.fill': 'map',
  'video.fill': 'videocam',
  'heart': 'favorite-border',
  'heart.fill': 'favorite',
  'bubble.left.fill': 'chat-bubble',
  'bubble.left': 'chat-bubble-outline',
  'arrowshape.turn.up.right.fill': 'share',
  'mappin.circle.fill': 'location-on',
  'mappin.circle': 'location-on',
  'mappin.slash.circle': 'location-off',
  'xmark': 'close',
  'checkmark.circle.fill': 'check-circle',
  'sparkles': 'auto-awesome',
  'clock.fill': 'schedule',
  'exclamationmark.triangle.fill': 'warning',
  'envelope.fill': 'email',
  'lock.fill': 'lock',
  'location.fill': 'my-location',
  'arrow.down.circle.fill': 'download',
  'binoculars.fill': 'search',
  'binoculars': 'search',
  'paperplane.fill': 'send',
} as const;

export type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({
  ios_icon_name,
  android_material_icon_name,
  name,
  size = 24,
  color,
  style,
}: {
  ios_icon_name?: string;
  android_material_icon_name?: string;
  name?: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  // Priority: android_material_icon_name > name (mapped) > fallback
  let iconName: string;
  
  if (android_material_icon_name) {
    // Use the provided Material icon name directly
    iconName = android_material_icon_name;
  } else if (name && MAPPING[name]) {
    // Use the mapping for backward compatibility
    iconName = MAPPING[name];
  } else {
    // Fallback to help icon
    console.warn(`IconSymbol: Invalid icon name provided. ios_icon_name="${ios_icon_name}", android_material_icon_name="${android_material_icon_name}", name="${name}"`);
    iconName = 'help';
  }
  
  return (
    <MaterialIcons
      name={iconName as any}
      size={size}
      color={color as string}
      style={style as StyleProp<TextStyle>}
    />
  );
}
