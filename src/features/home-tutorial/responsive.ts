const VIEWPORT_WIDTH_WIDE = 1200;
const VIEWPORT_WIDTH_NARROW = 520;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 横幅 wideAt → narrowAt の間で線形補間（wide 時 = wideValue） */
export function viewportMix(
  viewportWidth: number,
  wideValue: number,
  narrowValue: number,
  wideAt = VIEWPORT_WIDTH_WIDE,
  narrowAt = VIEWPORT_WIDTH_NARROW,
): number {
  const span = wideAt - narrowAt;
  const t = span <= 0 ? 0 : clamp01((wideAt - viewportWidth) / span);
  return wideValue + (narrowValue - wideValue) * t;
}

export interface ScreenAnchor {
  x: number;
  y: number;
}

export function getResponsiveScreenAnchor(
  stepId: string,
  viewportWidth: number,
  fallback: ScreenAnchor,
): ScreenAnchor {
  switch (stepId) {
    case 'main':
      return {
        x: viewportMix(viewportWidth, fallback.x, 0.24),
        y: viewportMix(viewportWidth, fallback.y, 0.5),
      };
    case 'intro':
      return {
        x: viewportMix(viewportWidth, fallback.x, 0.3),
        y: viewportMix(viewportWidth, fallback.y, 0.48),
      };
    case 'emotion-wheel':
      return {
        x: viewportMix(viewportWidth, fallback.x, 0.22),
        y: viewportMix(viewportWidth, fallback.y, 0.5),
      };
    default:
      return fallback;
  }
}

export type IntroPanelLayoutMode = 'wide' | 'narrow';

export function getIntroPanelLayoutMode(
  viewportWidth: number,
  panelWidth: number,
): IntroPanelLayoutMode {
  if (viewportWidth < 640 || panelWidth < 560) {
    return 'narrow';
  }
  return 'wide';
}

/** スマホ時のみステップごとの worldPosition 上書き */
export function getStepWorldPosition(
  stepId: string,
  worldPosition: readonly [number, number, number],
  viewportWidth: number,
): [number, number, number] {
  if (viewportWidth < 640 && stepId === 'emotion-wheel') {
    return [worldPosition[0], worldPosition[1], -0.2];
  }
  return [...worldPosition];
}

export interface IntroPanelResponsiveLayout {
  mode: IntroPanelLayoutMode;
  /** パネル内コンテンツ幅に対するキャッチコピー幅（0〜1） */
  catchphraseWidthRatio: number;
  /** welcome ブロックの cellWidth をパネル幅比率で上書きする係数 */
  welcomeWidthRatio: number;
  brandWidthRatio: number;
  bodyMarginLeft: string;
  bodyMaxWidth: string;
  bodyTextAlign: 'left' | 'right';
  bodyAlignSelf: 'stretch' | 'flex-end';
  /** スマホ時の文字・ハコ拡大率 */
  contentScale: number;
  lowerMarginTopPx: number;
}

export function getIntroPanelResponsiveLayout(
  viewportWidth: number,
  panelWidth: number,
): IntroPanelResponsiveLayout {
  const mode = getIntroPanelLayoutMode(viewportWidth, panelWidth);

  if (mode === 'narrow') {
    return {
      mode,
      catchphraseWidthRatio: 1,
      welcomeWidthRatio: 0.92,
      brandWidthRatio: 1,
      bodyMarginLeft: 'auto',
      bodyMaxWidth: '58%',
      bodyTextAlign: 'right',
      bodyAlignSelf: 'flex-end',
      contentScale: 1.5,
      lowerMarginTopPx: viewportMix(viewportWidth, 28, 18),
    };
  }

  return {
    mode,
    catchphraseWidthRatio: viewportMix(viewportWidth, 0.52, 0.58),
    welcomeWidthRatio: viewportMix(viewportWidth, 0.42, 0.48),
    brandWidthRatio: viewportMix(viewportWidth, 0.48, 0.52),
    bodyMarginLeft: `${viewportMix(viewportWidth, 52, 46).toFixed(1)}%`,
    bodyMaxWidth: `${viewportMix(viewportWidth, 53, 58).toFixed(1)}%`,
    bodyTextAlign: 'left',
    bodyAlignSelf: 'stretch',
    contentScale: 1,
    lowerMarginTopPx: viewportMix(viewportWidth, 28, 22),
  };
}

/** rem ベース値をパネル幅に収まるよう上限をかける */
export function capRemToPanelWidth(
  remValue: number,
  panelWidthRatio: number,
  uiScale: number,
  panelWidthPx: number,
): number {
  const fromRem = remValue * 16 * uiScale;
  const fromPanel = panelWidthPx * panelWidthRatio;
  if (fromRem <= fromPanel) {
    return remValue;
  }
  return fromPanel / (16 * uiScale);
}
