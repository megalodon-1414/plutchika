import type { SimplePanelContent } from '../home-intro/panelContent';

export interface DeepDivePanelDefinition {
  /** アンカーID（panel-1〜panel-5）。必須ルート側からのリンク先指定に使う。 */
  id: string;
  content: SimplePanelContent;
}

/**
 * 深掘りルートの5パネル。表示順は必ずこの並び（1→2→3→4→5）。
 * 本文はまだ仮のプレースホルダー（plutchika-fukabori-route-instructions.md より）。最終テキストは別途詰める。
 */
export const DEEP_DIVE_PANELS: DeepDivePanelDefinition[] = [
  {
    id: 'panel-1',
    content: {
      layout: 'simple',
      heading: '名づけると、なぜ心は落ち着くのか',
      body: '心理学には「感情ラベリング」という考え方があります。悲しいとき、怒っているとき、その気持ちに具体的な名前をつけるだけで、扁桃体という脳の警報装置のような部分の反応が静まることが、脳科学の研究で示されています。',
    },
  },
  {
    id: 'panel-2',
    content: {
      layout: 'simple',
      heading: '語彙がないと、感情は"見えない"',
      body: '心理学者リサ・フェルドマン・バレットは、感情を細かく言い分けられる能力を「感情粒度」と呼びました。感情は、名前という道具がなければ輪郭を結べません。',
    },
  },
  {
    id: 'panel-3',
    content: {
      layout: 'simple',
      heading: 'プルチックはなぜ「8つ」を選んだのか',
      body: '心理学者ロバート・プルチックは、喜び・信頼・恐れ・驚き・悲しみ・嫌悪・怒り・期待という8つを、生存に関わる基本的な反応として位置づけました。隣り合う感情同士が混ざり合うことで「後悔」や「愛」のような複合的な感情が生まれる、という考え方も提示しました。',
    },
  },
  {
    id: 'panel-4',
    content: {
      layout: 'simple',
      heading: '探しに行くのではなく、出会いに行く',
      body: '欲しい言葉が最初からわかっているなら、検索窓に打ち込めば済みます。PLUTCHIKAが感情の地図を歩いて回る形にしているのは、探しているつもりのなかった言葉に、たまたま出会ってもらうためです。',
    },
  },
  {
    id: 'panel-5',
    content: {
      layout: 'simple',
      heading: 'なぜ、ゆっくり歩くような体験にしたのか',
      body: '何かに没頭しているとき、人は時間を忘れ、集中力が高まります。心理学ではこれを「フロー状態」と呼びます。',
    },
  },
];
