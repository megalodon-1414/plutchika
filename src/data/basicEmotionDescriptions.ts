import type { BasicEmotionId, EmotionId } from './emotions';
import { DYAD_EMOTIONS, getBasicEmotion } from './emotions';

/**
 * レイヤー1検知時に表示する基本8感情の説明。
 * プルチック環の生存反応としての位置づけを短く縦書き向けにまとめたもの。
 */
export const BASIC_EMOTION_DESCRIPTIONS: Record<BasicEmotionId, string> = {
  joy: '望みが叶ったり、心地よい刺激を受けたときに湧く、前向きで明るい感情。',
  trust: '相手や状況を受け入れ、安心していられるときに生まれる感情。',
  fear: '危険や脅威を感じたときに身を守りたくなる、警戒の感情。',
  surprise: '予想外の出来事に心が揺さぶられたときの、一瞬の反応。',
  sadness: '喪失や失望に触れ、心が沈み込むときに訪れる感情。',
  disgust: '受け入れがたいものから距離を取りたくなる、拒絶の感情。',
  anger: '妨げや不正に対して、立ち向かおうとする強い衝動の感情。',
  anticipation: 'これから起こることを見据え、心を準備しているときの感情。',
};

/**
 * レイヤー2検知時に表示する合成24感情の説明。
 * 距離1〜3の組み合わせごとに短い定義を置く。
 */
const DYAD_EMOTION_DESCRIPTIONS_BY_LABEL: Record<string, string> = {
  愛: '喜びと信頼が重なり、相手を大切に思う温かい結びつき。',
  服従: '信頼と恐れが重なり、権威や相手に従ってしまう状態。',
  畏怖: '恐れと驚きが重なり、圧倒されるような畏れの感覚。',
  失望: '驚きと悲しみが重なり、期待が外れたときの落胆。',
  後悔: '悲しみと嫌悪が重なり、してしまったことを悔やむ気持ち。',
  軽蔑: '嫌悪と怒りが重なり、相手を見下す冷たい非難。',
  攻撃: '怒りと期待が重なり、先手を取って攻めようとする勢い。',
  楽観: '期待と喜びが重なり、これからを明るく見通す気持ち。',
  罪悪: '喜びと恐れが重なり、楽しさの裏で咎めを感じる状態。',
  好奇心: '信頼と驚きが重なり、未知へ近づきたくなる探究心。',
  絶望: '恐れと悲しみが重なり、先が見えなくなる深い落胆。',
  不信: '驚きと嫌悪が重なり、相手や状況を信じられなくなる感覚。',
  嫉妬: '悲しみと怒りが重なり、他人の持つものへの羨望と苛立ち。',
  冷笑: '嫌悪と期待が重なり、相手をあざけりながら見下ろす態度。',
  傲慢: '怒りと喜びが重なり、自分を上に置く高慢な気持ち。',
  希望: '期待と信頼が重なり、良い未来を信じる前向きな見通し。',
  歓喜: '喜びと驚きが重なり、予想を超えた喜びに満たされる状態。',
  感傷: '信頼と悲しみが重なり、懐かしさやしみじみとした想い。',
  羞恥: '恐れと嫌悪が重なり、自分をさらけ出されたときの恥ずかしさ。',
  憤慨: '驚きと怒りが重なり、不当なことに強く反発する気持ち。',
  悲観: '悲しみと期待が重なり、先行きを暗く見積もってしまう状態。',
  病的: '嫌悪と喜びが重なり、歪んだ快さや異常な執着を帯びた感情。',
  支配: '怒りと信頼が重なり、相手を従わせようとする力の感覚。',
  不安: '期待と恐れが重なり、これからへの落ち着かない警戒。',
};

export function getBasicEmotionDescription(id: BasicEmotionId): string {
  return BASIC_EMOTION_DESCRIPTIONS[id];
}

export function getDyadEmotionDescription(id: EmotionId): string {
  const dyad = DYAD_EMOTIONS.find((entry) => entry.id === id);
  if (!dyad) {
    return 'この合成感情の説明はまだ登録されていません。';
  }
  return (
    DYAD_EMOTION_DESCRIPTIONS_BY_LABEL[dyad.label] ??
    `${getBasicEmotion(dyad.components[0]).label}と${getBasicEmotion(dyad.components[1]).label}が重なって生まれる合成感情。`
  );
}
