import * as THREE from 'three';
import type { UserPlotRow } from '../../types/userPlot';
import { getTelescopePlotPosition } from './telescopePlotLayout';
import {
  telescopeRegionToUnifiedSpace,
  type TelescopeRegionDefinition,
} from './layer3Region';
import type { TelescopeFocusCameraPose } from './focusCameraView';

/** レイヤー4/5: 選択セグメント俯瞰カメラ */
export const TELESCOPE_EXPLORATION_VIEW = {
  fov: 72,
  moveMs: 720,
  /** 矢印でのセグメント移動時の注視点スライド時間 */
  segmentMoveMs: 1080,
  /** 注視点からのカメラ後退量（面内法線方向） */
  cameraBack: 0.54,
  /** 右寄りオフセット */
  cameraSide: 0.21,
  /** 平面法線（Z）方向の高さ */
  cameraHeight: 0.47,
  /** 注視点まわりの視点回転（レイヤー3と同方向） */
  cameraYaw: 0.32,
  /**
   * 円形／楕円ドラッグの回転ゲイン。
   * 指が楕円上を回った角度（rad）がそのまま camera yaw に加算される倍率。
   */
  orbitGain: 1,
  /**
   * 矢印HUD・見回し操作で共有する楕円の扁平率（縦半径 / 横半径）。
   * 画面は y 下向き。atan2((y-cy)/ecc, x-cx) で角度を取る。
   */
  orbitEcc: 0.57,
  /**
   * 接眼中心からの正規化半径がこれ未満のときは角度が暴れるので無視する。
   * 1 = 接眼円の縁（短辺の半分を基準にした楕円半径）。
   */
  orbitDeadzone: 0.14,
  /** 選択セグメント中心からクリック可能とみなす半径（統一空間） */
  nearbyRadius: 0.5,
  /** 近傍外の点の不透明度倍率 */
  distantOpacity: 0.28,
  distantScale: 0.42,
} as const;

/** ポインタの楕円軌道上の角度（rad）。画面座標は y 下向き。 */
export function explorationOrbitAngle(
  clientX: number,
  clientY: number,
  centerX: number,
  centerY: number,
  ecc = TELESCOPE_EXPLORATION_VIEW.orbitEcc,
): number {
  return Math.atan2((clientY - centerY) / ecc, clientX - centerX);
}

/**
 * 楕円で正規化した中心からの距離（1 ≒ 接眼円の縁）。
 * halfSize はキャンバス短辺の半分。
 */
export function explorationOrbitRadiusNorm(
  clientX: number,
  clientY: number,
  centerX: number,
  centerY: number,
  halfSize: number,
  ecc = TELESCOPE_EXPLORATION_VIEW.orbitEcc,
): number {
  if (halfSize <= 1e-6) {
    return 0;
  }
  const nx = (clientX - centerX) / halfSize;
  const ny = (clientY - centerY) / (halfSize * ecc);
  return Math.hypot(nx, ny);
}

/** -π〜π に畳み込んだ角度差（to - from） */
export function wrapAngleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

/** レイヤー4 HUD（矢印・引き出し線）と共有するカメラ・選択点状態 */
export interface TelescopeExplorationHudState {
  /** 注視点まわりの現在の回転角（rad） */
  yaw: number;
  /** 選択中プロット点の画面位置（クライアント座標 px） */
  plotClientX: number;
  plotClientY: number;
  /** 選択点が画面内に投影されているか */
  plotVisible: boolean;
}

export function createTelescopeExplorationHudState(): TelescopeExplorationHudState {
  return { yaw: 0, plotClientX: 0, plotClientY: 0, plotVisible: false };
}

/**
 * レイヤー4で選択可能なプロットか。
 * 空間の3感情（基本8×2＋24感情1）について:
 * ① 主感情・副感情がともにその3感情のいずれか
 * ② 主感情がその24感情である点はすべて可
 *
 * 別方向の8感情を副感情に持つ点などは除外し、遠くの点の誤検知を防ぐ。
 */
export function isTelescopeExplorationSelectablePlot(
  region: TelescopeRegionDefinition,
  plot: UserPlotRow,
): boolean {
  if (plot.primaryId === region.id) {
    return true;
  }
  const spaceIds = new Set<string>([
    region.id,
    region.start.id,
    region.end.id,
  ]);
  return spaceIds.has(plot.primaryId) && spaceIds.has(plot.secondaryId);
}

/** 統一空間上のプロット座標 */
export function getTelescopeRegionPlotPosition(
  region: TelescopeRegionDefinition,
  plot: UserPlotRow,
  time = 0,
): [number, number, number] {
  const real = getTelescopePlotPosition(plot, time);
  const [x, y] = telescopeRegionToUnifiedSpace(region, real[0], real[1]);
  return [x, y, 0];
}

/** 領域内プロットのうち、選択点から nearbyRadius 以内の ID 集合 */
export function getTelescopeExplorationNearbyIds(
  region: TelescopeRegionDefinition,
  plots: readonly UserPlotRow[],
  selectedId: string,
  time = 0,
  radius = TELESCOPE_EXPLORATION_VIEW.nearbyRadius,
): Set<string> {
  const selected = plots.find((plot) => plot.word_id === selectedId);
  if (!selected) {
    return new Set(selectedId ? [selectedId] : []);
  }
  const [sx, sy] = getTelescopeRegionPlotPosition(region, selected, time);
  const nearby = new Set<string>([selectedId]);
  for (const plot of plots) {
    if (plot.word_id === selectedId) {
      continue;
    }
    if (!isTelescopeExplorationSelectablePlot(region, plot)) {
      continue;
    }
    const [x, y] = getTelescopeRegionPlotPosition(region, plot, time);
    if (Math.hypot(x - sx, y - sy) <= radius) {
      nearby.add(plot.word_id);
    }
  }
  return nearby;
}

export function computeTelescopeExplorationCameraPose(
  region: TelescopeRegionDefinition,
  lookAt: [number, number, number],
): TelescopeFocusCameraPose {
  const [dx, dy] = region.direction;
  const offsetX =
    dy * TELESCOPE_EXPLORATION_VIEW.cameraBack +
    dx * TELESCOPE_EXPLORATION_VIEW.cameraSide;
  const offsetY =
    -dx * TELESCOPE_EXPLORATION_VIEW.cameraBack +
    dy * TELESCOPE_EXPLORATION_VIEW.cameraSide;
  const cos = Math.cos(TELESCOPE_EXPLORATION_VIEW.cameraYaw);
  const sin = Math.sin(TELESCOPE_EXPLORATION_VIEW.cameraYaw);
  return {
    position: [
      lookAt[0] + offsetX * cos - offsetY * sin,
      lookAt[1] + offsetX * sin + offsetY * cos,
      TELESCOPE_EXPLORATION_VIEW.cameraHeight,
    ],
    lookAt: [lookAt[0], lookAt[1], lookAt[2]],
  };
}

/** カメラ位置を保ったまま注視点だけを移すときのオフセットを維持する */
export function computeTelescopeExplorationCameraPoseFromOffset(
  lookAt: [number, number, number],
  offset: THREE.Vector3,
): TelescopeFocusCameraPose {
  return {
    position: [
      lookAt[0] + offset.x,
      lookAt[1] + offset.y,
      lookAt[2] + offset.z,
    ],
    lookAt: [lookAt[0], lookAt[1], lookAt[2]],
  };
}
