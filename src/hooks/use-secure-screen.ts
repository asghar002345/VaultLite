import { usePreventScreenCapture } from 'expo-screen-capture';

/**
 * Block screenshots / screen recording (Android FLAG_SECURE; iOS hides content in recordings
 * and the app switcher) while a screen showing secrets or PINs is mounted.
 */
export function useSecureScreen(key: string) {
  usePreventScreenCapture(`vaultlite-${key}`);
}
