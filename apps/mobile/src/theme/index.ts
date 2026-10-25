import { useColorScheme } from 'react-native';

export interface Palette {
  background: string;
  card: string;
  cardAlt: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primaryText: string;
  positive: string;
  negative: string;
  warning: string;
  pro: string;
  /** Colores para series y distribución (orden fijo por categoría). */
  series: string[];
}

const light: Palette = {
  background: '#F5F6F8',
  card: '#FFFFFF',
  cardAlt: '#EEF0F4',
  text: '#11151C',
  muted: '#5D6675',
  border: '#DDE1E7',
  primary: '#2453D6',
  primaryText: '#FFFFFF',
  positive: '#0E8A4F',
  negative: '#C9302C',
  warning: '#A86400',
  pro: '#7A4DE0',
  series: ['#2453D6', '#E07B22', '#16A07A', '#C2417C', '#7A4DE0', '#2C9CC4', '#B08A12', '#6B7280'],
};

const dark: Palette = {
  background: '#0B0E13',
  card: '#151A22',
  cardAlt: '#1D232E',
  text: '#ECEFF4',
  muted: '#98A2B3',
  border: '#2A313D',
  primary: '#6F97FF',
  primaryText: '#0B0E13',
  positive: '#3DD68C',
  negative: '#FF6B66',
  warning: '#F2B33D',
  pro: '#A98BFF',
  series: ['#6F97FF', '#F59C4C', '#3CC9A0', '#E2709F', '#A98BFF', '#58C0E6', '#D8B43C', '#9AA3B2'],
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;
