import { supabase } from '../lib/supabase';
import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { normalizeUserPlotRow } from '../utils/emotionPlotBridge';
import {
  buildEmotionIdBySupabaseId,
  mapWordTypeId,
  registerSupabaseEmotionLabels,
  resolveSecondaryEmotionId,
  secondaryValueToPlotIntensity,
  type SupabaseEmotionRow,
  type SupabaseEmotionWordRow,
  type SupabaseWordTypeRow,
} from '../utils/emotionWordsBridge';

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

export async function fetchEmotionWordsAsPlots(): Promise<UserPlotRow[]> {
  const [emotionsResult, wordTypesResult, wordsResult] = await Promise.all([
    supabase.from('emotions').select('id,name,tier,combo').order('id'),
    supabase.from('word_types').select('id,name').order('id'),
    supabase
      .from('emotion_words')
      .select(
        'id,word,ruby,meaning,usage_example,primary_emotion_id,secondary_emotion_id,secondary_value,word_type_id',
      )
      .order('id')
      .limit(2000),
  ]);

  if (emotionsResult.error) {
    throw new Error(emotionsResult.error.message);
  }
  if (wordTypesResult.error) {
    throw new Error(wordTypesResult.error.message);
  }
  if (wordsResult.error) {
    throw new Error(wordsResult.error.message);
  }

  const emotions = (emotionsResult.data ?? []) as SupabaseEmotionRow[];
  const wordTypes = (wordTypesResult.data ?? []) as SupabaseWordTypeRow[];
  const words = (wordsResult.data ?? []) as SupabaseEmotionWordRow[];

  registerSupabaseEmotionLabels(emotions);
  const emotionIdBySupabaseId = buildEmotionIdBySupabaseId(emotions);
  const emotionNameById = new Map(emotions.map((emotion) => [emotion.id, emotion.name]));

  return words
    .map((row) => emotionWordToPlot(row, emotionIdBySupabaseId, wordTypes, emotionNameById))
    .filter((row): row is UserPlotRow => row !== null);
}
