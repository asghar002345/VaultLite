import Constants from 'expo-constants';

export const PLACEHOLDER = 'REPLACE_ME';

type Extra = { reownProjectId?: string };

export function resolveReownProjectId(
  envValue: string | undefined = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID,
  extra: Extra | undefined = Constants.expoConfig?.extra as Extra | undefined,
): string {
  return envValue?.trim() || extra?.reownProjectId?.trim() || PLACEHOLDER;
}

export const env = {
  REOWN_PROJECT_ID: resolveReownProjectId(),
  /** Hard guard: this build only ever talks to testnets. */
  TESTNET_ONLY: true as const,
};

export const isReownConfigured = () => env.REOWN_PROJECT_ID !== PLACEHOLDER;
