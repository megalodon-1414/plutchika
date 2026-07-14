import type { ExplorationInfoUiLayout } from '../../utils/explorationInfoUiLayout';
import type { HomeTutorialPanelVariant } from './constants';
import { HOME_TUTORIAL_PANEL_TUNE } from './constants';

const HOME_BASE_MIN_DIM = 600;
const HOME_MIN_SCALE = 0.82;
const HOME_MAX_SCALE = 2.0;

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
  const scale = clamp(minDim / HOME_BASE_MIN_DIM, HOME_MIN_SCALE, HOME_MAX_SCALE);
  const contentScale = tune.contentScale ?? 1;
  const s = (value: number) => scaleValue(value, scale * contentScale);

  const width = s(tune.width);
  const height = s(tune.height);
  const rightMargin = Math.max(s(tune.rightMarginMin), viewportWidth * tune.rightMarginRatio);
  const x = viewportWidth - width - rightMargin + scaleValue(tune.offsetX, scale);
  const y = Math.max(s(12), (viewportHeight - height) / 2 + scaleValue(tune.offsetY, scale));

  return {
    scale,
    panel: {
      x,
      y,
      width,
      height,
      paddingX: s(16),
      paddingY: s(18),
      borderRadius: s(10),
      gap: s(18),
      innerGap: s(12),
      bodyTextGap: s(28),
      innerMinHeight: s(tune.innerMinHeight),
      wordColumnWidth: s(56),
      tickerHeight: s(20),
      tickerFontSize: scaleRem(0.72, scale * contentScale),
      sectionLabelFontSize: scaleRem(0.72, scale * contentScale),
      wordFontSize: scaleRem(2.5, scale * contentScale),
      bodyFontSize: scaleRem(1.0, scale * contentScale),
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
