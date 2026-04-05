import { StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@react-navigation/native';

export default function FormSheetModal() {
  const theme = useTheme();
  const backgroundColor = theme.dark ? 'rgb(28, 28, 30)' : theme.colors.background;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Form Sheet Modal</Text>
      <Text style={[styles.text, { color: theme.colors.text }]}>Drag the grabber to resize!</Text>
      <Pressable onPress={() => router.back()}>
        <View style={styles.button}>
          <Text style={[styles.buttonText, { color: theme.colors.primary }]}>Close Modal</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  text: { fontSize: 16, marginBottom: 24, textAlign: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)' },
  buttonText: { fontSize: 16, fontWeight: '600' },
});