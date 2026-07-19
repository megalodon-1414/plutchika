/** #rrggbb 形式の16進カラーコードをHSLへ変換する。 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  h *= 60;

  return { h, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');

  if (s === 0) {
    const hex = toHex(l);
    return `#${hex}${hex}${hex}`;
  }

  const hueNorm = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, hueNorm + 1 / 3);
  const g = hueToRgb(p, q, hueNorm);
  const b = hueToRgb(p, q, hueNorm - 1 / 3);

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** 色相は円環なので単純平均だと逆側に振れうる。180度を超えない最短経路で平均する。 */
function averageHueShortestPath(hueA: number, hueB: number): number {
  const diff = ((hueB - hueA + 540) % 360) - 180;
  return (((hueA + diff / 2) % 360) + 360) % 360;
}

/**
 * 2つの#rrggbbカラーをHSL空間で混色する（色相は最短経路で平均、彩度・明度は単純平均）。
 * RGB平均より自然な中間色になりやすい（プルチック環の隣接色混色向け）。
 */
export function blendHexColorsHsl(hexA: string, hexB: string): string {
  const a = hexToHsl(hexA);
  const b = hexToHsl(hexB);
  const h = averageHueShortestPath(a.h, b.h);
  const s = (a.s + b.s) / 2;
  const l = (a.l + b.l) / 2;
  return hslToHex(h, s, l);
}
