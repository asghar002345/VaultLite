import * as LocalAuthentication from 'expo-local-authentication';

export async function biometricsAvailable(): Promise<boolean> {
  const [hw, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hw && enrolled;
}

export async function confirmBiometric(promptMessage: string): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage, disableDeviceFallback: true });
  return r.success;
}
