import { supabase } from '../lib/supabase';
import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { clampIntensity } from '../utils/emotionPlotBridge';
import {
  buildEmotionIdBySupabaseId,
  buildSupabaseIdByEmotionId,
  registerSupabaseEmotionLabels,
  type SupabaseEmotionRow,
} from '../utils/emotionWordsBridge';

export interface EmotionLookup {
  emotions: SupabaseEmotionRow[];
  emotionIdBySupabaseId: Map<number, EmotionId>;
  supabaseIdByEmotionId: Map<EmotionId, number>;
}

export async function fetchEmotionLookup(): Promise<EmotionLookup> {
  const { data, error } = await supabase.from('emotions').select('id,name,tier,combo').order('id');

  if (error) {
    throw new Error(error.message);
  }

  const emotions = (data ?? []) as SupabaseEmotionRow[];
  registerSupabaseEmotionLabels(emotions);

  return {
    emotions,
    emotionIdBySupabaseId: buildEmotionIdBySupabaseId(emotions),
    supabaseIdByEmotionId: buildSupabaseIdByEmotionId(emotions),
  };
}

export function plotRowToEmotionWordUpdate(
  plot: Pick<UserPlotRow, 'primaryId' | 'secondaryId' | 'intensity'>,
  supabaseIdByEmotionId: Map<EmotionId, number>,
): {
  primary_emotion_id: number;
  secondary_emotion_id: number;
  secondary_value: number;
} {
  const primary_emotion_id = supabaseIdByEmotionId.get(plot.primaryId);
  const secondary_emotion_id = supabaseIdByEmotionId.get(plot.secondaryId);

  if (primary_emotion_id == null || secondary_emotion_id == null) {
    throw new Error(`感情IDのマッピングが見つかりません: ${plot.primaryId} / ${plot.secondaryId}`);
  }

  return {
    primary_emotion_id,
    secondary_emotion_id,
    secondary_value: clampIntensity(plot.intensity),
  };
}

export async function updateEmotionWord(
  sourceId: number,
  plot: Pick<UserPlotRow, 'primaryId' | 'secondaryId' | 'intensity'>,
  supabaseIdByEmotionId: Map<EmotionId, number>,
): Promise<void> {
  const payload = plotRowToEmotionWordUpdate(plot, supabaseIdByEmotionId);
  const { error } = await supabase.from('emotion_words').update(payload).eq('id', sourceId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteEmotionWord(sourceId: number): Promise<void> {
  const { error } = await supabase.from('emotion_words').delete().eq('id', sourceId);

  if (error) {
    throw new Error(error.message);
  }
}
