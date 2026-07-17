import type { UserPlotRow } from '../types/userPlot';
import { kanaToRomaji } from './kanaToRomaji';

/** URL 用にスラッグを正規化（英小文字・数字・ハイフン） */
export function normalizeEmotionWordSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 熟語・単語の詳細 URL スラッグ。
 * ふりがながあればローマ字化し、なければ sourceId ベースのフォールバック。
 */
export function getEmotionWordSlug(plot: UserPlotRow): string {
  const ruby = plot.ruby?.trim();
  if (ruby) {
    const fromRuby = normalizeEmotionWordSlug(kanaToRomaji(ruby));
    if (fromRuby) {
      return fromRuby;
    }
  }

  const fromWord = normalizeEmotionWordSlug(kanaToRomaji(plot.word_id));
  if (fromWord) {
    return fromWord;
  }

  if (plot.sourceId != null) {
    return `word-${plot.sourceId}`;
  }

  return normalizeEmotionWordSlug(plot.word_id) || 'word';
}

export function getEmotionWordPath(plot: UserPlotRow): string {
  return `/map/${getEmotionWordSlug(plot)}`;
}

/** 同一スラッグが複数ある場合は先頭を返す */
export function findPlotBySlug(
  plots: readonly UserPlotRow[],
  slug: string,
): UserPlotRow | null {
  const normalized = normalizeEmotionWordSlug(slug);
  if (!normalized) {
    return null;
  }
  return plots.find((plot) => getEmotionWordSlug(plot) === normalized) ?? null;
}
