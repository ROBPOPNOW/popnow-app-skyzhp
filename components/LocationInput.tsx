import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface LocationResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    suburb?: string;
    locality?: string;
    neighbourhood?: string;
    quarter?: string;
    village?: string;
    town?: string;
    municipality?: string;
    city_district?: string;
    city?: string;
    county?: string;
    state_district?: string;
    state?: string;
    country?: string;
    [key: string]: string | undefined;
  };
}

interface LocationInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onLocationSelect: (locationName: string, latitude: number, longitude: number) => void;
}

export default function LocationInput({ value, onChangeText, onLocationSelect }: LocationInputProps) {
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(false);

  useEffect(() => {
    if (selectedLocation) return;
    if (value.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const encoded = encodeURIComponent(value.trim());
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&addressdetails=1`,
          { headers: { 'User-Agent': 'POPNOW/1.0' } }
        );
        const data: LocationResult[] = await response.json();
        setResults(data);
        setShowDropdown(data.length > 0);
      } catch (error) {
        console.error('Location search error:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [value, selectedLocation]);

  const formatDisplayName = (result: LocationResult): string => {
    const parts: string[] = [];
    const addr = result.address as any;

    // Most specific place name first — covers NZ suburbs/localities
    const place =
      addr.suburb ||
      addr.locality ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.village ||
      addr.town ||
      addr.municipality ||
      addr.city_district ||
      addr.city;

    if (place) parts.push(place);

    // City/region level
    const region =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.county ||
      addr.state_district;

    // Only add region if it's different from place
    if (region && region !== place) parts.push(region);

    // State/region
    if (addr.state && addr.state !== place && addr.state !== region) {
      parts.push(addr.state);
    }

    if (addr.country) parts.push(addr.country);

    return parts.length > 0
      ? parts.join(', ')
      : result.display_name.split(',').slice(0, 4).join(',').trim();
  };

  const handleSelect = (result: LocationResult) => {
    const formatted = formatDisplayName(result);
    setSelectedLocation(true);
    setShowDropdown(false);
    setResults([]);
    onChangeText(formatted);
    onLocationSelect(formatted, parseFloat(result.lat), parseFloat(result.lon));
  };

  const handleChangeText = (text: string) => {
    setSelectedLocation(false);
    onChangeText(text);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <IconSymbol
          ios_icon_name="location.fill"
          android_material_icon_name="location-on"
          size={18}
          color={colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChangeText}
          placeholder="Enter your city (e.g. Auckland, Tokyo)"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {isSearching && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
        {!isSearching && selectedLocation && (
          <IconSymbol
            ios_icon_name="checkmark.circle.fill"
            android_material_icon_name="check-circle"
            size={20}
            color="#10B981"
          />
        )}
      </View>

      {showDropdown && results.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={results}
            keyExtractor={(item, index) => `${item.lat}-${item.lon}-${index}`}
            keyboardShouldPersistTaps="always"
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.dropdownItem,
                  index < results.length - 1 && styles.dropdownItemBorder,
                  pressed && styles.dropdownItemPressed,
                ]}
                onPress={() => handleSelect(item)}
              >
                <IconSymbol
                  ios_icon_name="mappin.circle.fill"
                  android_material_icon_name="place"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.dropdownText} numberOfLines={2}>
                  {formatDisplayName(item)}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 100,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 14,
  },
  dropdown: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemPressed: {
    backgroundColor: colors.surface,
  },
  dropdownText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});