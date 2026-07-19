import type { UserPlotRow } from '../../types/userPlot';
import { getTelescopePlotPosition } from './telescopePlotLayout';
import {
  TELESCOPE_REGION_VIEW,
  telescopeRegionToUnifiedSpace,
  type TelescopeRegionDefinition,
} from './layer3Region';

/** バー中央部（混合領域）の分割数 */
export const LAYER3_BAR_MID_SEGMENT_COUNT = 6;
export const LAYER3_BAR_SEGMENT_GAP = 0.018;
/** 両端の純粋感情ゾーンの円形セグメント半径（バー幅比） */
export const LAYER3_PURE_SEGMENT_RADIUS_RATIO = 0.48;
export const LAYER3_BAR_HIGHLIGHT_RADIUS_NDC = 0.32;

export type Layer3SegmentKind = 'pure-start' | 'mid' | 'pure-end';

export interface Layer3SegmentLayout {
  /** 0 = start側の円、1..N = 中央、N+1 = end側の円 */
  index: number;
  kind: Layer3SegmentKind;
  /** 中点からのバー方向ローカル X（midpoint 基準） */
  centerAlong: number;
  length: number;
  halfWidth: number;
  pureRadius: number;
}

export interface Layer3SegmentFocus {
  /** 画面中央に最も近く、かつ点を含む区画。なければ null */
  segmentIndex: number | null;
  /** その区画に属する word_id 一覧 */
  plotIds: readonly string[];
  /** 中央への近さ 0..1（ハイライト用） */
  closeness: number;
}

export function getLayer3SegmentLayout(
  width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2,
): Layer3SegmentLayout[] {
  const pureRadius = width * LAYER3_PURE_SEGMENT_RADIUS_RATIO;
  const halfSpan = TELESCOPE_REGION_VIEW.spanLength / 2;
  const midHalf = halfSpan - pureRadius;
  const segmentLength = (midHalf * 2) / LAYER3_BAR_MID_SEGMENT_COUNT;
  const halfWidth = width / 2;

  const segments: Layer3SegmentLayout[] = [
    {
      index: 0,
      kind: 'pure-start',
      centerAlong: -halfSpan,
      length: pureRadius * 2,
      halfWidth,
      pureRadius,
    },
  ];

  for (let index = 0; index < LAYER3_BAR_MID_SEGMENT_COUNT; index++) {
    segments.push({
      index: index + 1,
      kind: 'mid',
      centerAlong: -midHalf + segmentLength * (index + 0.5),
      length: segmentLength,
      halfWidth,
      pureRadius,
    });
  }

  segments.push({
    index: LAYER3_BAR_MID_SEGMENT_COUNT + 1,
    kind: 'pure-end',
    centerAlong: halfSpan,
    length: pureRadius * 2,
    halfWidth,
    pureRadius,
  });

  return segments;
}

/** 区画中心の統一空間ワールド座標 */
export function getLayer3SegmentWorldCenter(
  region: TelescopeRegionDefinition,
  segmentIndex: number,
  width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2,
): [number, number, number] {
  const segments = getLayer3SegmentLayout(width);
  const segment =
    segments[segmentIndex] ??
    segments[Math.floor(segments.length / 2)] ??
    segments[0];
  const [ux, uy] = region.direction;
  return [
    region.midpoint[0] + ux * segment.centerAlong,
    region.midpoint[1] + uy * segment.centerAlong,
    0,
  ];
}

/** 統一空間上の (x,y) が属する区画 index。範囲外は -1 */
export function getLayer3SegmentIndexAt(
  region: TelescopeRegionDefinition,
  x: number,
  y: number,
  width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2,
): number {
  const segments = getLayer3SegmentLayout(width);
  const pureRadius = width * LAYER3_PURE_SEGMENT_RADIUS_RATIO;
  const halfSpan = TELESCOPE_REGION_VIEW.spanLength / 2;
  const midHalf = halfSpan - pureRadius;
  const segmentLength = (midHalf * 2) / LAYER3_BAR_MID_SEGMENT_COUNT;
  const [ux, uy] = region.direction;
  const relX = x - region.midpoint[0];
  const relY = y - region.midpoint[1];
  const along = relX * ux + relY * uy;
  const perp = ux * relY - uy * relX;

  if (Math.hypot(along + halfSpan, perp) <= pureRadius) {
    return 0;
  }
  if (Math.hypot(along - halfSpan, perp) <= pureRadius) {
    return segments.length - 1;
  }
  const index = Math.floor((along + midHalf) / segmentLength);
  if (index >= 0 && index < LAYER3_BAR_MID_SEGMENT_COUNT) {
    return index + 1;
  }
  return -1;
}

/**
 * 区画ごとの所属プロット ID を返す。
 * 純粋感情は time で公転するため、呼び出し側で elapsedTime を渡す。
 */
export function groupPlotsByLayer3Segment(
  region: TelescopeRegionDefinition,
  plots: readonly UserPlotRow[],
  time = 0,
  width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2,
): Map<number, string[]> {
  const bySegment = new Map<number, string[]>();
  for (const plot of plots) {
    const real = getTelescopePlotPosition(plot, time);
    const [x, y] = telescopeRegionToUnifiedSpace(region, real[0], real[1]);
    const index = getLayer3SegmentIndexAt(region, x, y, width);
    if (index < 0) {
      continue;
    }
    const list = bySegment.get(index) ?? [];
    list.push(plot.word_id);
    bySegment.set(index, list);
  }
  return bySegment;
}

/** 区画内からランダムに開始点を1つ選ぶ。空なら null */
export function pickRandomPlotIdInSegment(
  plotIds: readonly string[],
): string | null {
  if (plotIds.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * plotIds.length);
  return plotIds[index] ?? null;
}
