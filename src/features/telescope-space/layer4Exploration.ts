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
  /** 注視点からのカメラ後退量（面内法線方向） */
  cameraBack: 0.72,
  /** 右寄りオフセット */
  cameraSide: 0.28,
  /** 平面法線（Z）方向の高さ */
  cameraHeight: 0.62,
  /** 注視点まわりの視点回転（レイヤー3と同方向） */
  cameraYaw: 0.32,
  /** 近傍としてクリック可能な半径（統一空間） */
  nearbyRadius: 0.85,
  /** 近傍外の点の不透明度倍率 */
  distantOpacity: 0.28,
  distantScale: 0.42,
} as const;

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
