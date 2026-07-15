import * as THREE from 'three';
import {
  BASIC_EMOTIONS,
  getBasicEmotion,
  getDyadsContainingBasic,
  type BasicEmotionId,
  type DyadEmotion,
} from '../data/emotions';
import type { Vec3 } from './emotionSpaceLayout';

/** 基本8感情のリング（ローカル平面上） */
export const HIERARCHY_BASIC_RING_RADIUS = 5.2;
export const HIERARCHY_BASIC_Y = 0;
/** 基本球の基準半径（選択中は拡大・非選択は縮小して掛ける） */
export const HIERARCHY_BASIC_SPHERE_RADIUS = 0.7;
export const HIERARCHY_FRONT_SPHERE_SCALE = 1.242;
export const HIERARCHY_IDLE_SPHERE_SCALE = 0.682;

/**
 * リング軸の傾き（左奥）
 * X: 奥へ倒す / Z: 左に傾ける
 */
export const HIERARCHY_WHEEL_TILT_X = 0.2;
export const HIERARCHY_WHEEL_TILT_Z = 0.45;

/** 決定後: 合成感情は8感情と同じ円位置。選んだ基本感情は円の軸（法線）延長上に小さく置く */
export const HIERARCHY_CONFIRMED_AXIS_HEIGHT = 3.15;
export const HIERARCHY_CONFIRMED_BASIC_SCALE = 0.72;
export const HIERARCHY_CONFIRMED_MOVE_LERP = 5.2;
export const HIERARCHY_CHILD_SPHERE_RADIUS = 0.48;
/** 決定後: 選んだ合成感情は軸上（基本感情より手前側）、単語は同じ円上 */
export const HIERARCHY_CONFIRMED_DYAD_AXIS_HEIGHT = 1.65;
export const HIERARCHY_CONFIRMED_DYAD_SCALE = 0.88;
export const HIERARCHY_WORD_SPHERE_RADIUS = 0.4;
/** 合成感情リング導入: 主感情到達後に軸上で生成→下降→回転しながら円へ展開 */
export const HIERARCHY_DYAD_DESCEND_LERP = 4.4;
export const HIERARCHY_DYAD_UNFOLD_LERP = 3.6;
/** 展開中に軸まわりへ回す周回数 */
export const HIERARCHY_DYAD_UNFOLD_SPINS = 1.7;
/** 展開後、手前強調サイズへ寄せる速さ */
export const HIERARCHY_DYAD_SIZE_EMPHASIS_LERP = 4.8;

/** 旧レイアウト互換（親直下リング用） */
export const HIERARCHY_CHILD_RING_RADIUS = 2.35;
export const HIERARCHY_CHILD_DROP = 2.8;

/** 広い画角で手前を大きく・奥を小さく見せる */
export const HIERARCHY_CAMERA_FOV = 105;
/** 選択中の球体を置く画面位置（0〜1、原点は左下。0.5/0.5 が中央） */
export const HIERARCHY_SCREEN_ANCHOR = { x: 0.5, y: 0.35 };

export const HIERARCHY_SPIN_LERP = 6.4;

const wheelTiltEuler = new THREE.Euler(
  HIERARCHY_WHEEL_TILT_X,
  0,
  HIERARCHY_WHEEL_TILT_Z,
  'XYZ',
);

function localRingPoint(angleRad: number, y = HIERARCHY_BASIC_Y): THREE.Vector3 {
  return new THREE.Vector3(
    HIERARCHY_BASIC_RING_RADIUS * Math.cos(angleRad),
    y,
    HIERARCHY_BASIC_RING_RADIUS * Math.sin(angleRad),
  );
}

/** 傾き適用後のワールド座標 */
export function hierarchyLocalToWorld(local: THREE.Vector3, target = new THREE.Vector3()): THREE.Vector3 {
  return target.copy(local).applyEuler(wheelTiltEuler);
}

/**
 * 選択スロットのローカル角。
 * リロード時（回転角0）の「恐れ」位置を、選んだ感情が来る固定地点にする。
 */
export const HIERARCHY_SLOT_BASIC_ID: BasicEmotionId = 'fear';
export const HIERARCHY_FRONT_LOCAL_ANGLE =
  (getBasicEmotion(HIERARCHY_SLOT_BASIC_ID).angle * Math.PI) / 180;

export function getHierarchySelectionSlotLocal(): Vec3 {
  const p = localRingPoint(HIERARCHY_FRONT_LOCAL_ANGLE);
  return { x: p.x, y: p.y, z: p.z };
}

export function getHierarchySelectionSlotWorld(): Vec3 {
  const world = hierarchyLocalToWorld(localRingPoint(HIERARCHY_FRONT_LOCAL_ANGLE));
  return { x: world.x, y: world.y, z: world.z };
}

export type HierarchyCameraDebugInfo = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  slotOffset: [number, number, number];
  targetYOffset: number;
  screenAnchor: { x: number; y: number };
};

/** 選択中スロットから見たカメラの相対位置（近づけてフレーミング） */
const HIERARCHY_CAMERA_SLOT_OFFSET = new THREE.Vector3(-0.379, 0.869, 1.802);
/** 注視点のスロットからの Y オフセット */
const HIERARCHY_CAMERA_TARGET_Y_OFFSET = 0.12;

function buildHierarchyCameraFromSlot(): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const slot = hierarchyLocalToWorld(localRingPoint(HIERARCHY_FRONT_LOCAL_ANGLE));
  const position = slot.clone().add(HIERARCHY_CAMERA_SLOT_OFFSET);
  return {
    position: [position.x, position.y, position.z],
    target: [slot.x, slot.y + HIERARCHY_CAMERA_TARGET_Y_OFFSET, slot.z],
  };
}

const hierarchyCamera = buildHierarchyCameraFromSlot();
export const HIERARCHY_CAMERA_POSITION = hierarchyCamera.position;
export const HIERARCHY_CAMERA_TARGET = hierarchyCamera.target;

/** 決定後の合成感情リング（8感情と同じ円・傾きグループ内ローカル） */
export function getConfirmedChildRingPositions(parentId: BasicEmotionId): Array<{
  dyad: DyadEmotion;
  position: Vec3;
  color: string;
  angleRad: number;
}> {
  const dyads = getRelatedDyadsSorted(parentId);
  const n = dyads.length || 1;

  return dyads.map((dyad, index) => {
    const angleRad = (index / n) * Math.PI * 2 - Math.PI / 2;
    const [a, b] = dyad.components;
    return {
      dyad,
      position: {
        x: HIERARCHY_BASIC_RING_RADIUS * Math.cos(angleRad),
        y: HIERARCHY_BASIC_Y,
        z: HIERARCHY_BASIC_RING_RADIUS * Math.sin(angleRad),
      },
      color: blendHex(getBasicEmotion(a).color, getBasicEmotion(b).color),
      angleRad,
    };
  });
}

/** 任意のローカル角の感情を固定スロットへ運ぶ Y 回転角 */
export function getHierarchySpinForAngle(angleRad: number): number {
  return angleRad - HIERARCHY_FRONT_LOCAL_ANGLE;
}

/** 決定後に基本感情が座る軸上ローカル座標 */
export function getConfirmedBasicAxisLocal(): Vec3 {
  return { x: 0, y: HIERARCHY_CONFIRMED_AXIS_HEIGHT, z: 0 };
}

/** 決定後に合成感情が座る軸上ローカル座標（基本感情との間） */
export function getConfirmedDyadAxisLocal(): Vec3 {
  return { x: 0, y: HIERARCHY_CONFIRMED_DYAD_AXIS_HEIGHT, z: 0 };
}

/** 決定後の単語リング（8感情・合成感情と同じ円） */
export function getHierarchyWordRingPositions(count: number): Array<{
  angleRad: number;
  position: Vec3;
}> {
  const n = Math.max(count, 1);
  return Array.from({ length: count }, (_, index) => {
    const angleRad = (index / n) * Math.PI * 2 - Math.PI / 2;
    return {
      angleRad,
      position: {
        x: HIERARCHY_BASIC_RING_RADIUS * Math.cos(angleRad),
        y: HIERARCHY_BASIC_Y,
        z: HIERARCHY_BASIC_RING_RADIUS * Math.sin(angleRad),
      },
    };
  });
}

export function getHierarchyCameraDebugFromLive(
  position: THREE.Vector3 | [number, number, number],
  target: THREE.Vector3 | [number, number, number],
  fov: number,
  screenAnchor: { x: number; y: number },
): HierarchyCameraDebugInfo {
  const slot = getHierarchySelectionSlotWorld();
  const pos = Array.isArray(position)
    ? { x: position[0], y: position[1], z: position[2] }
    : { x: position.x, y: position.y, z: position.z };
  const tgt = Array.isArray(target)
    ? { x: target[0], y: target[1], z: target[2] }
    : { x: target.x, y: target.y, z: target.z };

  return {
    position: [round3(pos.x), round3(pos.y), round3(pos.z)],
    target: [round3(tgt.x), round3(tgt.y), round3(tgt.z)],
    fov: round3(fov),
    slotOffset: [
      round3(pos.x - slot.x),
      round3(pos.y - slot.y),
      round3(pos.z - slot.z),
    ],
    targetYOffset: round3(tgt.y - slot.y),
    screenAnchor: {
      x: round3(screenAnchor.x),
      y: round3(screenAnchor.y),
    },
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function getHierarchyBasicPosition(id: BasicEmotionId): Vec3 {
  const emotion = getBasicEmotion(id);
  const rad = (emotion.angle * Math.PI) / 180;
  return {
    x: HIERARCHY_BASIC_RING_RADIUS * Math.cos(rad),
    y: HIERARCHY_BASIC_Y,
    z: HIERARCHY_BASIC_RING_RADIUS * Math.sin(rad),
  };
}

export function getHierarchyBasicCenters(): Array<{
  id: BasicEmotionId;
  position: Vec3;
  color: string;
  label: string;
  angleRad: number;
}> {
  return BASIC_EMOTIONS.map((emotion) => ({
    id: emotion.id,
    position: getHierarchyBasicPosition(emotion.id),
    color: emotion.color,
    label: emotion.label,
    angleRad: (emotion.angle * Math.PI) / 180,
  }));
}

/**
 * 感情を固定スロットへ運ぶための Y 回転角。
 * Three.js の Y 回転では (R cos θ, R sin θ) → 角度 θ − φ になるため、
 * θ − φ = FRONT となるよう φ = θ − FRONT とする。
 */
export function getHierarchySpinForBasic(id: BasicEmotionId): number {
  return getHierarchySpinForAngle((getBasicEmotion(id).angle * Math.PI) / 180);
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/** 円周上の深さ係数（1=スロット位置、0=反対側）—見た目の明度用。サイズには使わない */
export function hierarchyDepthFactor(angleRad: number, spinY: number): number {
  const worldAngle = angleRad - spinY;
  const delta = Math.abs(shortestAngleDelta(worldAngle, HIERARCHY_FRONT_LOCAL_ANGLE));
  return 1 - delta / Math.PI;
}

export function getRelatedDyadsSorted(basicId: BasicEmotionId): DyadEmotion[] {
  const basic = getBasicEmotion(basicId);
  const dyads = getDyadsContainingBasic(basicId);

  return [...dyads].sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    const partnerA = a.components[0] === basicId ? a.components[1] : a.components[0];
    const partnerB = b.components[0] === basicId ? b.components[1] : b.components[0];
    const angleA = getBasicEmotion(partnerA).angle;
    const angleB = getBasicEmotion(partnerB).angle;
    const relA = ((angleA - basic.angle) % 360 + 360) % 360;
    const relB = ((angleB - basic.angle) % 360 + 360) % 360;
    return relA - relB;
  });
}

/**
 * 確定後の合成感情リング。
 * 固定スロットの親位置直下に配置（スピン後は常に同じワールド手前）。
 */
export function getHierarchyChildPositions(parentId: BasicEmotionId): Array<{
  dyad: DyadEmotion;
  position: Vec3;
  color: string;
}> {
  const parent = getHierarchyBasicPosition(parentId);
  const dyads = getRelatedDyadsSorted(parentId);
  const n = dyads.length || 1;
  const parentAngle = getBasicEmotion(parentId).angle;
  const outwardRad = (parentAngle * Math.PI) / 180;

  return dyads.map((dyad, index) => {
    const step = (index / n) * Math.PI * 2;
    const angle = outwardRad + step;
    const [a, b] = dyad.components;
    return {
      dyad,
      position: {
        x: parent.x + HIERARCHY_CHILD_RING_RADIUS * Math.cos(angle),
        y: parent.y - HIERARCHY_CHILD_DROP,
        z: parent.z + HIERARCHY_CHILD_RING_RADIUS * Math.sin(angle),
      },
      color: blendHex(getBasicEmotion(a).color, getBasicEmotion(b).color),
    };
  });
}

export function getHierarchyChildCenter(parentId: BasicEmotionId): Vec3 {
  const parent = getHierarchyBasicPosition(parentId);
  return {
    x: parent.x,
    y: parent.y - HIERARCHY_CHILD_DROP,
    z: parent.z,
  };
}

function blendHex(a: string, b: string): string {
  const parse = (hex: string) => {
    const value = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex((ar + br) / 2)}${toHex((ag + bg) / 2)}${toHex((ab + bb) / 2)}`;
}
