import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    accent: '#2563EB',
    accentText: '#FFFFFF',
    accentBackground: '#E6EEFD',
    success: '#15803D',
    successBackground: '#DCFCE7',
    warning: '#B45309',
    warningBackground: '#FEF3C7',
    danger: '#B91C1C',
    dangerBackground: '#FEE2E2',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: '#60A5FA',
    accentText: '#0B1220',
    accentBackground: '#13233F',
    success: '#4ADE80',
    successBackground: '#13301E',
    warning: '#FBBF24',
    warningBackground: '#36290A',
    danger: '#F87171',
    dangerBackground: '#3A1616',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
