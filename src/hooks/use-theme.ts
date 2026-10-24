import { Colors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? Colors.dark : Colors.light;
}
