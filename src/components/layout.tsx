import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Layout } from '@/constants/theme';

export type Breakpoint = 'compact' | 'regular' | 'medium' | 'expanded';

/** Pure (unit-tested): classify a window width. */
export function breakpointFor(width: number): Breakpoint {
  const b = Layout.breakpoints;
  if (width < b.compact) return 'compact';
  if (width < b.regular) return 'regular';
  if (width < b.medium) return 'medium';
  return 'expanded';
}

/** Pure: columns for a card grid given content width. */
export const gridColumns = (contentWidth: number) => (contentWidth >= 720 ? 2 : 1);

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  const bp = breakpointFor(width);
  const landscape = width > height;
  return {
    width,
    height,
    bp,
    landscape,
    /** Phone in landscape: short viewport, keep chrome compact. */
    shortViewport: landscape && height < 500,
    compact: bp === 'compact',
    wide: bp === 'medium' || bp === 'expanded',
  };
}

/** Bottom padding a tab screen needs so content clears the floating tab bar. */
export function useTabInset() {
  const insets = useSafeAreaInsets();
  return Layout.tabBarHeight + Math.max(insets.bottom, 12) + 16;
}
