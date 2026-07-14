import type { EmotionId } from '../data/emotions';
import {
  BASIC_EMOTIONS,
  DYAD_EMOTIONS,
  getBasicEmotion,
  getEmotionById,
  isBasicEmotionId,
} from '../data/emotions';
import type { EmotionWord } from '../types/word';
import type { LegacyUserPlotRow, UserPlotRow } from '../types/userPlot';
import { findNearestBasicEmotionByAngle, findNearestEmotionByAngle } from './emotionSpaceLayout';
import { blendHex, pureColorByIntensity } from './emotionColor';

export interface EmotionPlotParams {
  primaryId: EmotionId;
  secondaryId: EmotionId;
  intensity: number;
  isPure: boolean;
}

export const EMOTION_INTENSITY_MAX = 50;

export function clampIntensity(value: number): number {
  return Math.max(0, Math.min(EMOTION_INTENSITY_MAX, Math.round(value)));
}

export function rescaleLegacyIntensity(value: number): number {
  return clampIntensity(value / 2);
}

export function isPurePlot(row: Pick<UserPlotRow, 'primaryId' | 'secondaryId'>): boolean {
  return row.primaryId === row.secondaryId;
}

export function rowToEmotionParams(row: UserPlotRow): EmotionPlotParams {
  return {
    primaryId: row.primaryId,
    secondaryId: row.secondaryId,
    intensity: clampIntensity(row.intensity),
    isPure: isPurePlot(row),
  };
}

export function createDefaultPlotRow(wordId?: string): UserPlotRow {
  return {
    word_id: wordId ?? `w-${Date.now()}`,
    primaryId: 'joy',
    secondaryId: 'joy',
    intensity: 50,
  };
}

export function normalizeUserPlotRow(row: UserPlotRow): UserPlotRow {
  return {
    word_id: row.word_id,
    primaryId: row.primaryId,
    secondaryId: row.secondaryId,
    intensity: clampIntensity(row.intensity),
    meaning: row.meaning,
    usageExample: row.usageExample,
    ruby: row.ruby,
    wordType: row.wordType,
    primaryLabel: row.primaryLabel,
    secondaryLabel: row.secondaryLabel,
    sourceId: row.sourceId,
  };
}

function fromHueSaturation(word_id: string, hue: number, saturation: number): UserPlotRow {
  const primaryId = findNearestEmotionByAngle(hue);
  const nearestBasic = findNearestBasicEmotionByAngle(hue);
  const secondaryId = isBasicEmotionId(primaryId) ? primaryId : nearestBasic;

  return normalizeUserPlotRow({
    word_id,
    primaryId,
    secondaryId,
    intensity: rescaleLegacyIntensity(saturation),
  });
}

function fromEmotionVector(word_id: string, emotions: Record<string, number>): UserPlotRow {
  const ranked = BASIC_EMOTIONS.map((emotion) => ({
    id: emotion.id,
    value: Math.max(0, Number(emotions[emotion.id] ?? 0)),
  })).sort((a, b) => b.value - a.value);

  const top = ranked[0];
  const second = ranked[1];

  if (!top || top.value <= 0) {
    return createDefaultPlotRow(word_id);
  }

  const matchingDyad = DYAD_EMOTIONS.find(
    (dyad) =>
      dyad.components.includes(top.id) &&
      dyad.components.includes(second?.id ?? top.id) &&
      (second?.value ?? 0) >= top.value * 0.35,
  );

  if (matchingDyad) {
    return normalizeUserPlotRow({
      word_id,
      primaryId: matchingDyad.id,
      secondaryId: second.id,
      intensity: rescaleLegacyIntensity((top.value + second.value) / 2),
    });
  }

  return normalizeUserPlotRow({
    word_id,
    primaryId: top.id,
    secondaryId: top.id,
    intensity: rescaleLegacyIntensity(top.value),
  });
}

export function parseUserPlotRow(row: unknown): UserPlotRow | null {
  if (!row || typeof row !== 'object') return null;
  const data = row as Record<string, unknown>;
  const word_id = typeof data.word_id === 'string' ? data.word_id : null;
  if (!word_id) return null;

  if (typeof data.primary_id === 'string' || typeof data.primaryId === 'string') {
    const primaryId = (data.primary_id ?? data.primaryId) as EmotionId;
    const secondaryId = (data.secondary_id ?? data.secondaryId ?? primaryId) as EmotionId;
    const intensity = clampIntensity(Number(data.intensity ?? 50));
    return normalizeUserPlotRow({ word_id, primaryId, secondaryId, intensity });
  }

  if (data.mode === 'state') {
    return null;
  }

  const legacy = data as unknown as LegacyUserPlotRow;
  if (legacy.emotions && typeof legacy.emotions === 'object') {
    return fromEmotionVector(word_id, legacy.emotions);
  }

  if (typeof legacy.hue === 'number') {
    return fromHueSaturation(word_id, legacy.hue, legacy.saturation ?? 50);
  }

  return createDefaultPlotRow(word_id);
}

export function emotionWordToUserPlot(word: EmotionWord): UserPlotRow {
  return fromHueSaturation(word.id, word.angle, word.intensity);
}

export function getPrimaryEmotionColor(id: EmotionId): string {
  if (isBasicEmotionId(id)) {
    return getBasicEmotion(id).color;
  }
  const dyad = getEmotionById(id);
  if ('components' in dyad) {
    const [a, b] = dyad.components;
    return blendHex(getBasicEmotion(a).color, getBasicEmotion(b).color, 0.5);
  }
  return '#ffffff';
}

export function emotionPlotColor(params: EmotionPlotParams): string {
  const primary = getPrimaryEmotionColor(params.primaryId);

  if (params.isPure) {
    return pureColorByIntensity(primary, params.intensity);
  }

  const secondary = getPrimaryEmotionColor(params.secondaryId);
  return blendHex(primary, secondary, params.intensity / EMOTION_INTENSITY_MAX);
}
