import { initialWords } from '../data/wordsData';
import type { UserPlotRow } from '../types/userPlot';
import { emotionWordToUserPlot } from './emotionPlotBridge';
import { isEmotionWord } from './wordHelpers';

export function seedPlotsFromWordsData(): UserPlotRow[] {
  return initialWords.filter(isEmotionWord).map(emotionWordToUserPlot);
}

export function mergeWithSeedPlots(plots: UserPlotRow[]): UserPlotRow[] {
  if (plots.length > 0) {
    return plots;
  }
  return seedPlotsFromWordsData();
}
