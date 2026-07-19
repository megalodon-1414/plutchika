import type { UserPlotRow } from '../../types/userPlot';
import { isPurePlot } from '../../utils/emotionPlotBridge';
import { getTelescopePlotPosition } from './telescopePlotLayout';
import {
  TELESCOPE_REGION_VIEW,
  telescopeRegionToUnifiedSpace,
  type TelescopeRegionDefinition,
} from './layer3Region';

/** バー中央部（混合領域）の分割数。中央円を挟んで半分ずつに割る */
export const LAYER3_BAR_MID_SEGMENT_COUNT = 6;
/** 片側あたりの矩形セグメント数 */
export const LAYER3_BAR_MID_SEGMENTS_PER_SIDE = LAYER3_BAR_MID_SEGMENT_COUNT / 2;
/** 全セグメント数（両端円 + 中央円 + 矩形×6） */
export const LAYER3_SEGMENT_COUNT = LAYER3_BAR_MID_SEGMENT_COUNT + 3;
export const LAYER3_BAR_SEGMENT_GAP = 0.018;
/** 両端の純粋感情ゾーンの円形セグメント半径（バー幅比） */
export const LAYER3_PURE_SEGMENT_RADIUS_RATIO = 0.48;
/** 中央（24感情）の円形セグメント半径（バー幅比） */
export const LAYER3_DYAD_SEGMENT_RADIUS_RATIO = 0.48;
export const LAYER3_BAR_HIGHLIGHT_RADIUS_NDC = 0.32;

export type Layer3SegmentKind = 'pure-start' | 'mid' | 'dyad' | 'pure-end';

export interface Layer3SegmentLayout {
  /**
   * 0 = start側の円、1..S = 左側矩形、S+1 = 中央（24感情）の円、
   * S+2..2S+1 = 右側矩形、2S+2 = end側の円（S = 片側矩形数）
   */
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

/** レイアウト計算に使う共通寸法 */
export function getLayer3SegmentMetrics(
  width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2,
) {
  const pureRadius = width * LAYER3_PURE_SEGMENT_RADIUS_RATIO;
  const dyadRadius = width * LAYER3_DYAD_SEGMENT_RADIUS_RATIO;
  const halfSpan = TELESCOPE_REGION_VIEW.spanLength / 2;
  const midHalf = halfSpan - pureRadius;
  // 片側の矩形ゾーンは端円の内側から中央円の外側まで
  const segmentLength =
    (midHalf - dyadRadius) / LAYER3_BAR_MID_SEGMENTS_PER_SIDE;
  return { pureRadius, dyadRadius, halfSpan, midHalf, segmentLength };
}

export function getLayer3SegmentLayout(
  width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2,
): Layer3SegmentLayout[] {
  const { pureRadius, dyadRadius, halfSpan, midHalf, segmentLength } =
    getLayer3SegmentMetrics(width);
  const halfWidth = width / 2;
  const perSide = LAYER3_BAR_MID_SEGMENTS_PER_SIDE;

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

  for (let index = 0; index < perSide; index++) {
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
    index: perSide + 1,
    kind: 'dyad',
    centerAlong: 0,
    length: dyadRadius * 2,
    halfWidth,
    pureRadius: dyadRadius,
  });

  for (let index = 0; index < perSide; index++) {
    segments.push({
      index: perSide + 2 + index,
      kind: 'mid',
      centerAlong: dyadRadius + segmentLength * (index + 0.5),
      length: segmentLength,
      halfWidth,
      pureRadius,
    });
  }

  segments.push({
    index: LAYER3_SEGMENT_COUNT - 1,
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
  const { pureRadius, dyadRadius, halfSpan, midHalf, segmentLength } =
    getLayer3SegmentMetrics(width);
  const perSide = LAYER3_BAR_MID_SEGMENTS_PER_SIDE;
  const [ux, uy] = region.direction;
  const relX = x - region.midpoint[0];
  const relY = y - region.midpoint[1];
  const along = relX * ux + relY * uy;
  const perp = ux * relY - uy * relX;

  if (Math.hypot(along + halfSpan, perp) <= pureRadius) {
    return 0;
  }
  if (Math.hypot(along, perp) <= dyadRadius) {
    return perSide + 1;
  }
  if (Math.hypot(along - halfSpan, perp) <= pureRadius) {
    return LAYER3_SEGMENT_COUNT - 1;
  }
  if (along >= -midHalf && along < -dyadRadius) {
    const index = Math.min(
      perSide - 1,
      Math.floor((along + midHalf) / segmentLength),
    );
    return index + 1;
  }
  if (along > dyadRadius && along <= midHalf) {
    const index = Math.min(
      perSide - 1,
      Math.floor((along - dyadRadius) / segmentLength),
    );
    return perSide + 2 + index;
  }
  return -1;
}

/**
 * バー上の progress（0=start … 1=end）が属する区画 index。
 * カメラ位置に連動するガイドラベル用。
 */
export function getLayer3SegmentIndexForProgress(
  progress: number,
  width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2,
): number {
  const { pureRadius, dyadRadius, halfSpan, midHalf, segmentLength } =
    getLayer3SegmentMetrics(width);
  const perSide = LAYER3_BAR_MID_SEGMENTS_PER_SIDE;
  const along =
    (Math.min(1, Math.max(0, progress)) - 0.5) *
    TELESCOPE_REGION_VIEW.spanLength;

  if (Math.abs(along + halfSpan) <= pureRadius) {
    return 0;
  }
  if (Math.abs(along) <= dyadRadius) {
    return perSide + 1;
  }
  if (Math.abs(along - halfSpan) <= pureRadius) {
    return LAYER3_SEGMENT_COUNT - 1;
  }
  if (along >= -midHalf && along < -dyadRadius) {
    const index = Math.min(
      perSide - 1,
      Math.floor((along + midHalf) / segmentLength),
    );
    return index + 1;
  }
  if (along > dyadRadius && along <= midHalf) {
    const index = Math.min(
      perSide - 1,
      Math.floor((along - dyadRadius) / segmentLength),
    );
    return perSide + 2 + index;
  }
  // 端円の外側にわずかに出た場合は近い端へ寄せる
  return along < 0 ? 0 : LAYER3_SEGMENT_COUNT - 1;
}

/**
 * レイヤー3ガイドラベル用の区画文言。
 * 例（悲しみ・悲観・期待）:
 * 悲しみ / 悲観よりの悲しみ / 悲しみと悲観の中間 / 悲しみよりの悲観 /
 * 悲観 / 期待よりの悲観 / 期待と悲観の中間 / 悲観よりの期待 / 期待
 */
export function getLayer3SegmentGuideLabel(
  segmentIndex: number,
  startLabel: string,
  midLabel: string,
  endLabel: string,
): string {
  const perSide = LAYER3_BAR_MID_SEGMENTS_PER_SIDE;
  const dyadIndex = perSide + 1;
  if (segmentIndex <= 0) {
    return startLabel;
  }
  if (segmentIndex >= LAYER3_SEGMENT_COUNT - 1) {
    return endLabel;
  }
  if (segmentIndex === dyadIndex) {
    return midLabel;
  }

  if (segmentIndex <= perSide) {
    const slot = segmentIndex - 1;
    if (perSide === 1 || (slot > 0 && slot < perSide - 1)) {
      return `${startLabel}と${midLabel}の中間`;
    }
    if (slot === 0) {
      return `${midLabel}よりの${startLabel}`;
    }
    return `${startLabel}よりの${midLabel}`;
  }

  const slot = segmentIndex - (perSide + 2);
  if (perSide === 1 || (slot > 0 && slot < perSide - 1)) {
    return `${endLabel}と${midLabel}の中間`;
  }
  if (slot === 0) {
    return `${endLabel}よりの${midLabel}`;
  }
  return `${midLabel}よりの${endLabel}`;
}

/**
 * プロット単位の所属区画。
 * 公転する純粋感情プロットは位置に関係なく、常にその感情の円形セグメント
 * （start/end の純粋円・中央の24感情円）に固定する。
 */
export function getLayer3SegmentIndexForPlot(
  region: TelescopeRegionDefinition,
  plot: UserPlotRow,
  time = 0,
  width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2,
): number {
  if (isPurePlot(plot)) {
    if (plot.primaryId === region.start.id) {
      return 0;
    }
    if (plot.primaryId === region.end.id) {
      return LAYER3_SEGMENT_COUNT - 1;
    }
    if (plot.primaryId === region.id) {
      return LAYER3_BAR_MID_SEGMENTS_PER_SIDE + 1;
    }
  }
  const real = getTelescopePlotPosition(plot, time);
  const [x, y] = telescopeRegionToUnifiedSpace(region, real[0], real[1]);
  return getLayer3SegmentIndexAt(region, x, y, width);
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
    const index = getLayer3SegmentIndexForPlot(region, plot, time, width);
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
