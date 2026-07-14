import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { rowToEmotionParams } from './emotionPlotBridge';

/** この副感情方向にこれ以上の語があるとワープゲートを生成する */
export const MIN_SECONDARY_WORDS_FOR_WARP_GATE = 1;

/** ワープゲートを置く強度位置（副感情方向のこの強度相当） */
export const WARP_GATE_ANCHOR_INTENSITY = 55;

/** この強度以上ならワープゲートへ進入できる */
export const WARP_GATE_MIN_ENTER_INTENSITY = 35;

/** 一度に移動できる同一星系内の描画ユニット上限（同意義の回転グループは1枠） */
export const MAX_MOVABLE_NEARBY_STARS = 10;

/** 現在星系内で、各副感情方向に向かう混合感情語の数 */
export function countSecondaryDirectionsInSystem(
  plots: readonly UserPlotRow[],
  systemId: EmotionId,
): Map<EmotionId, number> {
  const counts = new Map<EmotionId, number>();

  for (const plot of plots) {
    if (plot.primaryId !== systemId) {
      continue;
    }
    const params = rowToEmotionParams(plot);
    if (params.isPure || params.secondaryId === params.primaryId) {
      continue;
    }
    counts.set(params.secondaryId, (counts.get(params.secondaryId) ?? 0) + 1);
  }

  return counts;
}

/** ワープゲートを出してよい副感情方向（語が十分あるもの） */
export function getEligibleWarpSecondaryIds(
  plots: readonly UserPlotRow[],
  systemId: EmotionId,
  minWords = MIN_SECONDARY_WORDS_FOR_WARP_GATE,
): Set<EmotionId> {
  const eligible = new Set<EmotionId>();
  const counts = countSecondaryDirectionsInSystem(plots, systemId);

  for (const [secondaryId, count] of counts) {
    // 行き先星系に語が無くても、方向ゲート自体は表示する（着地は別途判定）
    if (count >= minWords && secondaryId !== systemId) {
      eligible.add(secondaryId);
    }
  }

  return eligible;
}

/** 星系内の primary:secondary ペアで、ゲート代表にする語（強度最大） */
export function pickWarpGateRepresentatives(
  plots: readonly UserPlotRow[],
  systemId: EmotionId,
  eligibleSecondaries: ReadonlySet<EmotionId>,
): UserPlotRow[] {
  const bestBySecondary = new Map<EmotionId, UserPlotRow>();

  for (const plot of plots) {
    if (plot.primaryId !== systemId) {
      continue;
    }
    const params = rowToEmotionParams(plot);
    if (params.isPure || params.secondaryId === params.primaryId) {
      continue;
    }
    if (!eligibleSecondaries.has(params.secondaryId)) {
      continue;
    }

    const current = bestBySecondary.get(params.secondaryId);
    if (!current || params.intensity > rowToEmotionParams(current).intensity) {
      bestBySecondary.set(params.secondaryId, plot);
    }
  }

  return [...bestBySecondary.values()];
}

/** 同一星系・同一副感情方向で強度が最大の語か（同点は word_id 昇順で代表） */
export function isStrongestInSecondaryDirection(
  plot: UserPlotRow,
  plots: readonly UserPlotRow[],
): boolean {
  const params = rowToEmotionParams(plot);
  if (params.isPure || params.secondaryId === params.primaryId) {
    return false;
  }

  for (const other of plots) {
    if (other.word_id === plot.word_id) {
      continue;
    }
    if (other.primaryId !== plot.primaryId || other.secondaryId !== plot.secondaryId) {
      continue;
    }
    const otherIntensity = rowToEmotionParams(other).intensity;
    if (
      otherIntensity > params.intensity
      || (otherIntensity === params.intensity && other.word_id < plot.word_id)
    ) {
      return false;
    }
  }

  return true;
}

/** 強度がしきい値以上の混合感情ならワープゲートへ進入可能 */
export function canEnterWarpGate(plot: UserPlotRow): boolean {
  const params = rowToEmotionParams(plot);
  if (params.isPure || params.secondaryId === params.primaryId) {
    return false;
  }
  return params.intensity >= WARP_GATE_MIN_ENTER_INTENSITY;
}
