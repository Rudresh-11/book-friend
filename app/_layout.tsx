import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '../src/theme';

export default function RootLayout() {
  const t = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/new" options={{ title: 'Add a book', presentation: 'modal' }} />
        <Stack.Screen name="book/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="book/[id]/edit" options={{ title: 'Edit book', presentation: 'modal' }} />
        <Stack.Screen name="section/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="section/[id]/scan" options={{ title: 'Page scans' }} />
        <Stack.Screen name="ai" options={{ title: 'AI bridge', presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
