import type { BasicEmotionId } from './emotions';
import { BASIC_EMOTIONS } from './emotions';
import { blendHexColorsHsl } from '../utils/hslBlend';

/**
 * plutchika-panel3-32emotions-instructions.md 準拠の32感情対応表。
 *
 * 指示書は基本感情を数値ID（1〜8）で扱う。BASIC_EMOTIONS の並び順
 * （joy, trust, fear, surprise, sadness, disgust, anger, anticipation）が
 * 指示書の1〜8（喜び, 信頼, 恐れ, 驚き, 悲しみ, 嫌悪, 怒り, 期待）と完全一致するため、
 * 「配列インデックス + 1」がそのまま数値IDになる。
 *
 * 注意: 既存の DYAD_EMOTIONS（emotions.ts、自動生成の暫定データ）とは語彙が一致しない
 * （例: 既存「畏怖」に対し指示書は「畏敬」）。この対応表は指示書の内容を優先してそのまま
 * 埋め込んだ、panel-3専用の別データとして扱う。
 */

function basicEmotionNumericId(id: BasicEmotionId): number {
  return BASIC_EMOTIONS.findIndex((emotion) => emotion.id === id) + 1;
}

function basicEmotionByNumericId(numericId: number) {
  return BASIC_EMOTIONS[numericId - 1];
}

export type DyadTier = 'primary' | 'secondary' | 'tertiary';

interface DyadEntry {
  name: string;
  tier: DyadTier;
}

/** key: "a-b" ( a < b ) */
const DYAD_TABLE: Record<string, DyadEntry> = {
  // primary（円環距離1・隣接）
  '1-2': { name: '愛', tier: 'primary' },
  '2-3': { name: '服従', tier: 'primary' },
  '3-4': { name: '畏敬', tier: 'primary' },
  '4-5': { name: '失望', tier: 'primary' },
  '5-6': { name: '自責', tier: 'primary' },
  '6-7': { name: '軽蔑', tier: 'primary' },
  '7-8': { name: '積極性', tier: 'primary' },
  '1-8': { name: '楽観', tier: 'primary' },

  // secondary（円環距離2・1つ飛ばし）
  '1-3': { name: '罪悪感', tier: 'secondary' },
  '3-5': { name: '絶望', tier: 'secondary' },
  '5-7': { name: '羨望', tier: 'secondary' },
  '1-7': { name: '誇り', tier: 'secondary' },
  '2-4': { name: '好奇心', tier: 'secondary' },
  '4-6': { name: '不信', tier: 'secondary' },
  '6-8': { name: '冷笑', tier: 'secondary' },
  '2-8': { name: '希望', tier: 'secondary' },

  // tertiary（円環距離3・2つ飛ばし）
  '1-4': { name: '歓喜', tier: 'tertiary' },
  '1-6': { name: '病的状態', tier: 'tertiary' },
  '3-6': { name: '恥', tier: 'tertiary' },
  '3-8': { name: '不安', tier: 'tertiary' },
  '2-5': { name: '感傷', tier: 'tertiary' },
  '5-8': { name: '悲観', tier: 'tertiary' },
  '2-7': { name: '優位', tier: 'tertiary' },
  '4-7': { name: '憤慨', tier: 'tertiary' },
};

/** 8つの基本感情が円環状に並んでいる前提での、2点間の最短距離（0〜4）。 */
export function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 8 - diff);
}

export type CombinedEmotionTier = 'basic8' | DyadTier | 'opposite';

export interface CombinedEmotionResult {
  name: string;
  color: string;
  tier: CombinedEmotionTier;
}

/** 対極（円環距離4）の場合の表示。組み合わせ感情は存在しないため、メッセージとして返す。 */
const OPPOSITE_MESSAGE = '対極の感情です';
const OPPOSITE_COLOR = '#8a8a9a';

/**
 * 2つの基本感情から組み合わせ感情を求める。
 * - 同じ感情同士 → ピュア感情（basic8の名前・色をそのまま）
 * - 円環距離1〜3 → 対応表の名前＋2色をHSL混色した色
 * - 円環距離4（対極） → メッセージ（例：喜び⇔悲しみ）
 */
export function getCombinedEmotion(idA: BasicEmotionId, idB: BasicEmotionId): CombinedEmotionResult {
  const a = basicEmotionNumericId(idA);
  const b = basicEmotionNumericId(idB);

  if (a === b) {
    const basic = basicEmotionByNumericId(a);
    return { name: basic.label, color: basic.color, tier: 'basic8' };
  }

  const distance = circularDistance(a, b);
  if (distance === 4) {
    return { name: OPPOSITE_MESSAGE, color: OPPOSITE_COLOR, tier: 'opposite' };
  }

  const [lo, hi] = a < b ? [a, b] : [b, a];
  const entry = DYAD_TABLE[`${lo}-${hi}`];
  if (!entry) {
    return { name: OPPOSITE_MESSAGE, color: OPPOSITE_COLOR, tier: 'opposite' };
  }

  const colorA = basicEmotionByNumericId(a).color;
  const colorB = basicEmotionByNumericId(b).color;
  return { name: entry.name, color: blendHexColorsHsl(colorA, colorB), tier: entry.tier };
}
