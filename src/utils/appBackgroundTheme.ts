export type AppBackgroundTheme = 'dark' | 'light';

export interface BackgroundThemeColors {
  shell: string;
  canvas: string;
  uiText: string;
  controlBackground: string;
  controlBorder: string;
  controlText: string;
}

export const BACKGROUND_THEME_COLORS: Record<AppBackgroundTheme, BackgroundThemeColors> = {
  dark: {
    shell: '#0b0c10',
    canvas: '#030508',
    uiText: '#ffffff',
    controlBackground: 'rgba(12, 10, 16, 0.88)',
    controlBorder: 'rgba(195, 155, 211, 0.36)',
    controlText: '#f4ecf7',
  },
  light: {
    shell: '#e8e8ec',
    canvas: '#d6d6dc',
    uiText: '#1f1f28',
    controlBackground: 'rgba(255, 255, 255, 0.88)',
    controlBorder: 'rgba(120, 120, 140, 0.36)',
    controlText: '#2a2a34',
  },
};

export function getBackgroundThemeColors(theme: AppBackgroundTheme): BackgroundThemeColors {
  return BACKGROUND_THEME_COLORS[theme];
}
