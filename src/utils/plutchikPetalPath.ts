/** SVG 紡錘形花弁パス — 角度は数学座標（0=右、反時計回り）。 */

const DEG = Math.PI / 180;

function polar(cx: number, cy: number, radius: number, angleDeg: number): [number, number] {
  const rad = angleDeg * DEG;
  return [cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius];
}

/** 中心から外端まで途切れない紡錘形。innerRadius > 0 で中心の隙間を空ける。 */
export function buildPlutchikPetalPath(
  cx: number,
  cy: number,
  angleDeg: number,
  outerRadius: number,
  halfSpreadDeg = 22.5,
  innerRadius = 0,
): string {
  const midRadius = outerRadius * 0.52;
  const midSpread = halfSpreadDeg * 1.18;
  const outerSpread = halfSpreadDeg * 0.28;

  const [mLx, mLy] = polar(cx, cy, midRadius, angleDeg - midSpread);
  const [mRx, mRy] = polar(cx, cy, midRadius, angleDeg + midSpread);
  const [tipX, tipY] = polar(cx, cy, outerRadius, angleDeg);
  const [oLx, oLy] = polar(cx, cy, outerRadius * 0.88, angleDeg - outerSpread);
  const [oRx, oRy] = polar(cx, cy, outerRadius * 0.88, angleDeg + outerSpread);

  const fmt = (n: number) => n.toFixed(2);

  if (innerRadius <= 0) {
    return [
      `M ${fmt(cx)} ${fmt(cy)}`,
      `C ${fmt(mLx)} ${fmt(mLy)} ${fmt(oLx)} ${fmt(oLy)} ${fmt(tipX)} ${fmt(tipY)}`,
      `C ${fmt(oRx)} ${fmt(oRy)} ${fmt(mRx)} ${fmt(mRy)} ${fmt(cx)} ${fmt(cy)}`,
      'Z',
    ].join(' ');
  }

  const innerSpread = halfSpreadDeg * 0.62;
  const [iLx, iLy] = polar(cx, cy, innerRadius, angleDeg - innerSpread);
  const [iRx, iRy] = polar(cx, cy, innerRadius, angleDeg + innerSpread);

  return [
    `M ${fmt(iLx)} ${fmt(iLy)}`,
    `C ${fmt(mLx)} ${fmt(mLy)} ${fmt(oLx)} ${fmt(oLy)} ${fmt(tipX)} ${fmt(tipY)}`,
    `C ${fmt(oRx)} ${fmt(oRy)} ${fmt(mRx)} ${fmt(mRy)} ${fmt(iRx)} ${fmt(iRy)}`,
    'Z',
  ].join(' ');
}
