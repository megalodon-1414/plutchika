import * as THREE from 'three';

const atmosphereFogColor = new THREE.Color('#030508');

export function setAtmosphereFogColor(hex: string): void {
  atmosphereFogColor.set(hex);
}
export const ATMOSPHERE_NEAR_DISTANCE = 4;
export const ATMOSPHERE_FAR_DISTANCE = 18;
export const ATMOSPHERE_MIN_OPACITY = 0.22;
const NEAR_DISTANCE = ATMOSPHERE_NEAR_DISTANCE;
const FAR_DISTANCE = ATMOSPHERE_FAR_DISTANCE;
const MIN_OPACITY = ATMOSPHERE_MIN_OPACITY;
const SELECTED_MIN_OPACITY = 0.72;
const MAX_COLOR_MIX = 0.75;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export interface AtmosphericAppearance {
  opacity: number;
  color: THREE.Color;
}

export function getAtmosphericAppearance(
  distance: number,
  baseColor: THREE.Color,
  isSelected: boolean,
  target = new THREE.Color(),
): AtmosphericAppearance {
  const fade = smoothstep(NEAR_DISTANCE, FAR_DISTANCE, distance);
  const minOpacity = isSelected ? SELECTED_MIN_OPACITY : MIN_OPACITY;
  const opacity = THREE.MathUtils.lerp(1, minOpacity, fade);
  const colorMix = fade * (isSelected ? MAX_COLOR_MIX * 0.45 : MAX_COLOR_MIX);

  target.copy(baseColor).lerp(atmosphereFogColor, colorMix);

  return { opacity, color: target };
}

export interface PlotPointAppearance extends AtmosphericAppearance {
  emissiveIntensity: number;
}

/** 語彙プロット点用：遠方でも星のように光って見える */
export function getPlotPointAppearance(
  distance: number,
  baseColor: THREE.Color,
  isSelected: boolean,
  target = new THREE.Color(),
): PlotPointAppearance {
  const fade = smoothstep(10, 26, distance);
  const opacity = THREE.MathUtils.lerp(1, isSelected ? 1 : 0.88, fade);
  const colorMix = fade * 0.08;
  const emissiveIntensity = THREE.MathUtils.lerp(
    isSelected ? 1.4 : 1.05,
    isSelected ? 2.2 : 1.75,
    fade,
  );

  target.copy(baseColor).lerp(atmosphereFogColor, colorMix);

  return { opacity, color: target, emissiveIntensity };
}
