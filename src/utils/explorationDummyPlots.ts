import {
  ALL_EMOTIONS,
  BASIC_EMOTIONS,
  DYAD_EMOTIONS,
  isBasicEmotionId,
  type BasicEmotionId,
  type EmotionId,
} from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { clampIntensity, normalizeUserPlotRow } from './emotionPlotBridge';

export const EXPLORATION_DUMMY_PREFIX = '探索-';

/** 探索モード手触り確認用のダミー単語数（基本感情あたりの純粋＋混合） */
export const EXPLORATION_DUMMY_PER_BASIC = 5;
export const EXPLORATION_DUMMY_PER_DYAD = 2;
export const EXPLORATION_DUMMY_EXTRA = 24;

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickSecondary(components: [BasicEmotionId, BasicEmotionId], rand: () => number): BasicEmotionId {
  return rand() < 0.5 ? components[0] : components[1];
}

function intensityBetween(rand: () => number, min: number, max: number): number {
  return clampIntensity(min + rand() * (max - min));
}

function makePlot(
  word_id: string,
  primaryId: EmotionId,
  secondaryId: BasicEmotionId,
  intensity: number,
): UserPlotRow {
  return normalizeUserPlotRow({ word_id, primaryId, secondaryId, intensity });
}

export function isExplorationDummyPlot(wordId: string): boolean {
  return wordId.startsWith(EXPLORATION_DUMMY_PREFIX);
}

/**
 * 感情空間全体にばらけたダミー単語を生成する。
 * 基本8感情には純粋＋混合、24中間感情にも少数ずつ配置する。
 */
export function generateExplorationDummyPlots(seed = 20260408): UserPlotRow[] {
  const rand = createSeededRandom(seed);
  const plots: UserPlotRow[] = [];
  let serial = 1;

  const nextId = (label: string) => {
    const id = `${EXPLORATION_DUMMY_PREFIX}${String(serial).padStart(3, '0')}-${label}`;
    serial += 1;
    return id;
  };

  for (const basic of BASIC_EMOTIONS) {
    for (let i = 0; i < EXPLORATION_DUMMY_PER_BASIC; i += 1) {
      const pure = i < 2 || rand() < 0.35;
      if (pure) {
        plots.push(
          makePlot(
            nextId(basic.label),
            basic.id,
            basic.id,
            intensityBetween(rand, 12, 49),
          ),
        );
        continue;
      }

      const neighbor = BASIC_EMOTIONS[Math.floor(rand() * BASIC_EMOTIONS.length)].id;
      plots.push(
        makePlot(
          nextId(basic.label),
          basic.id,
          neighbor,
          intensityBetween(rand, 15, 46),
        ),
      );
    }
  }

  for (const dyad of DYAD_EMOTIONS) {
    for (let i = 0; i < EXPLORATION_DUMMY_PER_DYAD; i += 1) {
      plots.push(
        makePlot(
          nextId(dyad.label),
          dyad.id,
          pickSecondary(dyad.components, rand),
          intensityBetween(rand, 14, 45),
        ),
      );
    }
  }

  for (let i = 0; i < EXPLORATION_DUMMY_EXTRA; i += 1) {
    const emotion = ALL_EMOTIONS[Math.floor(rand() * ALL_EMOTIONS.length)];
    if (isBasicEmotionId(emotion.id)) {
      const secondary =
        rand() < 0.4
          ? emotion.id
          : BASIC_EMOTIONS[Math.floor(rand() * BASIC_EMOTIONS.length)].id;
      plots.push(
        makePlot(nextId('散在'), emotion.id, secondary, intensityBetween(rand, 8, 42)),
      );
    } else if ('components' in emotion) {
      plots.push(
        makePlot(
          nextId('散在'),
          emotion.id,
          pickSecondary(emotion.components, rand),
          intensityBetween(rand, 10, 44),
        ),
      );
    }
  }

  return plots;
}

export function mergeExplorationDummyPlots(
  plots: UserPlotRow[],
  includeDummies: boolean,
): UserPlotRow[] {
  if (!includeDummies) {
    return plots;
  }

  const existingIds = new Set(plots.map((plot) => plot.word_id));
  const dummies = generateExplorationDummyPlots().filter((plot) => !existingIds.has(plot.word_id));
  return [...plots, ...dummies];
}
