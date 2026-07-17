import type { BasicEmotionId } from '../data/emotions';
import {
  TELESCOPE_GALAXY_RADIUS,
  buildTelescopeDetailNodes,
  buildTelescopeGalaxyNodes,
} from '../features/telescope-space/constants';
import type { EmotionId } from '../data/emotions';
import {
  MINIMAP_DEFAULT_CAMERA,
  MINIMAP_SHAPE_CENTER,
  buildMinimapWireframePositions,
  getBasicEmotionMinimapVertices,
  getMinimapBoundingRadius,
  worldTupleToMinimapLocal,
} from './emotionMinimapLayout';

/** ミニマップ表示用スケール（銀河環半径を 1 に正規化） */
export const TELESCOPE_MINIMAP_SCALE = 1 / TELESCOPE_GALAXY_RADIUS;

/** 注視中心は原点（カメラは真上から） */
export const TELESCOPE_MINIMAP_SHAPE_CENTER: [number, number, number] = [0, 0, 0];

/**
 * 円形フレーム内の Canvas ブロックを CSS でずらす／拡大する。
 * 3D 座標ではなく描画ブロックごと動かすので、見た目に確実に効く。
 */
export const TELESCOPE_MINIMAP_VIEWPORT_TRANSFORM = {
  translateXPx: 22,
  translateYPx: 22,
  scale: 1.14,
} as const;

/** 正面から銀河環を見るデフォルト視点（環の中心を画面中央に） */
export const TELESCOPE_MINIMAP_DEFAULT_CAMERA: [number, number, number] = [0, 0, 2.45];

export function worldToTelescopeMinimapLocal(x: number, y: number, z: number): [number, number, number] {
  const s = TELESCOPE_MINIMAP_SCALE;
  return [x * s, y * s, z * s];
}

export function worldTupleToTelescopeMinimapLocal([x, y, z]: [number, number, number]): [number, number, number] {
  return worldToTelescopeMinimapLocal(x, y, z);
}

function scaledPosition(position: [number, number, number]): [number, number, number] {
  return worldTupleToTelescopeMinimapLocal(position);
}

/** 8感情を順につなぐ八角形＋外周円 */
export function buildTelescopeMinimapWireframePositions(): Float32Array {
  const nodes = buildTelescopeGalaxyNodes();
  const positions: number[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const a = scaledPosition(nodes[i].position);
    const b = scaledPosition(nodes[(i + 1) % nodes.length].position);
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }

  const circleSegments = 48;
  for (let i = 0; i < circleSegments; i++) {
    const a = (i / circleSegments) * Math.PI * 2;
    const b = ((i + 1) / circleSegments) * Math.PI * 2;
    positions.push(Math.sin(a), Math.cos(a), 0, Math.sin(b), Math.cos(b), 0);
  }

  return new Float32Array(positions);
}

export function getTelescopeBasicEmotionMinimapVertices(): Record<BasicEmotionId, [number, number, number]> {
  const vertices = {} as Record<BasicEmotionId, [number, number, number]>;
  for (const node of buildTelescopeGalaxyNodes()) {
    vertices[node.id as BasicEmotionId] = scaledPosition(node.position);
  }
  return vertices;
}

export function getTelescopeMinimapBoundingRadius(): number {
  return 1.08;
}

const TELESCOPE_NODE_POSITIONS = new Map(
  [...buildTelescopeGalaxyNodes(), ...buildTelescopeDetailNodes()].map(
    (node) => [node.id, node.position] as const,
  ),
);

/** 望遠鏡銀河内の感情ワールド座標 */
export function getTelescopeEmotionWorldPosition(id: EmotionId): [number, number, number] | null {
  return TELESCOPE_NODE_POSITIONS.get(id) ?? null;
}

export type EmotionMinimapLayout = 'cube' | 'galaxy-ring';

export interface MinimapLayoutConfig {
  buildWireframePositions: () => Float32Array;
  getBasicVertices: () => Record<BasicEmotionId, [number, number, number]>;
  getBoundingRadius: () => number;
  worldTupleToLocal: (tuple: [number, number, number]) => [number, number, number];
  shapeCenter: [number, number, number];
  defaultCamera: [number, number, number];
  /** true なら同期カメラ向きを無視し、常に環を正面（上から）で見る */
  lockTopDown?: boolean;
  /** 円形クリップ内の Canvas ブロックを CSS で平行移動・拡大 */
  viewportTransform?: {
    translateXPx: number;
    translateYPx: number;
    scale: number;
  };
}

export function getMinimapLayoutConfig(layout: EmotionMinimapLayout): MinimapLayoutConfig {
  if (layout === 'galaxy-ring') {
    return {
      buildWireframePositions: buildTelescopeMinimapWireframePositions,
      getBasicVertices: getTelescopeBasicEmotionMinimapVertices,
      getBoundingRadius: getTelescopeMinimapBoundingRadius,
      worldTupleToLocal: worldTupleToTelescopeMinimapLocal,
      shapeCenter: TELESCOPE_MINIMAP_SHAPE_CENTER,
      defaultCamera: TELESCOPE_MINIMAP_DEFAULT_CAMERA,
      lockTopDown: true,
      viewportTransform: { ...TELESCOPE_MINIMAP_VIEWPORT_TRANSFORM },
    };
  }

  return {
    buildWireframePositions: buildMinimapWireframePositions,
    getBasicVertices: getBasicEmotionMinimapVertices,
    getBoundingRadius: getMinimapBoundingRadius,
    worldTupleToLocal: worldTupleToMinimapLocal,
    shapeCenter: MINIMAP_SHAPE_CENTER,
    defaultCamera: MINIMAP_DEFAULT_CAMERA,
  };
}
