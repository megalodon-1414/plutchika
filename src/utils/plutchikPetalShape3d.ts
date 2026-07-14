import * as THREE from 'three';

const DEG = Math.PI / 180;

function polar(radius: number, angleDeg: number): THREE.Vector2 {
  const rad = angleDeg * DEG;
  return new THREE.Vector2(Math.cos(rad) * radius, Math.sin(rad) * radius);
}

/** 中心点から外端まで途切れない紡錘形（ExtrudeGeometry 用、+Y 方向） */
export function createPlutchikPetalShape(
  outerRadius: number,
  halfSpreadDeg = 22.5,
): THREE.Shape {
  const angleDeg = 90;
  const midRadius = outerRadius * 0.52;
  const midSpread = halfSpreadDeg * 1.18;
  const outerSpread = halfSpreadDeg * 0.28;

  const mL = polar(midRadius, angleDeg - midSpread);
  const mR = polar(midRadius, angleDeg + midSpread);
  const tip = polar(outerRadius, angleDeg);
  const oL = polar(outerRadius * 0.88, angleDeg - outerSpread);
  const oR = polar(outerRadius * 0.88, angleDeg + outerSpread);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(mL.x, mL.y, oL.x, oL.y, tip.x, tip.y);
  shape.bezierCurveTo(oR.x, oR.y, mR.x, mR.y, 0, 0);

  return shape;
}

export const PLUTCHIK_PETAL_EXTRUDE_SETTINGS: THREE.ExtrudeGeometryOptions = {
  depth: 0.048,
  bevelEnabled: false,
};
