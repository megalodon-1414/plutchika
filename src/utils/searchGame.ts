import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { isPurePlot, rowToEmotionParams } from './emotionPlotBridge';
import { getPlotKey } from './plotIdentity';
import { MIN_SECONDARY_WORDS_FOR_WARP_GATE } from './warpGateRules';

/** ワープ経路が繋がっていないときの距離 */
export const SEARCH_GAME_UNREACHABLE_DISTANCE = 99;

/** メーター正規化の下限（ワープ手数） */
export const SEARCH_GAME_MIN_REFERENCE_HOPS = 3;

export function pickSearchGameTargetId(
  plots: readonly UserPlotRow[],
  excludeId?: string | null,
): string | null {
  const candidates = plots.filter((plot) => getPlotKey(plot) !== excludeId && plot.word_id !== excludeId);
  if (candidates.length === 0) {
    return plots[0] ? getPlotKey(plots[0]) : null;
  }
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index] ? getPlotKey(candidates[index]) : null;
}

/** 副感情方向に十分な語があるワープゲートだけで星系グラフを構築 */
export function buildWarpGateAdjacency(
  plots: readonly UserPlotRow[],
): Map<EmotionId, Set<EmotionId>> {
  const adjacency = new Map<EmotionId, Set<EmotionId>>();
  const countsByPair = new Map<string, number>();

  const ensure = (id: EmotionId) => {
    if (!adjacency.has(id)) {
      adjacency.set(id, new Set());
    }
  };

  for (const plot of plots) {
    ensure(plot.primaryId);
    const params = rowToEmotionParams(plot);
    if (params.isPure || params.primaryId === params.secondaryId) {
      continue;
    }
    const key = `${params.primaryId}>${params.secondaryId}`;
    countsByPair.set(key, (countsByPair.get(key) ?? 0) + 1);
  }

  for (const [key, count] of countsByPair) {
    if (count < MIN_SECONDARY_WORDS_FOR_WARP_GATE) {
      continue;
    }
    const [fromId, toId] = key.split('>') as [EmotionId, EmotionId];
    if (!plots.some((plot) => plot.primaryId === toId)) {
      continue;
    }
    ensure(fromId);
    ensure(toId);
    adjacency.get(fromId)!.add(toId);
  }

  return adjacency;
}

/** ワープゲート経由の最短手数（星系間）。同一星系は 0 */
export function warpHopDistance(
  adjacency: Map<EmotionId, Set<EmotionId>>,
  fromEmotionId: EmotionId,
  toEmotionId: EmotionId,
): number {
  if (fromEmotionId === toEmotionId) {
    return 0;
  }

  if (!adjacency.has(fromEmotionId) || !adjacency.has(toEmotionId)) {
    return SEARCH_GAME_UNREACHABLE_DISTANCE;
  }

  const visited = new Set<EmotionId>([fromEmotionId]);
  const queue: Array<{ id: EmotionId; hops: number }> = [{ id: fromEmotionId, hops: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const neighbors = adjacency.get(current.id);
    if (!neighbors) {
      continue;
    }

    for (const next of neighbors) {
      if (visited.has(next)) {
        continue;
      }
      if (next === toEmotionId) {
        return current.hops + 1;
      }
      visited.add(next);
      queue.push({ id: next, hops: current.hops + 1 });
    }
  }

  return SEARCH_GAME_UNREACHABLE_DISTANCE;
}

/**
 * ゴールまでのワープ道のり。
 * - 発見済み: 0
 * - 同一星系（未発見）: 0.5（星系内探索が残っている）
 * - それ以外: 最短ワープ手数
 * - 今いる語がゴール方向のゲートなら、そのゲート経由の道のりも比較する
 */
export function warpJourneyDistance(
  plots: readonly UserPlotRow[],
  from: UserPlotRow,
  to: UserPlotRow,
  adjacency?: Map<EmotionId, Set<EmotionId>>,
): number {
  if (from.word_id === to.word_id) {
    return 0;
  }

  const graph = adjacency ?? buildWarpGateAdjacency(plots);

  if (from.primaryId === to.primaryId) {
    return 0.5;
  }

  let best = warpHopDistance(graph, from.primaryId, to.primaryId);

  if (!isPurePlot(from) && from.secondaryId !== from.primaryId) {
    const hopsAfterWarp = warpHopDistance(graph, from.secondaryId, to.primaryId);
    if (hopsAfterWarp < SEARCH_GAME_UNREACHABLE_DISTANCE) {
      // このゲートを1回使う + 到着後の残り（ゴール星系なら星系内 0.5）
      const viaGate = 1 + hopsAfterWarp + (hopsAfterWarp === 0 ? 0.5 : 0);
      best = Math.min(best, viaGate);
    }
  }

  return best;
}

/** 0 = 遠い, 1 = 到達 */
export function proximityRatio(distance: number, referenceDistance: number): number {
  if (distance <= 0) {
    return 1;
  }
  if (referenceDistance <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, 1 - distance / referenceDistance));
}

export type SearchProximityTrend = 'closer' | 'farther' | 'steady';

export function proximityTrend(
  previousDistance: number | null,
  currentDistance: number,
  epsilon = 0.25,
): SearchProximityTrend {
  if (previousDistance == null) {
    return 'steady';
  }
  const delta = previousDistance - currentDistance;
  if (delta > epsilon) {
    return 'closer';
  }
  if (delta < -epsilon) {
    return 'farther';
  }
  return 'steady';
}

export function formatWarpJourneyDistance(distance: number, found: boolean): string {
  if (found || distance <= 0) {
    return '0';
  }
  if (distance >= SEARCH_GAME_UNREACHABLE_DISTANCE) {
    return '—';
  }
  if (distance === 0.5) {
    return '星系内';
  }
  // 1.5 = あと1ワープ＋星系内
  if (Math.abs(distance - Math.round(distance)) < 0.01) {
    return `${Math.round(distance)}ワープ`;
  }
  const hops = Math.floor(distance);
  return hops <= 0 ? '星系内' : `${hops}ワープ+`;
}
