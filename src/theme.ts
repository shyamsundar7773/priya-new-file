import type { Theme } from './types';

export const themePalette = {
  dark: {
    bg: '#0F172A',
    card: '#111827',
    panel: '#1F2937',
    primary: '#FF7AA2',
    accent: '#8B5CF6',
    text: '#F8FAFC',
    subtext: '#A5B4CF',
    border: '#334155',
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    cta: '#FFB3C1',
  },
  light: {
    bg: '#F4F7FB',
    card: '#FFFFFF',
    panel: '#EEF3F9',
    primary: '#C04E70',
    accent: '#7C5CFF',
    text: '#0F172A',
    subtext: '#5B6477',
    border: '#D8E1EE',
    success: '#1F9D72',
    warning: '#EAB308',
    error: '#DC2626',
    cta: '#F7A0BC',
  },
} as const;

export function getPalette(theme: Theme) {
  return themePalette[theme];
}
