import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import {
  findDyadByComponents,
  getEmotionById,
  isBasicEmotionId,
} from '../../data/emotions';
import type { UserPlotRow } from '../../types/userPlot';
import { getLayer3SegmentIndexForPlot } from './layer3Segments';
import { getTelescopeRegionDefinition } from './layer3Region';

/** `/telescope` へ戻るときに location.state へ載せるキー */
export const TELESCOPE_RESTORE_STATE_KEY = 'telescopeRestore' as const;

/** 単語詳細から Map（探索レイヤー）へ戻すための復元情報 */
export interface TelescopeExplorationRestorePayload {
  wordId: string;
}

export type TelescopeLocationState = {
  [TELESCOPE_RESTORE_STATE_KEY]?: TelescopeExplorationRestorePayload;
};

export function buildTelescopeRestoreState(
  plot: UserPlotRow,
): TelescopeLocationState {
  return {
    [TELESCOPE_RESTORE_STATE_KEY]: { wordId: plot.word_id },
  };
}

export interface TelescopeExplorationRestoreTarget {
  dyadId: EmotionId;
  focusBasicId: BasicEmotionId;
  segmentIndex: number;
  wordId: string;
}

/**
 * 単語の主／副感情から、望遠鏡の探索レイヤー（最終階層）へ戻すための座標を求める。
 * 復元できない組み合わせのときは null。
 */
export function resolveTelescopeExplorationRestore(
  plot: UserPlotRow,
): TelescopeExplorationRestoreTarget | null {
  let dyadId: EmotionId | null = null;

  if (plot.primaryId.startsWith('dyad-')) {
    dyadId = plot.primaryId;
  } else if (plot.secondaryId.startsWith('dyad-')) {
    dyadId = plot.secondaryId;
  } else if (
    isBasicEmotionId(plot.primaryId) &&
    isBasicEmotionId(plot.secondaryId)
  ) {
    dyadId =
      findDyadByComponents(plot.primaryId, plot.secondaryId)?.id ?? null;
  }

  if (!dyadId) {
    return null;
  }

  const emotion = getEmotionById(dyadId);
  if (!('components' in emotion)) {
    return null;
  }

  let focusBasicId: BasicEmotionId = emotion.components[0];
  if (
    isBasicEmotionId(plot.primaryId) &&
    emotion.components.includes(plot.primaryId)
  ) {
    focusBasicId = plot.primaryId;
  } else if (
    isBasicEmotionId(plot.secondaryId) &&
    emotion.components.includes(plot.secondaryId)
  ) {
    focusBasicId = plot.secondaryId;
  }

  const region = getTelescopeRegionDefinition(dyadId, focusBasicId);
  if (!region) {
    return null;
  }

  const segmentIndex = getLayer3SegmentIndexForPlot(region, plot);
  if (segmentIndex < 0) {
    return null;
  }

  return {
    dyadId,
    focusBasicId,
    segmentIndex,
    wordId: plot.word_id,
  };
}
