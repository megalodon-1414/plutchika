import type { UserPlotRow } from '../../types/userPlot';
import {
  EMOTION_INTENSITY_MAX,
  rowToEmotionParams,
} from '../../utils/emotionPlotBridge';
import {
  PURE_AREA_RATIO,
  RING_RADIUS as MAP_EMOTION_RING_RADIUS,
  getEmotionSphereRadius,
} from '../../utils/emotionSpaceLayout';
import {
  TELESCOPE_GALAXY_RADIUS,
  getTelescopeEmotionPosition,
} from './constants';

const PURE_ORBIT_MIN_RADIUS_RATIO = 0.06;
const MIXED_MIN_DISTANCE_RATIO = 0.52;
const MIXED_MAX_DISTANCE_RATIO = 1.46;

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function telescopeSphereRadius(id: UserPlotRow['primaryId']): number {
  return (
    getEmotionSphereRadius(id) *
    (TELESCOPE_GALAXY_RADIUS / MAP_EMOTION_RING_RADIUS)
  );
}

/**
 * `/map` の primary / secondary / intensity の意味を保ったまま、
 * 上下層を持たない望遠鏡の XY 平面へ単語を配置する。
 */
export function getTelescopePlotPosition(
  row: UserPlotRow,
  time = 0,
): [number, number, number] {
  const params = rowToEmotionParams(row);
  const primary = getTelescopeEmotionPosition(params.primaryId);
  const sphereRadius = telescopeSphereRadius(params.primaryId);

  if (params.isPure) {
    const intensityT =
      Math.min(params.intensity, EMOTION_INTENSITY_MAX) /
      EMOTION_INTENSITY_MAX;
    const radiusRatio =
      PURE_ORBIT_MIN_RADIUS_RATIO +
      (1 - intensityT) *
        (PURE_AREA_RATIO - PURE_ORBIT_MIN_RADIUS_RATIO);
    const radius = sphereRadius * radiusRatio;
    const phase = hashId(row.word_id) * 0.001;
    const angle = time * 0.12 + phase;
    return [
      primary[0] + Math.cos(angle) * radius,
      primary[1] + Math.sin(angle) * radius,
      0,
    ];
  }

  const secondary = getTelescopeEmotionPosition(params.secondaryId);
  const dx = secondary[0] - primary[0];
  const dy = secondary[1] - primary[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = dx / length;
  const ny = dy / length;
  const intensityT =
    Math.min(params.intensity, EMOTION_INTENSITY_MAX) /
    EMOTION_INTENSITY_MAX;
  const distance =
    sphereRadius *
    (MIXED_MIN_DISTANCE_RATIO +
      intensityT *
        (MIXED_MAX_DISTANCE_RATIO - MIXED_MIN_DISTANCE_RATIO));

  // 同じ感情ペア・強度の語が完全に重ならない程度の決定論的な横ずらし。
  const spread =
    (((hashId(`${row.word_id}:${params.intensity}`) % 1000) / 999) - 0.5) *
    sphereRadius *
    0.16;

  return [
    primary[0] + nx * distance - ny * spread,
    primary[1] + ny * distance + nx * spread,
    0,
  ];
}
