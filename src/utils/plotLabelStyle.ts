import { SELECTED_PLOT_SCALE } from './plotSelectionStyle';
import type { UserPlotRow } from '../types/userPlot';
import { EMOTION_INTENSITY_MAX } from '../utils/emotionPlotBridge';

const MIN_FONT_SIZE = 3;
const MAX_FONT_SIZE = 7;
const FONT_SIZE_RATIO = 0.013;
const DISTANCE_FACTOR_RATIO = 0.5;
const FONT_WEIGHT_MIN = 400;
const FONT_WEIGHT_MAX = 700;

export type PlotLabelDisplayMode = 'flow' | 'nearby';

export const FLOW_LABEL_DURATION_MS = 3000;
const FLOW_LABEL_FADE_IN_MS = 350;
const FLOW_LABEL_FADE_OUT_MS = 500;

function easeFade(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

export function getFlowLabelFadeFactor(
  expiresAt: number,
  now: number,
  durationMs = FLOW_LABEL_DURATION_MS,
): number {
  const startedAt = expiresAt - durationMs;
  const elapsed = now - startedAt;
  const remaining = expiresAt - now;

  if (remaining <= 0 || elapsed < 0) {
    return 0;
  }
  if (elapsed < FLOW_LABEL_FADE_IN_MS) {
    return easeFade(elapsed / FLOW_LABEL_FADE_IN_MS);
  }
  if (remaining < FLOW_LABEL_FADE_OUT_MS) {
    return easeFade(remaining / FLOW_LABEL_FADE_OUT_MS);
  }
  return 1;
}

export interface PlotLabelStyle {
  fontSize: string;
  distanceFactor: number;
  screenOffsetY: number;
}

export interface PlotLabelTypography {
  fontWeight: number;
}

export function getPlotLabelStyle(
  viewportWidth: number,
  viewportHeight: number,
  isSelected: boolean,
  selectedScale = SELECTED_PLOT_SCALE,
): PlotLabelStyle {
  const minDim = Math.min(viewportWidth, viewportHeight);
  const baseFontSize = Math.round(
    Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, minDim * FONT_SIZE_RATIO)),
  );
  const fontSize = isSelected ? Math.round(baseFontSize * selectedScale) : baseFontSize;
  const sphereGap = Math.round(baseFontSize * 0.7 + 10);
  const screenOffsetY = isSelected ? Math.round(sphereGap * selectedScale) : sphereGap;

  return {
    fontSize: `${fontSize}px`,
    distanceFactor: baseFontSize * DISTANCE_FACTOR_RATIO,
    screenOffsetY,
  };
}

export function getPlotLabelTypography(plot: UserPlotRow, isSelected: boolean): PlotLabelTypography {
  const intensityNorm = plot.intensity / EMOTION_INTENSITY_MAX;
  const selectedWeightBoost = isSelected ? 100 : 0;
  const fontWeight = Math.round(
    Math.min(
      FONT_WEIGHT_MAX,
      FONT_WEIGHT_MIN + intensityNorm * (FONT_WEIGHT_MAX - FONT_WEIGHT_MIN) + selectedWeightBoost,
    ),
  );

  return {
    fontWeight,
  };
}
