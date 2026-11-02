import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SyncProvider } from '../lib/syncContext';

export default function RootLayout() {
  return (
    <SyncProvider>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Track' }} />
        <Stack.Screen name="detail" options={{ title: 'Transaction' }} />
      </Stack>
    </SyncProvider>
  );
}
