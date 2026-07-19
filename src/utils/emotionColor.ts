import * as THREE from 'three';
import { EMOTION_INTENSITY_MAX } from './emotionPlotBridge';

export function blendHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const value = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (from: number, to: number) => from + (to - from) * t;
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(mix(ar, br))}${toHex(mix(ag, bg))}${toHex(mix(ab, bb))}`;
}

/** 補色に近い色（色相180°回転）。HUD用に彩度・明度を底上げして視認性を確保する */
export function complementaryHex(hex: string): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL((hsl.h + 0.5) % 1, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.62));
  return `#${color.getHexString()}`;
}

/** 純感情：強度が高いほど鮮やか・濃い */
export function pureColorByIntensity(hex: string, intensity: number): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const t = intensity / EMOTION_INTENSITY_MAX;
  const saturation = THREE.MathUtils.lerp(0.12, 1, t);
  const lightness = THREE.MathUtils.lerp(0.62, hsl.l, t);
  color.setHSL(hsl.h, hsl.s * saturation, lightness);
  return `#${color.getHexString()}`;
}
