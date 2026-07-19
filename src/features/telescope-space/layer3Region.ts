import * as THREE from 'three';
import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import { getEmotionById } from '../../data/emotions';
import {
  TELESCOPE_GALAXY_NODES,
  type TelescopeNodePosition,
} from './constants';
import type { TelescopeFocusCameraPose } from './focusCameraView';

export const TELESCOPE_REGION_VIEW = {
  fov: 64,
  moveMs: 760,
  /** 入場後、基本感情（progress=1）から24感情（0.5）へスライドする時間 */
  slideToMidMs: 640,
  /** バー（水平線）から手前側（面内法線方向）への引き量 */
  cameraBack: 1.35,
  /** バー進行方向（画面右側）へのオフセット＝右寄りから眺める */
  cameraSide: 0.6,
  /** 平面法線（Z）方向の高さ＝上から見下ろす量 */
  cameraHeight: 1.05,
  /** 注視点まわりの視点回転（+で反時計回り、ラジアン） */
  cameraYaw: 0.32,
  dragSensitivity: 0.0024,
  regionHalfWidth: 0.34,
  /** 再構成した空間のバー長。どの2感情でも同じ長さに統一する */
  spanLength: 3.2,
  /** スクロール（progress）の可動範囲。両端の純粋感情円の中心まで */
  progressMin: 0,
  progressMax: 1,
} as const;

export interface TelescopeRegionDefinition {
  id: `dyad-${number}`;
  label: string;
  components: [BasicEmotionId, BasicEmotionId];
  /** 再構成後の端点（中点から spanLength/2 ずつ離した統一空間の座標） */
  start: TelescopeNodePosition;
  end: TelescopeNodePosition;
  midpoint: [number, number, number];
  direction: [number, number, number];
  /** 元の2感情間の実距離 */
  realLength: number;
  /** 実空間の線分方向成分 → 統一空間への伸縮率（spanLength / realLength） */
  alongScale: number;
}

export function getTelescopeRegionDefinition(
  id: EmotionId | null,
  /** レイヤー1で選択した感情。空間の手前側（カメラ寄り＝end）に配置する */
  frontBasicId?: BasicEmotionId | null,
): TelescopeRegionDefinition | null {
  if (!id || !id.startsWith('dyad-')) {
    return null;
  }
  const emotion = getEmotionById(id);
  if (!('components' in emotion)) {
    return null;
  }
  const frontIsFirst =
    frontBasicId != null && emotion.components[0] === frontBasicId;
  const startId = frontIsFirst ? emotion.components[1] : emotion.components[0];
  const endId = frontIsFirst ? emotion.components[0] : emotion.components[1];
  const start = TELESCOPE_GALAXY_NODES.find((node) => node.id === startId);
  const end = TELESCOPE_GALAXY_NODES.find((node) => node.id === endId);
  if (!start || !end) {
    return null;
  }

  const dx = end.position[0] - start.position[0];
  const dy = end.position[1] - start.position[1];
  const realLength = Math.hypot(dx, dy) || 1;
  const ux = dx / realLength;
  const uy = dy / realLength;
  const midpoint: [number, number, number] = [
    (start.position[0] + end.position[0]) * 0.5,
    (start.position[1] + end.position[1]) * 0.5,
    0,
  ];

  // 2感情の実距離に関わらず、中点を軸に spanLength の統一空間へ再構成する。
  const half = TELESCOPE_REGION_VIEW.spanLength / 2;
  const normalizedStart: TelescopeNodePosition = {
    ...start,
    position: [midpoint[0] - ux * half, midpoint[1] - uy * half, 0],
  };
  const normalizedEnd: TelescopeNodePosition = {
    ...end,
    position: [midpoint[0] + ux * half, midpoint[1] + uy * half, 0],
  };

  return {
    id: emotion.id,
    label: emotion.label,
    components: emotion.components,
    start: normalizedStart,
    end: normalizedEnd,
    midpoint,
    direction: [ux, uy, 0],
    realLength,
    alongScale: TELESCOPE_REGION_VIEW.spanLength / realLength,
  };
}

/**
 * 実空間の座標を統一空間へ変換する。
 * 中点を基準に線分方向の成分だけを alongScale 倍し、垂直成分は保つ。
 */
export function telescopeRegionToUnifiedSpace(
  region: TelescopeRegionDefinition,
  x: number,
  y: number,
): [number, number] {
  const relX = x - region.midpoint[0];
  const relY = y - region.midpoint[1];
  const [ux, uy] = region.direction;
  const along = relX * ux + relY * uy;
  const shift = along * (region.alongScale - 1);
  return [x + ux * shift, y + uy * shift];
}

export function getTelescopeRegionPoint(
  region: TelescopeRegionDefinition,
  progress: number,
): [number, number, number] {
  const t = THREE.MathUtils.clamp(
    progress,
    TELESCOPE_REGION_VIEW.progressMin,
    TELESCOPE_REGION_VIEW.progressMax,
  );
  return [
    THREE.MathUtils.lerp(region.start.position[0], region.end.position[0], t),
    THREE.MathUtils.lerp(region.start.position[1], region.end.position[1], t),
    0,
  ];
}

export function computeTelescopeRegionCameraPose(
  region: TelescopeRegionDefinition,
  progress: number,
): TelescopeFocusCameraPose {
  const point = getTelescopeRegionPoint(region, progress);
  const [dx, dy] = region.direction;
  // バーを画面の水平線として扱う。up=(0,0,1) のとき
  // 面内法線 (dy, -dx) 側へ引くと画面右 = direction（start が左、end が右）。
  // そこから direction 側と Z 上方へずらして「右上から眺める」構図にする。
  const offsetX =
    dy * TELESCOPE_REGION_VIEW.cameraBack +
    dx * TELESCOPE_REGION_VIEW.cameraSide;
  const offsetY =
    -dx * TELESCOPE_REGION_VIEW.cameraBack +
    dy * TELESCOPE_REGION_VIEW.cameraSide;
  // 注視点まわりに視点を反時計回りへ少し回す
  const cos = Math.cos(TELESCOPE_REGION_VIEW.cameraYaw);
  const sin = Math.sin(TELESCOPE_REGION_VIEW.cameraYaw);
  return {
    position: [
      point[0] + offsetX * cos - offsetY * sin,
      point[1] + offsetX * sin + offsetY * cos,
      TELESCOPE_REGION_VIEW.cameraHeight,
    ],
    lookAt: point,
  };
}

