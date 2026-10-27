import { Colors, type Palette } from '@/constants/theme';

/**
 * v3 is dark-only (the approved references enforce "Vault Dark"). The stored theme preference
 * and `resolveScheme` are kept for compatibility, but the app always renders the dark palette.
 */
export function useIsDark() {
  return true;
}

export function useTheme(): Palette {
  return Colors.dark;
}
