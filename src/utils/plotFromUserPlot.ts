import type { UserPlotRow } from '../types/userPlot';
import { emotionPlotColor, rowToEmotionParams } from './emotionPlotBridge';
import { getEmotionPlotPosition, type PlotOrbitOverride } from './emotionPlotPosition';
import { getEmotionCenter, getEmotionSphereRadius } from './emotionSpaceLayout';
import { findPlotByKey, getPlotKey } from './plotIdentity';

export type { PlotOrbitOverride } from './emotionPlotPosition';

export function plotColorFromRow(row: UserPlotRow): string {
  return emotionPlotColor(rowToEmotionParams(row));
}

export function plotPositionFromRow(
  row: UserPlotRow,
  time = 0,
  orbitOverride?: PlotOrbitOverride,
): [number, number, number] {
  return getEmotionPlotPosition(rowToEmotionParams(row), row.word_id, time, orbitOverride);
}

const NEARBY_PLOT_RADIUS = 2.5 * 1.5;
/** 強度差がこれ以上なら別の回転グループにする（大きいほどまとまりにくい＝重なりにくい） */
const MIXED_ORBIT_INTENSITY_GAP = 3;
const MIXED_ORBIT_MAX_GROUP_SIZE = 5;
const MIXED_ORBIT_RADIUS_PADDING_RATIO = 0.07;
const MIXED_ORBIT_MIN_RADIUS_RATIO = 0.14;
/** グループ人数が増えるごとの半径加算（球半径比） */
const MIXED_ORBIT_RADIUS_PER_MEMBER_RATIO = 0.09;

export type PlotOrbitOverrideMap = Map<string, PlotOrbitOverride>;

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function normalize(vec: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vec[0], vec[1], vec[2]) || 1;
  return [vec[0] / length, vec[1] / length, vec[2] / length];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function createMixedOrbitBasis(plot: UserPlotRow): {
  u: [number, number, number];
  v: [number, number, number];
} {
  const primaryCenter = getEmotionCenter(plot.primaryId);
  const secondaryCenter = getEmotionCenter(plot.secondaryId);
  const axis = normalize([
    secondaryCenter.x - primaryCenter.x,
    secondaryCenter.y - primaryCenter.y,
    secondaryCenter.z - primaryCenter.z,
  ]);
  const reference: [number, number, number] = Math.abs(axis[1]) < 0.82 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, reference));
  const v = normalize(cross(axis, u));

  return { u, v };
}

function addMixedOrbitGroup(overrides: PlotOrbitOverrideMap, group: UserPlotRow[]) {
  if (group.length < 2) {
    return;
  }

  const basePositions = group.map((plot) => plotPositionFromRow(plot));
  const center: [number, number, number] = [0, 0, 0];
  for (const position of basePositions) {
    center[0] += position[0];
    center[1] += position[1];
    center[2] += position[2];
  }
  center[0] /= group.length;
  center[1] /= group.length;
  center[2] /= group.length;

  const baseRadius = basePositions.reduce(
    (max, position) =>
      Math.max(max, Math.hypot(position[0] - center[0], position[1] - center[1], position[2] - center[2])),
    0,
  );
  const sphereRadius = getEmotionSphereRadius(group[0].primaryId);
  const memberScale = 1 + (group.length - 1) * MIXED_ORBIT_RADIUS_PER_MEMBER_RATIO;
  const radius = Math.max(
    baseRadius + sphereRadius * MIXED_ORBIT_RADIUS_PADDING_RATIO,
    sphereRadius * MIXED_ORBIT_MIN_RADIUS_RATIO,
  ) * memberScale;
  const { u, v } = createMixedOrbitBasis(group[0]);
  const groupKey = group
    .map((plot) => plot.word_id)
    .sort()
    .join('|');
  const basePhase = hashId(`${group[0].primaryId}:${group[0].secondaryId}:${groupKey}`) * 0.001;
  // グループごとに回転方向をランダム（±1）
  const direction = hashId(`dir:${groupKey}`) % 2 === 0 ? 1 : -1;

  group.forEach((plot, index) => {
    const speedSeed = hashId(plot.word_id);
    // 周期が揃わないよう、単語ごとに角速度をばらす（おおよそ 0.18〜0.62）
    const speedMagnitude = 0.18 + ((speedSeed % 1000) / 999) * 0.44;

    overrides.set(plot.word_id, {
      groupKey,
      center,
      u,
      v,
      radius,
      phase: basePhase + (index / group.length) * Math.PI * 2,
      speed: direction * speedMagnitude,
    });
  });
}

export function createMixedPlotOrbitOverrides(plots: UserPlotRow[]): PlotOrbitOverrideMap {
  const byEmotionPair = new Map<string, UserPlotRow[]>();

  for (const plot of plots) {
    const params = rowToEmotionParams(plot);
    if (params.isPure) {
      continue;
    }

    const key = `${params.primaryId}:${params.secondaryId}`;
    const group = byEmotionPair.get(key) ?? [];
    group.push(plot);
    byEmotionPair.set(key, group);
  }

  const overrides: PlotOrbitOverrideMap = new Map();
  for (const group of byEmotionPair.values()) {
    const sorted = [...group].sort((a, b) => {
      const intensityDiff = rowToEmotionParams(a).intensity - rowToEmotionParams(b).intensity;
      return intensityDiff || a.word_id.localeCompare(b.word_id);
    });
    let cluster: UserPlotRow[] = [];
    let previousIntensity: number | null = null;

    const flush = () => {
      for (let start = 0; start < cluster.length; start += MIXED_ORBIT_MAX_GROUP_SIZE) {
        addMixedOrbitGroup(overrides, cluster.slice(start, start + MIXED_ORBIT_MAX_GROUP_SIZE));
      }
      cluster = [];
      previousIntensity = null;
    };

    for (const plot of sorted) {
      const intensity = rowToEmotionParams(plot).intensity;
      if (
        previousIntensity !== null &&
        (intensity - previousIntensity >= MIXED_ORBIT_INTENSITY_GAP ||
          cluster.length >= MIXED_ORBIT_MAX_GROUP_SIZE)
      ) {
        flush();
      }

      cluster.push(plot);
      previousIntensity = intensity;
    }

    flush();
  }

  return overrides;
}

export function getNearbyPlotIds(
  plots: UserPlotRow[],
  selectedId: string,
  radius = NEARBY_PLOT_RADIUS,
  orbitOverrides?: PlotOrbitOverrideMap,
  options?: {
    sameEmotionSystemOnly?: boolean;
    /**
     * 選択中を除く移動可能ユニットの上限。
     * 同意義の回転グループはまとめて 1 枠として数える。
     */
    maxMovable?: number;
  },
): Set<string> {
  const selected = findPlotByKey(plots, selectedId);
  if (!selected) {
    return new Set(selectedId ? [selectedId] : []);
  }

  const selectedKey = getPlotKey(selected);
  const [selectedX, selectedY, selectedZ] = plotPositionFromRow(
    selected,
    0,
    orbitOverrides?.get(selected.word_id),
  );

  const unitKeyFor = (plot: UserPlotRow): string =>
    orbitOverrides?.get(plot.word_id)?.groupKey ?? `solo:${getPlotKey(plot)}`;

  const membersOfUnit = (unitKey: string): string[] => {
    if (unitKey.startsWith('solo:')) {
      return [unitKey.slice('solo:'.length)];
    }
    return plots
      .filter((plot) => orbitOverrides?.get(plot.word_id)?.groupKey === unitKey)
      .map((plot) => getPlotKey(plot));
  };

  const nearby = new Set<string>([selectedKey]);

  // 選択中と同じ回転グループは常に描画（現在ユニットとして枠外）
  const selectedUnitKey = unitKeyFor(selected);
  for (const memberId of membersOfUnit(selectedUnitKey)) {
    nearby.add(memberId);
  }

  type UnitRank = { key: string; distance: number };
  const units = new Map<string, UnitRank>();

  for (const plot of plots) {
    const plotKey = getPlotKey(plot);
    if (nearby.has(plotKey)) {
      continue;
    }
    // 単語間の移動は同一星系内のみ（星系間はワープゲート経由）
    if (options?.sameEmotionSystemOnly && plot.primaryId !== selected.primaryId) {
      continue;
    }
    // 混合感情からは純感情か同じ副感情へしか歩けない
    if (options?.sameEmotionSystemOnly && !canMoveWithinEmotionSystem(selected, plot)) {
      continue;
    }

    const [x, y, z] = plotPositionFromRow(plot, 0, orbitOverrides?.get(plot.word_id));
    const distance = Math.hypot(x - selectedX, y - selectedY, z - selectedZ);
    if (distance > radius) {
      continue;
    }

    const key = unitKeyFor(plot);
    const existing = units.get(key);
    if (!existing || distance < existing.distance) {
      units.set(key, { key, distance });
    }
  }

  const ranked = [...units.values()].sort(
    (a, b) => a.distance - b.distance || a.key.localeCompare(b.key),
  );
  const limit = options?.maxMovable;
  const limited = limit == null ? ranked : ranked.slice(0, Math.max(0, limit));

  for (const unit of limited) {
    for (const memberId of membersOfUnit(unit.key)) {
      nearby.add(memberId);
    }
  }

  // 循環上（純感情）にいるとき: 各副感情方向の一番手前（最寄り）は上限に関係なく選択可
  if (options?.sameEmotionSystemOnly && isPureEmotionPlot(selected)) {
    const nearestBySecondary = new Map<string, { key: string; distance: number }>();

    for (const plot of plots) {
      if (plot.primaryId !== selected.primaryId) {
        continue;
      }
      if (isPureEmotionPlot(plot)) {
        continue;
      }

      const params = rowToEmotionParams(plot);
      if (params.secondaryId === params.primaryId) {
        continue;
      }

      const [x, y, z] = plotPositionFromRow(plot, 0, orbitOverrides?.get(plot.word_id));
      const distance = Math.hypot(x - selectedX, y - selectedY, z - selectedZ);
      const key = unitKeyFor(plot);
      const secondaryKey = params.secondaryId;
      const existing = nearestBySecondary.get(secondaryKey);
      if (!existing || distance < existing.distance) {
        nearestBySecondary.set(secondaryKey, { key, distance });
      }
    }

    for (const { key } of nearestBySecondary.values()) {
      for (const memberId of membersOfUnit(key)) {
        nearby.add(memberId);
      }
    }
  }

  return nearby;
}

export function isPureEmotionPlot(row: UserPlotRow): boolean {
  return rowToEmotionParams(row).isPure;
}

/**
 * 同一星系内の単語間移動可否。
 * 混合感情（主≠副）からは、純感情か同じ副感情の語にしか移れない。
 */
export function canMoveWithinEmotionSystem(from: UserPlotRow, to: UserPlotRow): boolean {
  if (from.word_id === to.word_id) {
    return true;
  }
  if (from.primaryId !== to.primaryId) {
    return false;
  }
  if (isPureEmotionPlot(from)) {
    return true;
  }
  if (isPureEmotionPlot(to)) {
    return true;
  }
  return from.secondaryId === to.secondaryId;
}
