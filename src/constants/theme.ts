import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0D12',
    textSecondary: '#5B6170',
    background: '#FFFFFF',
    surface: '#F2F3F7',
    border: '#DDE0E7',
    primary: '#3B5BFD',
    onPrimary: '#FFFFFF',
    danger: '#D92D20',
    warning: '#F79009',
    onWarning: '#1A1300',
    success: '#12B76A',
  },
  dark: {
    text: '#F5F6FA',
    textSecondary: '#A0A6B5',
    background: '#0B0D12',
    surface: '#161A22',
    border: '#272C38',
    primary: '#6F86FF',
    onPrimary: '#0B0D12',
    danger: '#F97066',
    warning: '#FDB022',
    onWarning: '#1A1300',
    success: '#32D583',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof Palette;

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 64 } as const;
export const Radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;
export const FontSize = { caption: 12, body: 16, title: 22, hero: 32 } as const;
export const Fonts = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};
