import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import notifee from '@notifee/react-native';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {
  /* reloading the app might cause this error. */
});

// Register the Notifee foreground service
notifee.registerForegroundService((notification) => {
  return new Promise(() => {
    console.log('[Background Task] Persistent service active');
  });
});

// Suppress background event warning
notifee.onBackgroundEvent(async () => {});

export default function RootLayout() {
  useEffect(() => {
    // Small delay to ensure everything is mounted before hiding the splash screen
    const prepare = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        await SplashScreen.hideAsync();
      }
    };
    prepare();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#FFFFFF' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="guide" />
        <Stack.Screen name="custom-commands" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
});
