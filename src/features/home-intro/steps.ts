import { ROUTES } from '../../routes/paths';
import type { PlanetPanelContent } from './panelContent';

export type HomeIntroStepKind = 'logo' | 'walk';

export interface HomeIntroStepDefinition {
  id: string;
  kind: HomeIntroStepKind;
  content?: PlanetPanelContent;
}

/**
 * ①〜③のコピー。④搭乗はステップの枠だけ用意した仮画面（content未定、UIは後日実装）。
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
      body: [
        {
          text: '私たちは毎日、たくさんの感情の中で生きています。「なんだか心が落ち着かない」「うれしいけれど、どこか寂しい」……。そんな風に、自分の気持ちをうまく言葉にできず、モヤモヤした経験はありませんか？　',
        },
        { text: '心理学', linkTo: `${ROUTES.deepDive}?panel=1&from=welcome` },
        {
          text: 'では、自分の感情にぴったりな「名前」をつけてあげるだけで、脳のストレスが和らぎ、心がすっと整うことが分かっています。「Plutchika(ぷるちか)」は、あなたの「心の現在地」を定義するためのwebサイトです。',
        },
      ],
    },
  },
  {
    id: 'emotion-wheel',
    kind: 'walk',
    content: {
      layout: 'split-graphic',
      hook: '感情の語彙をマッピングしました。',
      heading: 'プルチックの感情環とは',
      body: [
        { text: '心理学者プルチックが考案した「' },
        { text: 'プルチック環', linkTo: `${ROUTES.deepDive}?panel=3&from=emotion-wheel` },
        {
          text: '」は、8つの基本感情に色と位置を与え、感情をひとつの地図として表したものです。PLUTCHIKAは、このプルチック環をもとに、感情を表す言葉をひとつひとつ段階に分けて位置づけ、マッピングしました。大きな感情から、少しずつニュアンスの違う言葉へ——地図の上を「',
        },
        { text: '探索', linkTo: `${ROUTES.deepDive}?panel=4&from=emotion-wheel` },
        {
          text: 'するように辿っていくと、今のあなたにぴったりな一語が見つかるはずです。さあ、その言葉を探しに行きましょう。',
        },
      ],
      graphic: 'plutchik-wheel',
    },
  },
  {
    id: 'boarding',
    kind: 'walk',
    // content未定：搭乗演出のUI・コピーは後日実装。歩行・回転の枠だけ先に用意している。
  },
];
