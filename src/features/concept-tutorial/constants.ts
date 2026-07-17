export interface ConceptTutorialStepContent {
  heading: string;
  catchphraseLines: readonly string[];
  welcomeSiteName?: string;
  welcomeSubline?: string;
  welcomeDecorLines?: readonly string[];
  bodyParagraphs: readonly string[];
}

export interface ConceptTutorialStepDefinition {
  id: string;
  worldPosition: [number, number, number];
  cameraYaw?: number;
  cameraPitch?: number;
  cameraDistance?: number;
  sphereColor: string;
  content: ConceptTutorialStepContent;
}

export const CONCEPT_TUTORIAL_STEPS: ConceptTutorialStepDefinition[] = [
  {
    id: 'labeling',
    worldPosition: [-2.25, -0.1, 0.28],
    cameraYaw: Math.PI / 2.15,
    cameraPitch: -0.03,
    cameraDistance: 4.6,
    sphereColor: '#e88ca0',
    content: {
      heading: '名前をつけると、心は落ち着く',
      catchphraseLines: ['言葉にすると、', '心は少し', '落ち着きます。'],
      welcomeSiteName: '感情ラベリング',
      welcomeSubline: 'とは',
      welcomeDecorLines: ['気持ちに', '名前をつける'],
      bodyParagraphs: [
        '「なんだかモヤモヤする」——そんな気持ちを、PLUTCHIKAでラベル化。',
        '心理学の実験では、感じていることをただ言葉にするだけで、脳の中で不安や恐怖を感じる部分の働きが落ち着くことが分かっています(心理学者リーバーマンの研究より)。',
      ],
    },
  },
  {
    id: 'granularity',
    worldPosition: [-0.55, 0.3, 0.16],
    cameraYaw: Math.PI / 2.15,
    cameraPitch: -0.12,
    cameraDistance: 4.8,
    sphereColor: '#f0b25f',
    content: {
      heading: '「やばい」の中に、まだ気づいていない気持ちがある',
      catchphraseLines: ['「やばい」の中に、', 'まだ名前のない', '気持ちがある。'],
      welcomeSiteName: '感情粒度',
      welcomeSubline: 'とは',
      welcomeDecorLines: ['気持ちの', '解像度を上げる'],
      bodyParagraphs: [
        '嬉しいときも、悔しいときも、驚いたときも——つい「やばい」で済ませていませんか？',
        '感情を細かく言い分けられる人ほど、ストレスにうまく対処でき、気持ちの切り替えも早いことが研究で分かっています(心理学者バレットの研究より)。',
        '一言で終わらせていた気持ちに、もう一歩近い言葉を。それがPLUTCHIKAの役割です。',
      ],
    },
  },
  {
    id: 'exploration',
    worldPosition: [1.05, 0.74, 0.16],
    cameraYaw: Math.PI / 2.05,
    cameraPitch: -0.16,
    cameraDistance: 4.9,
    sphereColor: '#6ec6c1',
    content: {
      heading: '探すのではなく、出会う',
      catchphraseLines: ['探すのでは', 'なく、', '出会うということ。'],
      welcomeSiteName: 'セレンディピティ',
      welcomeSubline: 'とは',
      welcomeDecorLines: ['偶然の言葉と', '出会う'],
      bodyParagraphs: [
        '紙の辞書をめくっていて、探していた言葉の隣にあった言葉に、つい目がとまったことはありませんか？',
        'こうした偶然の出会いは、新しい言葉や考え方に触れるきっかけになると言われています。',
        'PLUTCHIKAの3Dの空間を歩き回ること自体が、言葉と出会う体験を生み出します。',
      ],
    },
  },
  {
    id: 'flow',
    worldPosition: [2.8, 1.1, 0.16],
    cameraYaw: Math.PI / 2.12,
    cameraPitch: -0.18,
    cameraDistance: 5.1,
    sphereColor: '#b39ddb',
    content: {
      heading: '気づいたら、探し続けていた',
      catchphraseLines: ['気づいたら、', '探し続ける設計。'],
      welcomeSiteName: 'フロー理論',
      welcomeSubline: 'とは',
      welcomeDecorLines: ['没入できる', '設計にする'],
      bodyParagraphs: [
        '簡単すぎず、難しすぎない。ちょうどいい挑戦のときに、人は時間を忘れて夢中になれると言われています(心理学者チクセントミハイの「フロー理論」より)。',
        '目的地を決めずにぶらぶら歩くような体験は、疲れた頭を休ませる効果があるとも言われています。',
        'PLUTCHIKAの空間は、この「夢中になれる」「ちょっと一息つける」という感覚を大事にデザインしています。',
      ],
    },
  },
];
