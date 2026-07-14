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
/** 全感情同一サイズ（遠近はカメラ透視のみで決める） */
export const HIERARCHY_BASIC_SPHERE_RADIUS = 0.7;

/**
 * リング軸の傾き（左奥）
 * X: 奥へ倒す / Z: 左に傾ける
 */
export const HIERARCHY_WHEEL_TILT_X = 0.2;
export const HIERARCHY_WHEEL_TILT_Z = 0.45;

/** 選択感情の直下に広げる合成感情リング */
export const HIERARCHY_CHILD_RING_RADIUS = 2.35;
export const HIERARCHY_CHILD_DROP = 2.8;
export const HIERARCHY_CHILD_SPHERE_RADIUS = 0.48;

/** 広い画角で手前を大きく・奥を小さく見せる */
export const HIERARCHY_CAMERA_FOV = 105;

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

/** 選択中スロットから見たカメラの相対位置（近づけてフレーミング） */
const HIERARCHY_CAMERA_SLOT_OFFSET = new THREE.Vector3(-0.45, 1.55, 2.35);

function buildHierarchyCameraFromSlot(): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const slot = hierarchyLocalToWorld(localRingPoint(HIERARCHY_FRONT_LOCAL_ANGLE));
  const position = slot.clone().add(HIERARCHY_CAMERA_SLOT_OFFSET);
  return {
    position: [position.x, position.y, position.z],
    target: [slot.x, slot.y + 0.12, slot.z],
  };
}

const hierarchyCamera = buildHierarchyCameraFromSlot();
export const HIERARCHY_CAMERA_POSITION = hierarchyCamera.position;
export const HIERARCHY_CAMERA_TARGET = hierarchyCamera.target;

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
  const angleRad = (getBasicEmotion(id).angle * Math.PI) / 180;
  return angleRad - HIERARCHY_FRONT_LOCAL_ANGLE;
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
