import React from "react";
import { Platform, OpaqueColorValue, StyleProp, TextStyle, ViewStyle } from "react-native";
import { SymbolView, SymbolWeight } from "expo-symbols";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

// Mapping of SF Symbols to Material Icons
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
  'arrow.clockwise': 'refresh',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'gearshape': 'settings',
  'gearshape.fill': 'settings',
  'star.fill': 'star',
  'doc.text': 'description',
  'lock.shield': 'privacy-tip',
  'arrow.right.square': 'logout',
  'info.circle.fill': 'info',
  'scope': 'gps-fixed',
  'circle': 'circle',
  'circle.circle': 'adjust',
  'arrow.up.circle.fill': 'cloud-upload',
} as const;

export type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({
  ios_icon_name,
  android_material_icon_name,
  name,
  size = 24,
  color,
  style,
  weight = "regular",
}: {
  ios_icon_name?: string;
  android_material_icon_name?: string;
  name?: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  // ✅ iOS: Use SF Symbols (native iOS icons)
  if (Platform.OS === 'ios') {
    const iosName = ios_icon_name || (name && MAPPING[name] ? name : undefined);
    
    if (!iosName) {
      console.warn(`IconSymbol: No iOS icon name provided. ios_icon_name="${ios_icon_name}", name="${name}"`);
      return (
        <MaterialIcons
          name="help"
          size={size}
          color={color as string}
          style={style as StyleProp<TextStyle>}
        />
      );
    }

    return (
      <SymbolView
        name={iosName}
        size={size}
        tintColor={color}
        weight={weight}
        style={style}
      />
    );
  }

  // ✅ Android: Use Material Icons
  let iconName: string;
  
  if (android_material_icon_name) {
    iconName = android_material_icon_name;
  } else if (name && MAPPING[name]) {
    iconName = MAPPING[name];
  } else {
    console.warn(`IconSymbol: Invalid icon name for Android. android_material_icon_name="${android_material_icon_name}", name="${name}"`);
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