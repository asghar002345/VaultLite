import type { TextStyle } from 'react-native';

/** "Obsidian Aurora" — see docs/DESIGN.md. */
export const Colors = {
  light: {
    text: '#12131A',
    textSecondary: '#5D6170',
    background: '#F6F3EC',
    surface: '#FFFFFF',
    surfaceRaised: '#EFEAE0',
    border: '#E0D9CB',
    primary: '#0E9F79',
    onPrimary: '#FFFFFF',
    accent: '#5B4BE8',
    accentWarm: '#E2622F',
    danger: '#D7263D',
    warning: '#B7791F',
    onWarning: '#FFFFFF',
    success: '#0E9F79',
    scrim: '#12131A99',
    qrInk: '#07080C',
    qrPaper: '#F6F3EC',
  },
  dark: {
    text: '#F4F1EA',
    textSecondary: '#8E95A7',
    background: '#07080C',
    surface: '#10131B',
    surfaceRaised: '#171B26',
    border: '#232838',
    primary: '#5CF2C4',
    onPrimary: '#03130D',
    accent: '#8B7CFF',
    accentWarm: '#FF8A5C',
    danger: '#FF5D73',
    warning: '#FFC857',
    onWarning: '#1A1300',
    success: '#5CF2C4',
    scrim: '#000000AA',
    qrInk: '#07080C',
    qrPaper: '#F6F3EC',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof Palette;

export const ChainHue: Record<string, string> = {
  sepolia: '#8B7CFF',
  polygonAmoy: '#B07CFF',
  bscTestnet: '#FFC857',
  baseSepolia: '#4C8DFF',
  tronNile: '#FF5D73',
  solanaDevnet: '#5CF2C4',
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 64 } as const;
export const Radius = { sm: 8, md: 14, lg: 24, xl: 32, pill: 999 } as const;
export const FontSize = { caption: 12, label: 14, body: 16, title: 24, hero: 44 } as const;

/** Families registered in the root layout via useFonts(). */
export const Fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export const Tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** `#RRGGBB` + alpha (0..1) → `#RRGGBBAA`. Use instead of string-concatenating hex suffixes. */
export function alpha(hex: string, a: number) {
  const base = hex.length === 9 ? hex.slice(0, 7) : hex;
  return base + Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, '0').toUpperCase();
}

/** Layout tokens (responsive primitives read these). */
export const Layout = {
  maxContent: 560,
  maxContentWide: 960,
  breakpoints: { compact: 360, regular: 600, medium: 900 },
  tabBarHeight: 76,
} as const;
