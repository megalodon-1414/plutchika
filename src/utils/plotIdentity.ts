import { ALL_EMOTIONS } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { normalizeUserPlotRow } from './emotionPlotBridge';
import { EXPLORATION_DUMMY_PREFIX } from './explorationDummyPlots';

function toSourceId(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/** 選択・描画キー（emotion_words は sourceId で一意化） */
export function getPlotKey(plot: Pick<UserPlotRow, 'word_id' | 'sourceId'>): string {
  const sourceId = toSourceId(plot.sourceId);
  if (sourceId != null) {
    return `ew:${sourceId}`;
  }
  return plot.word_id;
}

export function findPlotByKey(
  plots: readonly UserPlotRow[],
  key: string | null | undefined,
): UserPlotRow | null {
  if (!key) {
    return null;
  }
  if (key.startsWith('ew:')) {
    const sourceId = Number(key.slice(3));
    if (Number.isFinite(sourceId)) {
      return plots.find((plot) => toSourceId(plot.sourceId) === sourceId) ?? null;
    }
  }
  return plots.find((plot) => getPlotKey(plot) === key || plot.word_id === key) ?? null;
}

function hasPurePrimarySecondary(plot: UserPlotRow): boolean {
  return plot.primaryId === plot.secondaryId;
}

/**
 * ワープ着地用: 純感情が無い感情星系へ、循環プロットを1つ補完する。
 */
export function ensureEmotionSystemLandings(plots: UserPlotRow[]): UserPlotRow[] {
  const systemsWithPure = new Set(
    plots.filter((plot) => hasPurePrimarySecondary(plot)).map((plot) => plot.primaryId),
  );
  const extras: UserPlotRow[] = [];

  for (const emotion of ALL_EMOTIONS) {
    if (systemsWithPure.has(emotion.id)) {
      continue;
    }
    extras.push(
      normalizeUserPlotRow({
        word_id: `${EXPLORATION_DUMMY_PREFIX}landing-${emotion.label}`,
        primaryId: emotion.id,
        secondaryId: emotion.id,
        intensity: 42,
      }),
    );
  }

  return extras.length === 0 ? plots : [...plots, ...extras];
}

export function isWarpLandingPlot(plot: Pick<UserPlotRow, 'word_id'>): boolean {
  return plot.word_id.startsWith(`${EXPLORATION_DUMMY_PREFIX}landing-`);
}
