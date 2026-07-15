import type { ExplorationInfoUiLayout } from '../../utils/explorationInfoUiLayout';
import type { HomeTutorialPanelVariant } from './constants';
import { HOME_TUTORIAL_PANEL_TUNE } from './constants';
import { viewportMix } from './responsive';

const HOME_BASE_MIN_DIM = 600;
const HOME_MIN_SCALE = 0.82;
const HOME_MAX_SCALE = 2.0;
const VIEWPORT_WIDTH_WIDE = 1200;
const VIEWPORT_WIDTH_NARROW = 520;
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scaleValue(value: number, scale: number): number {
  return Math.round(value * scale);
}

function scaleRem(value: number, scale: number): string {
  return `${(value * scale).toFixed(3)}rem`;
}

export type HomeTutorialVerticalPanel = ExplorationInfoUiLayout['currentWordPanel'] & {
  wheelSize?: number;
  wheelEmotionFontSize?: string;
};

export interface HomeTutorialPanelLayoutResult {
  scale: number;
  panel: HomeTutorialVerticalPanel;
  guideAnchor: { x: number; y: number };
}

function getScaledPanelMetrics(
  viewportWidth: number,
  viewportHeight: number,
  variant: HomeTutorialPanelVariant,
): HomeTutorialPanelLayoutResult {
  const tune = HOME_TUTORIAL_PANEL_TUNE[variant];
  const minDim = Math.min(viewportWidth, viewportHeight);
  const widthScale = clamp(minDim / HOME_BASE_MIN_DIM, HOME_MIN_SCALE, HOME_MAX_SCALE);
  const widthT = Math.min(
    1,
    Math.max(0, (VIEWPORT_WIDTH_WIDE - viewportWidth) / (VIEWPORT_WIDTH_WIDE - VIEWPORT_WIDTH_NARROW)),
  );
  const contentScale = (tune.contentScale ?? 1) * (variant === 'intro' ? 1 - widthT * 0.08 : 1);
  const scale = widthScale;
  const s = (value: number) => scaleValue(value, scale * contentScale);

  const horizontalMargin = Math.round(viewportMix(viewportWidth, 80, 20));
  const width = Math.min(s(tune.width), viewportWidth - horizontalMargin);
  const baseHeight = s(tune.height);
  const heightBoost = variant === 'intro' ? viewportMix(viewportWidth, 1, 1.85) : 1;
  const boostedHeight = Math.round(baseHeight * heightBoost);
  const minIntroHeight = variant === 'intro'
    ? Math.round(viewportHeight * viewportMix(viewportWidth, 0, 0.9))
    : 0;
  const height = Math.min(
    Math.max(boostedHeight, minIntroHeight),
    viewportHeight - 12,
  );
  const rightMargin = Math.max(s(tune.rightMarginMin), viewportWidth * tune.rightMarginRatio);
  const offsetYExtra = variant === 'intro' ? Math.round(viewportMix(viewportWidth, 0, 36)) : 0;
  const x = tune.align === 'center'
    ? (viewportWidth - width) / 2 + scaleValue(tune.offsetX, scale)
    : viewportWidth - width - rightMargin + scaleValue(tune.offsetX, scale);
  const y = Math.max(
    s(12),
    (viewportHeight - height) / 2 + scaleValue(tune.offsetY, scale) + offsetYExtra,
  );
  const titleFontRem = tune.titleFontRem ?? 2.5;

  return {
    scale,
    panel: {
      x,
      y,
      width,
      height,
      paddingX: s(20),
      paddingY: s(20),
      borderRadius: s(10),
      gap: s(14),
      innerGap: s(10),
      bodyTextGap: s(16),
      innerMinHeight: s(tune.innerMinHeight),
      wordColumnWidth: s(56),
      tickerHeight: s(20),
      tickerFontSize: scaleRem(0.72, scale * contentScale),
      sectionLabelFontSize: scaleRem(0.72, scale * contentScale),
      wordFontSize: scaleRem(titleFontRem, scale * contentScale),
      bodyFontSize: scaleRem(variant === 'intro' ? 0.92 : 1.0, scale * contentScale),
      dlFontSize: scaleRem(0.9, scale * contentScale),
      usageFontSize: scaleRem(1.092, scale * contentScale),
      metaFontSize: scaleRem(0.75, scale * contentScale),
      bodyMaxHeight: s(tune.bodyMaxHeight),
      intensityBarWidth: s(8),
      intensityBarHeight: s(160),
      columnGap: s(14),
      rowGap: s(8),
      paddingLeft: s(14),
      arrowBorder: s(5),
      wheelSize: tune.wheelSize != null ? s(tune.wheelSize) : undefined,
      wheelEmotionFontSize:
        tune.wheelEmotionFontRem != null
          ? scaleRem(tune.wheelEmotionFontRem, scale * contentScale)
          : undefined,
    },
    guideAnchor: {
      x: tune.guideAnchorX,
      y: tune.guideAnchorY,
    },
  };
}

export function getHomeTutorialPanelLayout(
  viewportWidth: number,
  viewportHeight: number,
  variant: HomeTutorialPanelVariant,
): HomeTutorialPanelLayoutResult {
  return getScaledPanelMetrics(viewportWidth, viewportHeight, variant);
}
