export type HomeIntroStepKind = 'logo' | 'walk';

/** ようこそパネル用。フック・見出し・サブコピーは左揃え、本文は右揃え。 */
export interface WelcomePanelContent {
  layout: 'welcome';
  hook: string;
  heading: string;
  subcopy: string;
  body: string;
}

/** プルチック環パネル用。テキストを左、グラフィックを右に配置する左右分割レイアウト。 */
export interface SplitGraphicPanelContent {
  layout: 'split-graphic';
  hook: string;
  heading: string;
  body: string;
  graphic: 'plutchik-wheel';
}

export type HomeIntroPanelContent = WelcomePanelContent | SplitGraphicPanelContent;

export interface HomeIntroStepDefinition {
  id: string;
  kind: HomeIntroStepKind;
  content?: HomeIntroPanelContent;
}

/**
 * ①〜③のコピー。④搭乗演出はまだ未実装（このスクロールの先に予定）。
 * 「やばい」は前面に出さず、もやもや全般への共感を主題にする。
 */
export const HOME_INTRO_STEPS: HomeIntroStepDefinition[] = [
  {
    id: 'logo',
    kind: 'logo',
  },
  {
    id: 'welcome',
    kind: 'walk',
    content: {
      layout: 'welcome',
      hook: '心のもやもやにピッタリなことばを、みつける場所です。',
      heading: 'PLUTCHIKA(ぷるちか)へようこそ',
      subcopy: 'WELCOME TO THE ぷるちか',
      body: '私たちは毎日、たくさんの感情の中で生きています。「なんだか心が落ち着かない」「うれしいけれど、どこか寂しい」……。そんな風に、自分の気持ちをうまく言葉にできず、モヤモヤした経験はありませんか？　心理学では、自分の感情にぴったりな「名前」をつけてあげるだけで、脳のストレスが和らぎ、心がすっと整うことが分かっています。「Plutchika(ぷるちか)」は、あなたの「心の現在地」を定義するためのwebサイトです。',
    },
  },
  {
    id: 'emotion-wheel',
    kind: 'walk',
    content: {
      layout: 'split-graphic',
      hook: '感情の語彙をマッピングしました。',
      heading: 'プルチックの感情環とは',
      body: '心理学者プルチックは、8つの基本感情に色と位置を与え、感情を1枚の地図として表しました。PLUTCHIKAは、この感情環をもとに、感情を表す言葉ひとつひとつに位置を与え、マッピングしています。気になる花びらに、触れてみてください。',
      graphic: 'plutchik-wheel',
    },
  },
];
