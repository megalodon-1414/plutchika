import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { getEmotionCenter } from './emotionSpaceLayout';

/** 探索モードで現在単語から見える近傍半径 */
export const EXPLORATION_NEARBY_RADIUS = 3.2 * 1.5;

/** 探索モードの静止点カメラ距離（通常選択より近い） */
export const EXPLORATION_CAMERA_DISTANCE = 0.28;

/** 探索モードで選択中プロットを置く画面位置（原点は左下、中央より下） */
export const EXPLORATION_SCREEN_ANCHOR = { x: 0.5, y: 0.24 };

/** ミニマップ俯瞰: 32感情全体を見渡すカメラ位置（フォーカス未指定時のフォールバック） */
export const SPACE_OVERVIEW_CAMERA_POSITION: [number, number, number] = [0, 9, 24];
export const SPACE_OVERVIEW_CAMERA_TARGET: [number, number, number] = [0, 0, 0];
export const SPACE_OVERVIEW_CAMERA_FOV = 62;

/** 直前にいた星系が手前に来るよう、その外側から原点を見下ろすカメラ位置 */
export function getSpaceOverviewCameraPosition(
  focusEmotionId: EmotionId | null | undefined,
): [number, number, number] {
  const distance = Math.hypot(...SPACE_OVERVIEW_CAMERA_POSITION);
  if (!focusEmotionId) {
    return SPACE_OVERVIEW_CAMERA_POSITION;
  }

  const center = getEmotionCenter(focusEmotionId);
  const length = Math.hypot(center.x, center.y, center.z) || 1;
  let x = (center.x / length) * distance;
  let y = (center.y / length) * distance + distance * 0.14;
  let z = (center.z / length) * distance;
  const lifted = Math.hypot(x, y, z) || 1;
  return [(x / lifted) * distance, (y / lifted) * distance, (z / lifted) * distance];
}

export function pickRandomPlotId(plots: UserPlotRow[]): string | null {
  if (plots.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * plots.length);
  return plots[index]?.word_id ?? null;
}
