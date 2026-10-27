import { Colors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Dark-first: light only when the OS explicitly reports light. */
export function useIsDark() {
  return useColorScheme() !== 'light';
}

export function useTheme(): Palette {
  return useIsDark() ? Colors.dark : Colors.light;
}
