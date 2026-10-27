import { Colors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { resolveScheme, useSettings } from '@/store/settings';

/** Dark-first: honours the user's theme preference; "system" is light only when the OS says light. */
export function useIsDark() {
  const system = useColorScheme();
  const { theme } = useSettings();
  return resolveScheme(theme, system) === 'dark';
}

export function useTheme(): Palette {
  return useIsDark() ? Colors.dark : Colors.light;
}
