export type BasicEmotionId =
  | 'joy'
  | 'trust'
  | 'fear'
  | 'surprise'
  | 'sadness'
  | 'disgust'
  | 'anger'
  | 'anticipation';

export type EmotionId = BasicEmotionId | `dyad-${number}`;

export interface BasicEmotion {
  id: BasicEmotionId;
  label: string;
  angle: number;
  elevated: boolean;
  color: string;
}

export interface DyadEmotion {
  id: `dyad-${number}`;
  label: string;
  components: [BasicEmotionId, BasicEmotionId];
  distance: 1 | 2 | 3;
}

export const BASIC_EMOTIONS: readonly BasicEmotion[] = [
  { id: 'joy', label: '喜び', angle: 0, elevated: true, color: '#f5d547' },
  { id: 'trust', label: '信頼', angle: 45, elevated: false, color: '#7bc96f' },
  { id: 'fear', label: '恐れ', angle: 90, elevated: true, color: '#6b5b95' },
  { id: 'surprise', label: '驚き', angle: 135, elevated: false, color: '#88d8e8' },
  { id: 'sadness', label: '悲しみ', angle: 180, elevated: true, color: '#5b7db1' },
  { id: 'disgust', label: '嫌悪', angle: 225, elevated: false, color: '#b565a7' },
  { id: 'anger', label: '怒り', angle: 270, elevated: true, color: '#e84855' },
  { id: 'anticipation', label: '期待', angle: 315, elevated: false, color: '#f4a442' },
] as const;

const DYAD_LABELS: Record<1 | 2 | 3, string[]> = {
  1: ['愛', '服従', '畏怖', '失望', '後悔', '軽蔑', '攻撃', '楽観'],
  2: ['罪悪', '好奇心', '絶望', '不信', '嫉妬', '冷笑', '傲慢', '希望'],
  // 3つ隣: 喜び+驚き=歓喜、信頼+悲しみ=感傷、恐れ+嫌悪=羞恥、…
  3: ['歓喜', '感傷', '羞恥', '憤慨', '悲観', '病的', '支配', '不安'],
};

function buildDyads(): DyadEmotion[] {
  const dyads: DyadEmotion[] = [];
  const labelIndex: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };

  for (const distance of [1, 2, 3] as const) {
    for (let i = 0; i < 8; i++) {
      const j = (i + distance) % 8;
      const a = BASIC_EMOTIONS[i].id;
      const b = BASIC_EMOTIONS[j].id;
      dyads.push({
        id: `dyad-${dyads.length}`,
        label: DYAD_LABELS[distance][labelIndex[distance]++],
        components: [a, b],
        distance,
      });
    }
  }

  return dyads;
}

export const DYAD_EMOTIONS = buildDyads();

export const ALL_EMOTIONS = [...BASIC_EMOTIONS, ...DYAD_EMOTIONS];

export function isBasicEmotionId(id: EmotionId): id is BasicEmotionId {
  return BASIC_EMOTIONS.some((emotion) => emotion.id === id);
}

export function getBasicEmotion(id: BasicEmotionId): BasicEmotion {
  return BASIC_EMOTIONS.find((emotion) => emotion.id === id)!;
}

export function getEmotionById(id: EmotionId): BasicEmotion | DyadEmotion {
  if (isBasicEmotionId(id)) {
    return getBasicEmotion(id);
  }
  return DYAD_EMOTIONS.find((emotion) => emotion.id === id)!;
}
