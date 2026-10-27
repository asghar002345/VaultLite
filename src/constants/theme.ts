import type { TextStyle } from 'react-native';

/**
 * "Vault" (v3) — private-bank, quiet and spacious. See docs/V3_COMPARISON.md.
 * Dark is the only theme: the approved v3 references are dark-only ("Vault Dark (Enforced)"),
 * so `light` deliberately aliases the dark palette instead of shipping an unreviewed light look.
 */
const vault = {
  text: '#ECE8E1',
  textSecondary: '#9A9890',
  textTertiary: '#6E6C66',
  background: '#0B0C0E',
  surface: '#141619',
  surfaceRaised: '#1B1E22',
  border: '#262A30',
  primary: '#C8A46A',
  onPrimary: '#1A1408',
  accent: '#C8A46A',
  accentWarm: '#C8A46A',
  danger: '#C4574B',
  onDanger: '#ECE8E1',
  warning: '#C8A46A',
  onWarning: '#1A1408',
  success: '#9DB48A',
  scrim: '#000000B3',
  qrInk: '#0B0C0E',
  qrPaper: '#ECE8E1',
} as const;

export const Colors = { light: vault, dark: vault } as const;

export type Palette = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof Palette;

/** Chain marks stay monochrome bone/brass tints — no per-chain rainbow in v3. */
export const ChainHue: Record<string, string> = {
  sepolia: '#ECE8E1',
  polygonAmoy: '#ECE8E1',
  bscTestnet: '#C8A46A',
  baseSepolia: '#ECE8E1',
  tronNile: '#C8A46A',
  solanaDevnet: '#ECE8E1',
};

/** 8pt grid. Screen margin = lg (24); sections are separated by xl–xxl (32–48). */
export const Spacing = { xs: 4, sm: 8, smd: 12, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const;
export const Radius = { sm: 8, md: 12, lg: 16, xl: 16, pill: 999 } as const;
/** Type scale: display 48/52 serif, title 28/34 serif, headline 20/26, body 15/22, label 12/16 caps +0.08em, mono 13/18. */
export const FontSize = { caption: 12, label: 15, body: 15, headline: 20, title: 28, hero: 48, mono: 13 } as const;

/** Families registered in the root layout via useFonts(). */
export const Fonts = {
  display: 'InstrumentSerif_400Regular',
  displayMedium: 'InstrumentSerif_400Regular',
  ui: 'Geist_400Regular',
  uiMedium: 'Geist_500Medium',
  uiSemi: 'Geist_500Medium',
  mono: 'GeistMono_400Regular',
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
  tabBarHeight: 64,
  margin: 24,
} as const;
