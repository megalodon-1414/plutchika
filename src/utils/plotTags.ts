import type { UserPlotRow } from '../types/userPlot';
import { isExplorationDummyPlot } from './explorationDummyPlots';
import { isWarpLandingPlot } from './plotIdentity';
import { wordTypeLabel } from './emotionWordsBridge';

export type PlotTagId =
  | 'registered'
  | 'exploration-dummy'
  | 'adjective'
  | 'idiom'
  | 'verb';

export interface PlotTagDefinition {
  id: PlotTagId;
  label: string;
  /** データ上まだ付与できない想定タグ */
  available: boolean;
}

export const PLOT_TAGS: PlotTagDefinition[] = [
  { id: 'registered', label: '登録単語', available: true },
  { id: 'exploration-dummy', label: '探索用ダミー', available: true },
  { id: 'adjective', label: '形容詞', available: true },
  { id: 'idiom', label: '熟語', available: true },
  { id: 'verb', label: '動詞', available: false },
];

export function getPlotTagIds(plot: UserPlotRow): PlotTagId[] {
  if (isWarpLandingPlot(plot)) {
    // ワープ着地用純感情は常に選択可能な語として扱う
    return ['registered', 'exploration-dummy'];
  }
  if (isExplorationDummyPlot(plot.word_id)) {
    return ['exploration-dummy'];
  }

  const tags: PlotTagId[] = ['registered'];
  if (plot.wordType === 'adjective') {
    tags.push('adjective');
  }
  if (plot.wordType === 'idiom') {
    tags.push('idiom');
  }
  return tags;
}

export function getPlotKindLabel(plot: UserPlotRow): string {
  if (isExplorationDummyPlot(plot.word_id)) {
    return '探索用ダミー';
  }
  return wordTypeLabel(plot.wordType) ?? '登録単語';
}

/** 選択タグが空なら全件。いずれかの選択タグに一致するプロットのみ残す。 */
export function filterPlotsByTags(
  plots: UserPlotRow[],
  selectedTagIds: ReadonlySet<PlotTagId>,
): UserPlotRow[] {
  if (selectedTagIds.size === 0) {
    return plots;
  }

  return plots.filter((plot) => {
    const tags = getPlotTagIds(plot);
    return tags.some((tag) => selectedTagIds.has(tag));
  });
}

export function searchPlotsByQuery(
  plots: UserPlotRow[],
  query: string,
  limit = 8,
): UserPlotRow[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const ranked: Array<{ plot: UserPlotRow; score: number }> = [];

  for (const plot of plots) {
    if (isExplorationDummyPlot(plot.word_id) || isWarpLandingPlot(plot)) {
      continue;
    }

    const word = plot.word_id.toLowerCase();
    const ruby = (plot.ruby ?? '').toLowerCase();

    let score = 0;
    if (word === normalized || ruby === normalized) {
      score = 300;
    } else if (word.startsWith(normalized) || ruby.startsWith(normalized)) {
      score = 200;
    } else if (word.includes(normalized) || ruby.includes(normalized)) {
      score = 100;
    } else {
      continue;
    }

    ranked.push({ plot, score });
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.plot.word_id.localeCompare(b.plot.word_id, 'ja'))
    .slice(0, limit)
    .map((entry) => entry.plot);
}
