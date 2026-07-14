import type { BasicEmotionId, EmotionId } from '../data/emotions';
import { getEmotionById, isBasicEmotionId } from '../data/emotions';
import { RING_RADIUS, Y_LAYER_OFFSET } from './emotionSpaceLayout';
import { getRegisteredSupabaseEmotionLabel } from './emotionWordsBridge';

/** 主感情セクターコード（座標表示用） */
const SECTOR_CODES: Record<BasicEmotionId, string> = {
  joy: 'JO',
  trust: 'TR',
  fear: 'FE',
  surprise: 'SU',
  sadness: 'SA',
  disgust: 'DI',
  anger: 'AN',
  anticipation: 'AP',
};

export interface EmotionPositionInfo {
  primaryEmotionLabel: string;
  sectorCode: string;
  coordinates: string;
  coordinateLines: [string, string];
}

function getSectorCode(primaryId: EmotionId): string {
  if (isBasicEmotionId(primaryId)) {
    return SECTOR_CODES[primaryId];
  }
  const index = primaryId.replace('dyad-', '');
  return `D${index.padStart(2, '0')}`;
}

function formatSignedDegrees(value: number, positiveHemisphere: string, negativeHemisphere: string): string {
  const hemisphere = value >= 0 ? positiveHemisphere : negativeHemisphere;
  return `${hemisphere}${Math.abs(value).toFixed(1)}`;
}

/**
 * 感情空間内の固有座標を緯度経度風にエンコードする（コンパクト表示用）。
 */
export function positionToEmotionCoordinates(position: [number, number, number]): string {
  const [x, y, z] = position;
  const horizontalRadius = Math.hypot(x, z);
  const elevation = (Math.atan2(y, horizontalRadius > 1e-6 ? horizontalRadius : 1e-6) * 180) / Math.PI;
  const azimuth = (Math.atan2(z, x) * 180) / Math.PI;
  const azimuthEast = azimuth > 180 ? azimuth - 360 : azimuth;
  const spaceRadius = Math.hypot(x, y, z);
  const maxRadius = Math.hypot(RING_RADIUS, Y_LAYER_OFFSET);
  const radialCode = Math.round((spaceRadius / maxRadius) * 9999)
    .toString()
    .padStart(4, '0');

  const elv = formatSignedDegrees(elevation, 'N', 'S');
  const azm = formatSignedDegrees(azimuthEast, 'E', 'W');

  return `${elv}/${azm}/R${radialCode}`;
}

export function resolvePrimaryEmotionLabel(
  primaryId: EmotionId,
  overrideLabel?: string | null,
): string {
  return (
    overrideLabel?.trim() ||
    getRegisteredSupabaseEmotionLabel(primaryId) ||
    getEmotionById(primaryId).label
  );
}

export function getEmotionPositionInfo(
  position: [number, number, number],
  primaryId: EmotionId,
  primaryLabelOverride?: string | null,
): EmotionPositionInfo {
  const [x, y, z] = position;
  const horizontalRadius = Math.hypot(x, z);
  const elevation = (Math.atan2(y, horizontalRadius > 1e-6 ? horizontalRadius : 1e-6) * 180) / Math.PI;
  const azimuth = (Math.atan2(z, x) * 180) / Math.PI;
  const azimuthEast = azimuth > 180 ? azimuth - 360 : azimuth;
  const spaceRadius = Math.hypot(x, y, z);
  const maxRadius = Math.hypot(RING_RADIUS, Y_LAYER_OFFSET);
  const radialCode = Math.round((spaceRadius / maxRadius) * 9999)
    .toString()
    .padStart(4, '0');
  const sectorCode = getSectorCode(primaryId);
  const elv = formatSignedDegrees(elevation, 'N', 'S');
  const azm = formatSignedDegrees(azimuthEast, 'E', 'W');
  const coordinates = `${elv}/${azm}/R${radialCode}`;

  return {
    primaryEmotionLabel: resolvePrimaryEmotionLabel(primaryId, primaryLabelOverride),
    sectorCode,
    coordinates,
    coordinateLines: [`${sectorCode} ${elv}/${azm}`, `R${radialCode}`],
  };
}
