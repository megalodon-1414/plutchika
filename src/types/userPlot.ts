import type { EmotionId } from '../data/emotions';

export type EmotionWordTypeId = 'adjective' | 'idiom';

export interface UserPlotRow {
  word_id: string;
  primaryId: EmotionId;
  /** 副感情（基本8 + 合成24 の計32） */
  secondaryId: EmotionId;
  intensity: number;
  /** emotion_words.meaning */
  meaning?: string;
  /** emotion_words.usage_example */
  usageExample?: string;
  /** emotion_words.ruby */
  ruby?: string;
  /** word_types 由来 */
  wordType?: EmotionWordTypeId;
  /** Supabase emotions.name（主感情） */
  primaryLabel?: string;
  /** Supabase emotions.name（副感情） */
  secondaryLabel?: string;
  /** emotion_words.id */
  sourceId?: number;
}

/** Supabase 旧形式からの移行用 */
export interface LegacyUserPlotRow {
  word_id: string;
  mode?: string;
  hue?: number;
  brightness?: number;
  saturation?: number;
  emotions?: Record<string, number>;
}
