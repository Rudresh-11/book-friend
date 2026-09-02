import { useColorScheme } from 'react-native';
import { useLibrary } from './store';

export type Palette = {
  dark: boolean;
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  border: string;
  danger: string;
  good: string;
};

const light: Palette = {
  dark: false,
  bg: '#FBF7F0',
  card: '#FFFFFF',
  cardAlt: '#F4EEE3',
  text: '#1C1917',
  muted: '#6F675E',
  faint: '#A8A29E',
  accent: '#A2571A',
  accentSoft: '#F3E3D0',
  border: '#E8DFD1',
  danger: '#B23B3B',
  good: '#2F7D5A',
};

const dark: Palette = {
  dark: true,
  bg: '#12100D',
  card: '#1D1915',
  cardAlt: '#26211B',
  text: '#F3EDE3',
  muted: '#A9A096',
  faint: '#6F675E',
  accent: '#E9A23B',
  accentSoft: '#3A2C17',
  border: '#312A22',
  danger: '#E07A6E',
  good: '#66C79A',
};

export function useTheme(): Palette {
  const system = useColorScheme();
  const pref = useLibrary((s) => s.settings.theme);
  const mode = pref === 'system' ? system ?? 'light' : pref;
  return mode === 'dark' ? dark : light;
}

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const space = (n: number) => n * 4;
