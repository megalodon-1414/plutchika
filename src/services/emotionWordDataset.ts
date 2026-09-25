import emotionsJson from '../data/emotionWords/emotions.json';
import wordTypesJson from '../data/emotionWords/wordTypes.json';
import wordsJson from '../data/emotionWords/words.json';
import type {
  SupabaseEmotionRow,
  SupabaseEmotionWordRow,
  SupabaseWordTypeRow,
} from '../utils/emotionWordsBridge';

export interface EmotionWordDataset {
  emotions: SupabaseEmotionRow[];
  wordTypes: SupabaseWordTypeRow[];
  words: SupabaseEmotionWordRow[];
}

export const EMOTION_WORD_DATASET: EmotionWordDataset = {
  emotions: emotionsJson as SupabaseEmotionRow[],
  wordTypes: wordTypesJson as SupabaseWordTypeRow[],
  words: wordsJson as SupabaseEmotionWordRow[],
};
