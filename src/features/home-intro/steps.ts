export type HomeIntroStepKind = 'logo' | 'walk';

/** 空領域の4象限テキスト（左上：キャッチコピー／右上：見出し／左下：行動フレーズ／右下：本文） */
export interface HomeIntroQuadrantContent {
  catchphrase: string;
  /** 改行は '\n' で表現する */
  heading: string;
  actionPhrase: string;
  body: string;
}

export interface HomeIntroStepDefinition {
  id: string;
  kind: HomeIntroStepKind;
  content?: HomeIntroQuadrantContent;
}

/**
 * ①②の仮コピー。方針転換後の書き直し前提のドラフト。
 * 「やばい」は前面に出さず、もやもや全般への共感を主題にする。
 */
export const HOME_INTRO_STEPS: HomeIntroStepDefinition[] = [
  {
    id: 'logo',
    kind: 'logo',
  },
  {
    id: 'trouble',
    kind: 'walk',
    content: {
      catchphrase: 'PLUTCHIKA',
      heading: 'その気持ち、\n「なんとなく」で\n終わらせていませんか。',
      actionPhrase: '気持ちに、名前を。',
      body: 'うれしいのに、どこか寂しい。イライラするのに、理由がよくわからない。私たちは日々、そんな複雑な気持ちを、簡単なひとことで片付けてしまいがちです。',
    },
  },
];
