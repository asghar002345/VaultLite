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
