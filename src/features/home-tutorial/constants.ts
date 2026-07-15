import { SITE_NAME } from '../../constants/site';
import type { BasicEmotionId } from '../../data/emotions';

/** 初回ローディング画面の最低表示時間（花弁の開花アニメーション用） */
export const HOME_TUTORIAL_LOADING_MIN_MS = 3000;
/** ローディング画面のフェードアウト時間 */
export const HOME_TUTORIAL_LOADING_FADE_MS = 620;
/** ローディング後、環が画面中央から本位置へ移る時間 */
export const HOME_LANDING_INTRO_CENTER_ANCHOR = { x: 0.5, y: 0.5 };
export const HOME_LANDING_INTRO_MOVE_MS = 1100;

/** メイン画面の感情環が置かれる画面上の位置（0〜1、左下が原点） */
export const HOME_MAIN_SCREEN_ANCHOR = { x: 0.28, y: 0.52 };
/** STEP1 がアクティブのとき、点が来る画面位置 */
export const HOME_STEP1_SCREEN_ANCHOR = { x: 0.42, y: 0.52 };
/** STEP2（感情環）がアクティブのときの画面上の焦点 — STEP1 よりやや左寄り */
export const HOME_STEP2_SCREEN_ANCHOR = { x: 0.42, y: 0.52 };
/** STEP3 — 球を画面中央に */
export const HOME_STEP3_SCREEN_ANCHOR = { x: 0.5, y: 0.5 };
/** STEP0 のとき、STEP1 の点が見える想定位置（やや右寄り中央下）— worldPosition 調整の目安 */
export const HOME_STEP1_PREVIEW_ANCHOR = { x: 0.62, y: 0.34 };

export type HomeTutorialPanelVariant = 'intro' | 'emotion-wheel';

/**
 * チュートリアル UI パネルの微調整（scale 前のベース値）。
 * offsetX: +で右へ　offsetY: +で下へ
 * contentScale: 枠・余白・文字・環を一括拡縮（位置オフセットは除く）
 */
export interface HomeTutorialPanelTune {
  width: number;
  height: number;
  rightMarginRatio: number;
  rightMarginMin: number;
  offsetX: number;
  offsetY: number;
  bodyMaxHeight: number;
  innerMinHeight: number;
  wheelSize?: number;
  /** STEP2: 環の下に表示する感情名のフォント（rem ベース） */
  wheelEmotionFontRem?: number;
  /** パネル枠・余白・文字・環サイズをまとめて拡縮（1 = そのまま、0.9 = 10% 縮小） */
  contentScale?: number;
  /** ガイド線の接続先（パネル内の比率 0〜1） */
  guideAnchorX: number;
  guideAnchorY: number;
  /** パネル配置。省略時は右寄せ（従来どおり） */
  align?: 'right' | 'center';
  /** 横書きタイトルのフォント（rem ベース） */
  titleFontRem?: number;
}

export const HOME_TUTORIAL_PANEL_TUNE: Record<HomeTutorialPanelVariant, HomeTutorialPanelTune> = {
  intro: {
    width: 880,
    height: 360,
    rightMarginRatio: 0.16,
    rightMarginMin: 48,
    offsetX: 0,
    offsetY: -12,
    align: 'center',
    contentScale: 0.95,
    bodyMaxHeight: 300,
    innerMinHeight: 0,
    titleFontRem: 1.38,
    guideAnchorX: 0,
    guideAnchorY: 0.5,
  },
  'emotion-wheel': {
    width: 500,
    height: 400,
    rightMarginRatio: 0.14,
    rightMarginMin: 40,
    offsetX: -80,
    offsetY: -50,
    contentScale: 0.8,
    bodyMaxHeight: 300,
    innerMinHeight: 360,
    wheelSize: 168,
    wheelEmotionFontRem: 1.35,
    guideAnchorX: 0.1,
    guideAnchorY: 0.5,
  },
};

/** 行ごとの調整（index 0 から順） */
export interface HomeTutorialIntroFitLineTune {
  /** この行のハコ横幅（rem）。未指定ならブロック共通値 */
  cellWidthRem?: number;
  /** この行のハコ縦幅（rem）。未指定ならブロック共通値 */
  cellHeightRem?: number;
  fontSizeRem?: number;
  wght?: number;
  /**
   * 'auto' = ハコ幅に合わせて wdth / letter-spacing を自動計算（デフォルト）
   * 'manual' = 下の wdth / letterSpacing をそのまま使う
   */
  fit?: 'auto' | 'manual';
  wdth?: number;
  /** 例: '0px', '0.12em', '3px' */
  letterSpacing?: string;
}

/** STEP1 イントロパネル内のレイアウト・タイポ調整（rem はパネル scale 前のベース値） */
export interface HomeTutorialIntroPanelTune {
  catchphrase: {
    /** 白3行ブロックのハコ幅（rem） */
    boxWidthRem: number;
    /** 白3行ブロックのハコ高さ（rem） */
    boxMinHeightRem: number;
    fontSizeRem: number;
    lineHeight: number;
    letterSpacing: string;
    wght: number;
    wdth: number;
    gapPx: number;
  };
  brand: {
    cellWidthRem: number;
    cellHeightRem: number;
    fontSizeRem: number;
    wght: number;
    wdthMin: number;
    wdthMax: number;
    /** true: 残り幅を letter-spacing で埋める */
    autoFillWidth: boolean;
    gapPx: number;
    valign: 'top' | 'bottom';
    lines?: readonly HomeTutorialIntroFitLineTune[];
  };
  welcome: {
    cellWidthRem: number;
    cellHeightRem: number;
    fontSizeRem: number;
    wght: number;
    wdthMin: number;
    wdthMax: number;
    autoFillWidth: boolean;
    gapPx: number;
    valign: 'top' | 'bottom';
    /** ブロック全体の横位置（+で右へ） */
    leftRem: number;
    /** ブロック全体の縦位置（+で上へ） */
    bottomRem: number;
    /** セル内左余白。左端の見切れ対策（+で右へ） */
    paddingLeftRem: number;
    /** false にするとセルからはみ出した文字を切らない */
    clipOverflow: boolean;
    lines?: readonly HomeTutorialIntroFitLineTune[];
  };
  body: {
    fontSizeRem: number;
    lineHeight: number;
    letterSpacing: string;
    wght: number;
    wdth: number;
    gapPx: number;
    paddingTopPx: number;
  };
  layout: {
    rootMinHeightRem: number;
    headerRowGapPx: number;
    lowerMinHeightRem: number;
    glowLeft: string;
    glowTop: string;
    glowWidth: string;
    glowHeight: string;
    glowBlurPx: number;
  };
}

export const HOME_TUTORIAL_INTRO_PANEL_TUNE: HomeTutorialIntroPanelTune = {
  catchphrase: {
    boxWidthRem: 24,
    boxMinHeightRem: 9.5,
    fontSizeRem: 2.2,
    lineHeight: 1.4,
    letterSpacing: '0.04em',
    wght: 700,
    wdth: 100,
    gapPx: 2,
  },
  brand: {
    cellWidthRem: 16.2,
    cellHeightRem: 2.75,
    fontSizeRem: 2.55,
    wght: 700,
    wdthMin: 50,
    wdthMax: 150,
    autoFillWidth: true,
    gapPx: 0,
    valign: 'top',
    // index 0=PLUTCHIKA, 1=へようこそ
    lines: [
      {
        cellWidthRem: 16.5,
        cellHeightRem: 2.8,
        fontSizeRem: 2.6,
        wght: 700,
        fit: 'auto',
      },
      {
        cellWidthRem: 16.5,
        cellHeightRem: 2.8,
        fontSizeRem: 2.2,
        wght: 680,
        fit: 'manual',
        wdth: 200,
        letterSpacing: '0.06em',
      },
    ],
  },
  welcome: {
    // 行未指定時のフォールバック（実値は lines 側）
    cellWidthRem: 10.8,
    cellHeightRem: 2.85,
    fontSizeRem: 2.45,
    wght: 860,
    wdthMin: 50,
    wdthMax: 150,
    autoFillWidth: true,
    gapPx: 0,
    valign: 'bottom',
    leftRem: 0.45,
    bottomRem: 0,
    paddingLeftRem: 0.12,
    clipOverflow: false,
    // index 0=WELCOME, 1=TO THE, 2=ぷるちか
    lines: [
      {
        cellWidthRem: 10.8,
        cellHeightRem: 2.85,
        fontSizeRem: 2.45,
        wght: 860,
        fit: 'manual',
        wdth: 50,
        letterSpacing: '0.02em',
      },
      {
        cellWidthRem: 10.8,
        cellHeightRem: 2.5,
        fontSizeRem: 2.45,
        wght: 900,
        fit: 'manual',
        wdth: 150,
        letterSpacing: '0.11em',
      },
      {
        cellWidthRem: 10.8,
        cellHeightRem: 2.4,
        fontSizeRem: 2.45,
        wght: 860,
        fit: 'manual',
        wdth: 128,
        letterSpacing: '0.20em',
      },
    ],
  },
  body: {
    fontSizeRem: 0.9,
    lineHeight: 1.82,
    letterSpacing: '0.02em',
    wght: 420,
    wdth: 96,
    gapPx: 14,
    paddingTopPx: 8,
  },
  layout: {
    rootMinHeightRem: 20,
    headerRowGapPx: 20,
    lowerMinHeightRem: 13.5,
    glowLeft: '44%',
    glowTop: '8%',
    glowWidth: '52%',
    glowHeight: '88%',
    glowBlurPx: 28,
  },
};

/** STEP2 — STEP1 と同レイアウト、文言差に合わせたタイポ調整 */
export const HOME_TUTORIAL_STEP2_PANEL_TUNE: HomeTutorialIntroPanelTune = {
  ...HOME_TUTORIAL_INTRO_PANEL_TUNE,
  catchphrase: {
    ...HOME_TUTORIAL_INTRO_PANEL_TUNE.catchphrase,
    boxMinHeightRem: 6.2,
  },
  brand: {
    ...HOME_TUTORIAL_INTRO_PANEL_TUNE.brand,
    cellWidthRem: 8.4,
    cellHeightRem: 2.3,
    fontSizeRem: 2.2,
    lines: [
      {
        cellWidthRem: 8.4,
        cellHeightRem: 2.3,
        fontSizeRem: 2.2,
        wght: 700,
        fit: 'auto',
      },
      {
        cellWidthRem: 8.4,
        cellHeightRem: 2.3,
        fontSizeRem: 2.2,
        wght: 700,
        fit: 'auto',
      },
    ],
  },
  welcome: {
    ...HOME_TUTORIAL_INTRO_PANEL_TUNE.welcome,
    cellWidthRem: 10,
    cellHeightRem: 2.85,
    fontSizeRem: 2.45,
    lines: [
      {
        cellWidthRem: 10,
        cellHeightRem: 2.85,
        fontSizeRem: 2.45,
        wght: 860,
        fit: 'auto',
      },
      {
        cellWidthRem: 10,
        cellHeightRem: 2.85,
        fontSizeRem: 2.45,
        wght: 860,
        fit: 'auto',
      },
    ],
  },
  body: {
    ...HOME_TUTORIAL_INTRO_PANEL_TUNE.body,
    gapPx: 14,
  },
};

/** STEP3 — 仮テキスト用（STEP2 と同じレイアウト骨格） */
export const HOME_TUTORIAL_STEP3_PANEL_TUNE: HomeTutorialIntroPanelTune = {
  ...HOME_TUTORIAL_STEP2_PANEL_TUNE,
  welcome: {
    ...HOME_TUTORIAL_STEP2_PANEL_TUNE.welcome,
    cellWidthRem: 12,
    lines: [
      {
        cellWidthRem: 12,
        cellHeightRem: 3.1,
        fontSizeRem: 2.6,
        wght: 860,
        fit: 'auto',
      },
    ],
  },
};

/** STEP3 本文用 — 8基本感情の短い説明（名前行の下に続ける2行） */
export const HOME_TUTORIAL_BASIC_EMOTION_BLURBS: Record<
  BasicEmotionId,
  readonly [string, string]
> = {
  joy: ['うれしい・楽しいなど、', '前向きな快の感情。'],
  trust: ['相手や状況を', '安心していられる感覚。'],
  fear: ['危険を感じ、', '身を守ろうとする感情。'],
  surprise: ['予想外のことに', '反応する瞬間の感情。'],
  sadness: ['喪失や落ち込みを', '伴う哀しい感情。'],
  disgust: ['拒否・忌避したいと', '感じる感情。'],
  anger: ['侵害や不正に対する', '強い反発。'],
  anticipation: ['これから起こることを', '待ち望む感情。'],
};

/**
 * STEP3 本文用 — 合成感情の短い説明（名前行の下に続ける2行）。
 * キーは dyad.label。
 */
export const HOME_TUTORIAL_DYAD_EMOTION_BLURBS: Record<string, readonly [string, string]> = {
  // distance 1
  愛: ['喜びと信頼が重なり、', '相手を大切に想う気持ち。'],
  服従: ['信頼と恐れが重なり、', '従って身を預ける感覚。'],
  畏怖: ['恐れと驚きが重なり、', '圧倒されてたじろぐ感覚。'],
  失望: ['驚きと悲しみが重なり、', '期待が外れて落ち込む気持ち。'],
  後悔: ['悲しみと嫌悪が重なり、', 'やってしまったことを悔やむ気持ち。'],
  軽蔑: ['嫌悪と怒りが重なり、', '相手を見下すような反感。'],
  攻撃: ['怒りと期待が重なり、', '向かっていきたい衝動。'],
  楽観: ['期待と喜びが重なり、', 'うまくいくと感じる前向きさ。'],
  // distance 2
  罪悪: ['喜びと恐れが混ざり、', '楽しさの裏にある咎めの感覚。'],
  好奇心: ['信頼と驚きが混ざり、', '知らないものへ惹かれる気持ち。'],
  絶望: ['恐れと悲しみが混ざり、', 'どうにもならない重たい感覚。'],
  不信: ['驚きと嫌悪が混ざり、', '信じきれず警戒する気持ち。'],
  嫉妬: ['悲しみと怒りが混ざり、', '奪われたと思う疼き。'],
  冷笑: ['嫌悪と期待が混ざり、', '見透かしてあざ笑う気持ち。'],
  傲慢: ['怒りと喜びが混ざり、', '自分が上に立つような勢い。'],
  希望: ['期待と信頼が混ざり、', 'よい未来を信じたい気持ち。'],
  // distance 3
  歓喜: ['喜びと驚きが混ざり、', '思いがけない喜びに包まれる感覚。'],
  感傷: ['信頼と悲しみが混ざり、', '優しさのなかでしみじみする気持ち。'],
  恥: ['恐れと嫌悪が混ざり、', '見られたくない羞じらい。'],
  憤慨: ['驚きと怒りが混ざり、', '不当さにかっとなる反応。'],
  悲観: ['悲しみと期待が混ざり、', '先行きを暗く見積もる気持ち。'],
  病的: ['嫌悪と喜びが混ざり、', '快と不快がねじれた感覚。'],
  支配: ['怒りと信頼が混ざり、', '抑え込み導こうとする勢い。'],
  不安: ['期待と恐れが混ざり、', 'まだ来ないことへのざわめき。'],
};

export interface HomeTutorialStepContent {
  sectionLabel: string;
  ticker: string;
  title: string;
  titleRuby: string;
  body: string;
  note: string;
  /** STEP1/2 横書きパネル用 */
  catchphraseLines?: readonly string[];
  welcomeSiteName?: string;
  welcomeSubline?: string;
  welcomeDecorLines?: readonly string[];
  bodyParagraphs?: readonly string[];
}

export interface HomeTutorialStepDefinition {
  id: string;
  /** このステップがアクティブのときの画面上の焦点（0〜1、左下が原点） */
  screenAnchor: { x: number; y: number };
  worldPosition: [number, number, number];
  cameraYaw?: number;
  cameraPitch?: number;
  cameraDistance?: number;
  sphereColor: string;
  /** メイン画面の環＋ロゴオーバーレイを表示 */
  showLandingChrome?: boolean;
  /** 右側のチュートリアル UI パネルを表示 */
  showIntroPanel?: boolean;
  panelVariant?: HomeTutorialPanelVariant;
  content?: HomeTutorialStepContent;
}

/** 球の半径（大きくするほど点が大きい） */
export const HOME_TUTORIAL_SPHERE_RADIUS = 0.12;
export const HOME_TUTORIAL_ACTIVE_SPHERE_SCALE = 1.22;
export const HOME_TUTORIAL_HOVER_SPHERE_SCALE = 1.16;
export const HOME_TUTORIAL_ACTIVE_HOVER_SCALE_BOOST = 1.06;

/** ステップ1以降のカメラヨー角 — 奥側から見て点が縦一列に並ぶ */
const HOME_TUTORIAL_PATH_CAMERA_YAW = Math.PI / 2;
export const HOME_TUTORIAL_PANEL_FADE_MS = 320;
export const HOME_TUTORIAL_CAMERA_TRANSITION_MS = 780;

export const HOME_TUTORIAL_STEPS: HomeTutorialStepDefinition[] = [
  {
    id: 'main',
    screenAnchor: HOME_MAIN_SCREEN_ANCHOR,
    worldPosition: [0, 0.12, 0],
    cameraYaw: 0,
    cameraPitch: -0.04,
    sphereColor: '#e8dff0',
    showLandingChrome: true,
    showIntroPanel: false,
  },
  {
    id: 'intro',
    screenAnchor: HOME_STEP1_SCREEN_ANCHOR,
    /** ステップ0視点では右寄りに見えるよう X をずらす（ステップ1視点ではほぼ縦一列） */
    worldPosition: [1.5, -1.9, 0.06],
    cameraYaw: HOME_TUTORIAL_PATH_CAMERA_YAW,
    /** 従来 -0.05 から約 5° さらに見下ろし（やや上からの俯瞰） */
    cameraPitch: -0.03,
    sphereColor: '#c39bd3',
    showIntroPanel: true,
    panelVariant: 'intro',
    content: {
      sectionLabel: '',
      ticker: '',
      title: '',
      titleRuby: '',
      body: '',
      note: '',
      catchphraseLines: [
        '心のもやもやに',
        'ピッタリなことばを',
        'みつける場所です。',
      ],
      welcomeSiteName: SITE_NAME,
      welcomeSubline: 'へようこそ',
      welcomeDecorLines: ['WELCOME', 'TO THE', 'ぷるちか'],
      bodyParagraphs: [
        '私たちは毎日、たくさんの感情の中で生きています。「なんだか心が落ち着かない」「うれしいけれど、どこか寂しい」……。そんな風に、自分の気持ちをうまく言葉にできず、モヤモヤした経験はありませんか？',
        '心理学では、自分の感情にぴったりな「名前」をつけてあげるだけで、脳のストレスが和らぎ、心がすっと整うことが分かっています。',
        '「Plutchika（ぷるちか）」は、あなたの「心の現在地」を定義するためのwebサイトです。',
      ],
    },
  },
  {
    id: 'emotion-wheel',
    screenAnchor: HOME_STEP2_SCREEN_ANCHOR,
    worldPosition: [3.5, -2.5, 0.2],
    cameraYaw: HOME_TUTORIAL_PATH_CAMERA_YAW,
    cameraPitch: -0.7,
    sphereColor: '#8ecae6',
    showIntroPanel: true,
    panelVariant: 'intro',
    content: {
      sectionLabel: '',
      ticker: '',
      title: '',
      titleRuby: '',
      body: '',
      note: '',
      catchphraseLines: [
        '感情環をもとに',
        '感情をマッピング',
        'しました。',
      ],
      welcomeSiteName: 'プルチックの',
      welcomeSubline: '感情環とは',
      welcomeDecorLines: ['感情環を','体験する'],
      bodyParagraphs: [
        'ロバート・プルチック（1927~2006）は８つの基本感情に色と位置を与えることで、感情を図として表しました。',
        'さらに、それぞれの感情は混ざりあうとして、副次的な24の感情が定義されています。',
        'このサイトではこの感情環と混同24感情を用いて感情語に位置を与え、3D空間に並べることで、あなたが感情の名前を探すお手伝いをしています。',
      ],
    },
  },
  {
    id: 'emotion-petals',
    screenAnchor: HOME_STEP3_SCREEN_ANCHOR,
    worldPosition: [5, -3.5, 0.2],
    cameraYaw: HOME_TUTORIAL_PATH_CAMERA_YAW,
    cameraPitch: -0.4,
    cameraDistance: 5.4,
    sphereColor: '#ffffff',
    showIntroPanel: true,
    panelVariant: 'intro',
    content: {
      sectionLabel: '',
      ticker: '',
      title: '',
      titleRuby: '',
      body: '',
      note: '',
      catchphraseLines: [
        '色に触れると',
        '感情を確認できます。',
      ],
      welcomeSiteName: '8感情と',
      welcomeSubline: '混合感情',
      welcomeDecorLines: ['領域を選択'],
      bodyParagraphs: [],
    },
  },
];
