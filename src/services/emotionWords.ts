import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { normalizeUserPlotRow } from '../utils/emotionPlotBridge';
import {
  buildEmotionIdBySupabaseId,
  mapWordTypeId,
  registerSupabaseEmotionLabels,
  resolveSecondaryEmotionId,
  secondaryValueToPlotIntensity,
  type SupabaseEmotionWordRow,
  type SupabaseWordTypeRow,
} from '../utils/emotionWordsBridge';
import { EMOTION_WORD_DATASET } from './emotionWordDataset';

function emotionWordToPlot(
  row: SupabaseEmotionWordRow,
  emotionIdBySupabaseId: Map<number, EmotionId>,
  wordTypes: readonly SupabaseWordTypeRow[],
  emotionNameById: Map<number, string>,
): UserPlotRow | null {
  const primaryId = emotionIdBySupabaseId.get(row.primary_emotion_id);
  if (!primaryId || !row.word) {
    return null;
  }

  const secondaryId = resolveSecondaryEmotionId(
    row.secondary_emotion_id,
    emotionIdBySupabaseId,
    primaryId,
  );

  return normalizeUserPlotRow({
    word_id: row.word,
    primaryId,
    secondaryId,
    intensity: secondaryValueToPlotIntensity(row.secondary_value),
    meaning: row.meaning ?? undefined,
    usageExample: row.usage_example ?? undefined,
    ruby: row.ruby ?? undefined,
    wordType: mapWordTypeId(row.word_type_id, wordTypes),
    primaryLabel: emotionNameById.get(row.primary_emotion_id),
    secondaryLabel:
      row.secondary_emotion_id != null
        ? emotionNameById.get(row.secondary_emotion_id)
        : undefined,
    sourceId: Number(row.id),
  });
}

export function plotsFromEmotionWordDataset(): UserPlotRow[] {
  const { emotions, wordTypes, words } = EMOTION_WORD_DATASET;

  registerSupabaseEmotionLabels(emotions);
  const emotionIdBySupabaseId = buildEmotionIdBySupabaseId(emotions);
  const emotionNameById = new Map(emotions.map((emotion) => [emotion.id, emotion.name]));

  return words
    .map((row) => emotionWordToPlot(row, emotionIdBySupabaseId, wordTypes, emotionNameById))
    .filter((row): row is UserPlotRow => row !== null);
}

/** 感情語マスター（`src/data/emotionWords/*.json`）からプロット一覧を取得 */
export async function fetchEmotionWordsAsPlots(): Promise<UserPlotRow[]> {
  return plotsFromEmotionWordDataset();
}
