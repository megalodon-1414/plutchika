import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { rowToEmotionParams } from './emotionPlotBridge';
import { getPlotKey } from './plotIdentity';
import { isPureEmotionPlot } from './plotFromUserPlot';

function sortByIntensityDesc(a: UserPlotRow, b: UserPlotRow): number {
  const intensityDiff =
    rowToEmotionParams(b).intensity - rowToEmotionParams(a).intensity;
  if (intensityDiff !== 0) {
    return intensityDiff;
  }
  return getPlotKey(a).localeCompare(getPlotKey(b));
}

/**
 * from → to のワープ着地先。
 * 行き先星系の純感情（循環上）のうち強度最大の語へ固定する。
 */
export function findLinkedWarpDestination(
  plots: readonly UserPlotRow[],
  _fromEmotionId: EmotionId,
  toEmotionId: EmotionId,
  options?: {
    excludeWordId?: string | null;
  },
): UserPlotRow | null {
  const excludeWordId = options?.excludeWordId ?? null;

  const pureOrbit = plots
    .filter((plot) => {
      if (plot.primaryId !== toEmotionId || !isPureEmotionPlot(plot)) {
        return false;
      }
      if (!excludeWordId) {
        return true;
      }
      return getPlotKey(plot) !== excludeWordId && plot.word_id !== excludeWordId;
    })
    .sort(sortByIntensityDesc);

  return pureOrbit[0] ?? null;
}
