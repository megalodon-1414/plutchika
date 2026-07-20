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

/**
 * 基調色の周辺色（色相を少しずらした同系色）。
 * UIグラデーション用。黒は混ぜない。
 */
export function analogousEmotionColors(
  hex: string,
): readonly [string, string, string, string] {
  const base = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const mk = (dh: number, dl: number, ds = 0) => {
    const color = new THREE.Color();
    color.setHSL(
      (hsl.h + dh + 1) % 1,
      THREE.MathUtils.clamp(hsl.s + ds, 0.4, 1),
      THREE.MathUtils.clamp(hsl.l + dl, 0.32, 0.7),
    );
    return `#${color.getHexString()}`;
  };
  // シームレスループのため先頭色を末尾にも置く
  const a = mk(-0.07, 0.1, 0.05);
  const b = mk(0, -0.04, 0.08);
  const c = mk(0.09, 0.06, 0);
  return [a, b, c, a];
}

/**
 * 「この感情に降り立つ」ボタン用のシームレス流動グラデーション。
 * 1周期分の色を2回つなぎ、background-size: 200% + position 0→100% で継ぎ目なく流す。
 */
export function landButtonFlowGradient(hex: string): {
  image: string;
  glow: string;
} {
  const base = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const mk = (dh: number, dl: number, ds = 0) => {
    const color = new THREE.Color();
    color.setHSL(
      (hsl.h + dh + 1) % 1,
      THREE.MathUtils.clamp(hsl.s + ds, 0.45, 0.92),
      THREE.MathUtils.clamp(hsl.l + dl, 0.38, 0.68),
    );
    return `#${color.getHexString()}`;
  };

  // 明暗・色相を緩やかに変化させた1周期（先頭＝末尾にしない）
  const period = [
    mk(-0.06, 0.12, 0.02),
    mk(-0.03, 0.02, 0.08),
    mk(0.01, -0.06, 0.1),
    mk(0.05, 0.04, 0.04),
    mk(0.08, 0.1, -0.02),
    mk(0.03, 0.0, 0.05),
    mk(-0.02, 0.06, 0.03),
  ];
  // 同一周期を2回つなぎ、background-size:200% + position 0→100% で継ぎ目なく流す
  const loop = [...period, ...period];
  const stops = loop
    .map((color, index) => {
      const pct = (index / (loop.length - 1)) * 100;
      return `${color} ${pct.toFixed(2)}%`;
    })
    .join(', ');

  return {
    image: `linear-gradient(122deg, ${stops})`,
    glow: period[2],
  };
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
