import type { BasicEmotionId, EmotionId } from '../data/emotions';
import { BASIC_EMOTIONS } from '../data/emotions';
import { RING_RADIUS, Y_LAYER_OFFSET, getEmotionCenter } from './emotionSpaceLayout';

export interface MinimapSyncState {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  cameraUp: [number, number, number];
  focusPosition: [number, number, number] | null;
  primaryId: EmotionId | null;
  /** Supabase emotions.name（あれば Map 表記に優先使用） */
  primaryLabel?: string | null;
}

/** ミニマップ表示用スケール（感情環半径を 1 に正規化） */
export const MINIMAP_SCALE = 1 / RING_RADIUS;

export function worldToMinimapLocal(x: number, y: number, z: number): [number, number, number] {
  const s = MINIMAP_SCALE;
  return [x * s, y * s, z * s];
}

export function worldTupleToMinimapLocal([x, y, z]: [number, number, number]): [number, number, number] {
  return worldToMinimapLocal(x, y, z);
}

/** 上面（上段4感情）— 立方体の上底 */
const TOP_RING: BasicEmotionId[] = ['joy', 'fear', 'sadness', 'anger'];

/** 下面（下段4感情）— 上底を 45° 回転した下底 */
const BOTTOM_RING: BasicEmotionId[] = ['trust', 'surprise', 'disgust', 'anticipation'];

function ringEdges(ring: BasicEmotionId[]): Array<[BasicEmotionId, BasicEmotionId]> {
  return ring.map((id, index) => [id, ring[(index + 1) % ring.length] as BasicEmotionId]);
}

/** 上下の面をつなぐ立方体の縦エッジ（各上面頂点と隣接する下面頂点2つ） */
const CROSS_EDGES: Array<[BasicEmotionId, BasicEmotionId]> = [
  ['joy', 'trust'],
  ['joy', 'anticipation'],
  ['fear', 'trust'],
  ['fear', 'surprise'],
  ['sadness', 'surprise'],
  ['sadness', 'disgust'],
  ['anger', 'disgust'],
  ['anger', 'anticipation'],
];

export const MINIMAP_WIREFRAME_EDGES: Array<[BasicEmotionId, BasicEmotionId]> = [
  ...ringEdges(TOP_RING),
  ...ringEdges(BOTTOM_RING),
  ...CROSS_EDGES,
];

export function getBasicEmotionMinimapVertices(): Record<BasicEmotionId, [number, number, number]> {
  const vertices = {} as Record<BasicEmotionId, [number, number, number]>;
  for (const emotion of BASIC_EMOTIONS) {
    const center = getEmotionCenter(emotion.id);
    vertices[emotion.id] = worldToMinimapLocal(center.x, center.y, center.z);
  }
  return vertices;
}

export function buildMinimapWireframePositions(): Float32Array {
  const positions: number[] = [];
  for (const [a, b] of MINIMAP_WIREFRAME_EDGES) {
    const pa = getEmotionCenter(a);
    const pb = getEmotionCenter(b);
    positions.push(pa.x * MINIMAP_SCALE, pa.y * MINIMAP_SCALE, pa.z * MINIMAP_SCALE);
    positions.push(pb.x * MINIMAP_SCALE, pb.y * MINIMAP_SCALE, pb.z * MINIMAP_SCALE);
  }
  return new Float32Array(positions);
}

/** ミニマップ図形の中心（ワールド原点） */
export const MINIMAP_SHAPE_CENTER: [number, number, number] = [0, 0, 0];

/** 感情ワイヤーフレームを囲む球の半径（ノード分の余白込み） */
export function getMinimapBoundingRadius(): number {
  const vertices = getBasicEmotionMinimapVertices();
  let maxDistSq = 0;
  for (const [x, y, z] of Object.values(vertices)) {
    maxDistSq = Math.max(maxDistSq, x * x + y * y + z * z);
  }
  return Math.sqrt(maxDistSq) + 0.1;
}

/** ミニマップのデフォルト視点距離 */
export const MINIMAP_DEFAULT_CAMERA: [number, number, number] = [1.85, 1.35, 2.15];

/** 上面・下面の Y（正規化後） */
export const MINIMAP_TOP_Y = Y_LAYER_OFFSET * MINIMAP_SCALE;
export const MINIMAP_BOTTOM_Y = -Y_LAYER_OFFSET * MINIMAP_SCALE;
