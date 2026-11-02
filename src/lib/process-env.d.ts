// Minimal typing for the one Expo-inlined env var we read. Expo's babel
// preset replaces process.env.EXPO_PUBLIC_* at bundle time, so this never
// touches a real Node process object on device.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
  }
}

declare const process: { env: NodeJS.ProcessEnv };
