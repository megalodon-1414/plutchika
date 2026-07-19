/**
 * 球に貼り付けるテキストパネル（PlanetGlobe/TextPanel）が描画できるコンテンツの型。
 * home-intro（必須ルート）・deep-dive（深掘りルート）の両方から共有される。
 */

/**
 * 本文の断片。3Dテキスト（troika-three-text）は1メッシュ＝1スタイルのため、HTMLの<a>のように
 * 文中の一部だけを別スタイル＋クリック可能にすることができない。そのため本文は「断片の配列」として持ち、
 * linkTo を持つ断片だけを別の行として分割描画する（LinkedBodyText参照）。
 */
export interface BodyTextSegment {
  text: string;
  /** 深掘りページ等へのリンク先パス（例: '/deep-dive?panel=1&from=welcome'）。省略時は通常テキスト。 */
  linkTo?: string;
}

/** ようこそパネル用。フック・見出し・サブコピーは左揃え、本文は右揃え。 */
export interface WelcomePanelContent {
  layout: 'welcome';
  hook: string;
  heading: string;
  subcopy: string;
  body: BodyTextSegment[];
}

/** プルチック環パネル用。テキストを左、グラフィックを右に配置する左右分割レイアウト。 */
export interface SplitGraphicPanelContent {
  layout: 'split-graphic';
  hook: string;
  heading: string;
  body: BodyTextSegment[];
  graphic: 'plutchik-wheel';
}

/** 深掘りルート用。見出し＋本文のシンプルな構成（中央揃え、フック／サブコピーなし）。 */
export interface SimplePanelContent {
  layout: 'simple';
  heading: string;
  body: string;
}

export type PlanetPanelContent = WelcomePanelContent | SplitGraphicPanelContent | SimplePanelContent;

interface StepLike {
  content?: PlanetPanelContent;
}

/**
 * 「stepIndexが1進むごとに共有回転角がPANEL_ANGLE_STEPぶん増える」設計に合わせて、
 * 各ステップのコンテンツをパネルスロットへ対応付ける。
 *
 * ベースのチルト角（BASE_TILT）を必ずPANEL_ANGLE_STEPの1つぶんに揃えているため
 * （PlanetGlobe.tsx参照）、あるステップが「読める位置」に運ぶパネル番号は
 * 常に (stepIndex + 1) % panelCount になる（three.jsの行列で数値検証済み、
 * panelCountの値によらず成立する）。
 */
export function buildPanelContents(
  steps: readonly StepLike[],
  panelCount: number,
): (PlanetPanelContent | null)[] {
  const slots: (PlanetPanelContent | null)[] = Array.from({ length: panelCount }, () => null);
  steps.forEach((step, stepIndex) => {
    if (step.content) {
      const panelIndex = (stepIndex + 1) % panelCount;
      slots[panelIndex] = step.content;
    }
  });
  return slots;
}
