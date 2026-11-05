import { Platform, type TextStyle } from 'react-native';

/**
 * "Vault" (v3) — private-bank, quiet and spacious. See docs/V3_COMPARISON.md.
 * Dark is the only theme: the approved v3 references are dark-only ("Vault Dark (Enforced)"),
 * so `light` deliberately aliases the dark palette instead of shipping an unreviewed light look.
 */
const vault = {
  text: '#ECE8E1',
  textSecondary: '#9A9890',
  /** Was #6E6C66 (3.7:1 on background, fails WCAG AA). #8C8A83 = 5.7:1 bg / 4.8:1 raised. */
  textTertiary: '#8C8A83',
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
  /** Market direction (always paired with sign + ▲/▼, never colour alone). up 8.7:1, down 6.3:1 on background. */
  priceUp: '#9DB48A',
  priceDown: '#D9776B',
  priceFlat: '#9A9890',
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

/**
 * Hybrid type (Phase 2 decision): platform system font for UI text and numbers — SF Pro on iOS
 * ('System'), Roboto on Android ('sans-serif' / 'sans-serif-medium'), the OS stack on web.
 * No Apple fonts are bundled. Instrument Serif stays for headings; Geist Mono only for addresses/hashes.
 */
const SYSTEM = Platform.select({ ios: 'System', android: 'sans-serif', default: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' })!;
const SYSTEM_MEDIUM = Platform.select({ ios: 'System', android: 'sans-serif-medium', default: SYSTEM })!;
export const Fonts = {
  display: 'InstrumentSerif_400Regular',
  displayMedium: 'InstrumentSerif_400Regular',
  ui: SYSTEM,
  uiMedium: SYSTEM_MEDIUM,
  uiSemi: SYSTEM_MEDIUM,
  mono: 'GeistMono_400Regular',
} as const;

/** iOS 'System' needs an explicit weight; Android picks weight from the family name. */
export const Weight = { regular: '400', medium: '500', semibold: '600' } as const;

/**
 * Apple-style text roles (HIG names) mapped onto the v3 scale. Components pick a role, not a size.
 * Dynamic Type: RN scales these with the OS setting; big display numbers cap via MaxScale.
 */
export const TextRoles = {
  largeTitle: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  title: { fontFamily: 'InstrumentSerif_400Regular', fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  headline: { fontFamily: SYSTEM_MEDIUM, fontWeight: Weight.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: SYSTEM, fontWeight: Weight.regular, fontSize: 15, lineHeight: 22 },
  callout: { fontFamily: SYSTEM_MEDIUM, fontWeight: Weight.medium, fontSize: 15, lineHeight: 22 },
  footnote: { fontFamily: SYSTEM, fontWeight: Weight.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: SYSTEM, fontWeight: Weight.regular, fontSize: 12, lineHeight: 16 },
  numeric: { fontFamily: SYSTEM_MEDIUM, fontWeight: Weight.medium, fontSize: 15, lineHeight: 22, fontVariant: ['tabular-nums'] },
  displayNumber: { fontFamily: SYSTEM, fontWeight: '300', fontSize: 44, lineHeight: 52, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
} as const satisfies Record<string, TextStyle>;

/** Dynamic Type caps for elements that would break layout when scaled further. */
export const MaxScale = { display: 1.3, tabBar: 1.2, body: 2 } as const;

/** Minimum touch target (Apple HIG 44pt / Material 48dp → use 44 minimum). */
export const HitTarget = 44;

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
