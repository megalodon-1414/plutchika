import * as THREE from 'three';
import type { AppBackgroundTheme } from './appBackgroundTheme';
import { blendHex } from './emotionColor';

export interface EmotionUiTheme {
  accent: string;
  accentMuted: string;
  accentSoft: string;
  accentBorder: string;
  accentBorderStrong: string;
  accentGlow: string;
  panelBackground: string;
  panelShadow: string;
  panelInset: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  divider: string;
  guideLine: string;
  guideLineHover: string;
  intensityGradientStart: string;
  intensityGradientEnd: string;
  controlBackground: string;
  controlBorder: string;
  controlText: string;
  shell: string;
  canvas: string;
  uiText: string;
  holoPrimary: string;
  holoPanel: string;
  holoBorder: string;
  holoGlow: string;
  holoText: string;
  holoSubtext: string;
  holoStripe: string;
  holoScan: string;
  markerColor: string;
}

export const DEFAULT_EMOTION_UI_ACCENT = '#6b5b95';

function hexToRgba(hex: string, alpha: number): string {
  const color = new THREE.Color(hex);
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function adjustLightness(hex: string, delta: number): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + delta, 0, 1));
  return `#${color.getHexString()}`;
}

/** 明るいアクセント（喜びなど）ではホログラム縞を弱め、暗い色は現状維持 */
function getHoloOverlayAlpha(hex: string, baseAlpha: number): number {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl);
  const brightnessDampen = THREE.MathUtils.clamp((hsl.l - 0.34) / 0.42, 0, 1);
  return baseAlpha * (1 - brightnessDampen * 0.78);
}

export function getEmotionUiTheme(
  accentHex: string,
  backgroundTheme: AppBackgroundTheme,
): EmotionUiTheme {
  const accent = accentHex;
  const accentMuted = blendHex(accent, '#ffffff', 0.32);
  const accentSoft = blendHex(accent, '#ffffff', 0.52);
  const accentDeep = blendHex(accent, '#000000', 0.38);

  if (backgroundTheme === 'dark') {
    const panelBase = blendHex(accent, '#0b0c10', 0.9);
    return {
      accent,
      accentMuted,
      accentSoft,
      accentBorder: hexToRgba(accentMuted, 0.34),
      accentBorderStrong: hexToRgba(accent, 0.68),
      accentGlow: hexToRgba(accent, 0.34),
      panelBackground: hexToRgba(panelBase, 0.9),
      panelShadow: `0 18px 40px rgba(0, 0, 0, 0.38), inset 10px 0 24px ${hexToRgba(accentSoft, 0.05)}`,
      panelInset: hexToRgba(accentSoft, 0.07),
      textPrimary: blendHex(accentSoft, '#f4ecf7', 0.62),
      textSecondary: blendHex(accentMuted, '#d8c7df', 0.48),
      textMuted: blendHex(accent, '#9f8aaa', 0.52),
      divider: hexToRgba(accentSoft, 0.14),
      guideLine: hexToRgba(accentSoft, 0.6),
      guideLineHover: hexToRgba(accentSoft, 0.42),
      intensityGradientStart: adjustLightness(accent, 0.14),
      intensityGradientEnd: accentDeep,
      controlBackground: hexToRgba(blendHex(accent, '#0c0a10', 0.88), 0.88),
      controlBorder: hexToRgba(accentMuted, 0.38),
      controlText: blendHex(accentSoft, '#f4ecf7', 0.68),
      shell: blendHex(accent, '#0b0c10', 0.95),
      canvas: blendHex(accent, '#030508', 0.93),
      uiText: '#ffffff',
      holoPrimary: adjustLightness(accent, 0.1),
      holoPanel: hexToRgba(blendHex(accent, '#041018', 0.82), 0.44),
      holoBorder: hexToRgba(adjustLightness(accent, 0.16), 0.56),
      holoGlow: hexToRgba(accent, 0.34),
      holoText: blendHex(accentSoft, '#e8f8ff', 0.45),
      holoSubtext: hexToRgba(accentMuted, 0.74),
      holoStripe: hexToRgba(accent, getHoloOverlayAlpha(accent, 0.1)),
      holoScan: hexToRgba(accent, getHoloOverlayAlpha(accent, 0.13)),
      markerColor: adjustLightness(accent, 0.12),
    };
  }

  const panelBase = blendHex(accent, '#ffffff', 0.88);
  return {
    accent: accentDeep,
    accentMuted: blendHex(accent, '#2a2a34', 0.35),
    accentSoft: blendHex(accent, '#ffffff', 0.25),
    accentBorder: hexToRgba(accentDeep, 0.28),
    accentBorderStrong: hexToRgba(accentDeep, 0.55),
    accentGlow: hexToRgba(accent, 0.2),
    panelBackground: hexToRgba(panelBase, 0.9),
    panelShadow: `0 18px 40px ${hexToRgba(accent, 0.12)}, inset 10px 0 24px ${hexToRgba(accentSoft, 0.08)}`,
    panelInset: hexToRgba(accentSoft, 0.1),
    textPrimary: blendHex(accentDeep, '#1f1f28', 0.55),
    textSecondary: blendHex(accentDeep, '#3a3a48', 0.45),
    textMuted: blendHex(accent, '#5a5a68', 0.5),
    divider: hexToRgba(accentDeep, 0.12),
    guideLine: hexToRgba(accentDeep, 0.42),
    guideLineHover: hexToRgba(accentDeep, 0.3),
    intensityGradientStart: adjustLightness(accent, -0.05),
    intensityGradientEnd: accentDeep,
    controlBackground: hexToRgba(blendHex(accent, '#ffffff', 0.9), 0.9),
    controlBorder: hexToRgba(accentDeep, 0.3),
    controlText: blendHex(accentDeep, '#2a2a34', 0.5),
    shell: blendHex(accent, '#e8e8ec', 0.9),
    canvas: blendHex(accent, '#d6d6dc', 0.88),
    uiText: '#1f1f28',
    holoPrimary: accentDeep,
    holoPanel: hexToRgba(blendHex(accent, '#f0f8fa', 0.85), 0.58),
    holoBorder: hexToRgba(accentDeep, 0.45),
    holoGlow: hexToRgba(accent, 0.18),
    holoText: blendHex(accentDeep, '#005566', 0.4),
    holoSubtext: hexToRgba(accentDeep, 0.72),
    holoStripe: hexToRgba(accent, getHoloOverlayAlpha(accent, 0.08)),
    holoScan: hexToRgba(accent, getHoloOverlayAlpha(accent, 0.1)),
    markerColor: accentDeep,
  };
}
