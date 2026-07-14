import type { BasicEmotionId, EmotionId } from '../data/emotions';
import type { DyadEmotion } from '../data/emotions';
import { BASIC_EMOTIONS, DYAD_EMOTIONS, getBasicEmotion, isBasicEmotionId } from '../data/emotions';

export const RING_RADIUS = 7.5;
/** 上段4感情（喜・恐・悲・怒）の Y、下段4感情（信・驚・嫌・期）の Y */
export const Y_LAYER_OFFSET = 5.6;
/** 強度に応じた星系内距離の基準半径（大きいほど強度1あたりの距離が広がる） */
export const EMOTION_SPHERE_RADIUS = 1.45 * 1.5;
export const DYAD_SPHERE_RADIUS = 0.9 * 1.5;
export const PURE_AREA_RATIO = 0.5;

export function getEmotionSphereRadius(id: EmotionId): number {
  return isBasicEmotionId(id) ? EMOTION_SPHERE_RADIUS : DYAD_SPHERE_RADIUS;
}

/** 合成感情の距離タイプごとの水平リング半径（基本環より内側・外側に分散） */
const DYAD_RING_RADIUS: Record<1 | 2 | 3, number> = {
  1: RING_RADIUS * 1.06,
  2: RING_RADIUS * 0.8,
  3: RING_RADIUS * 0.44,
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function bisectorAngleDegrees(angleA: number, angleB: number): number {
  const radA = (angleA * Math.PI) / 180;
  const radB = (angleB * Math.PI) / 180;
  let x = Math.cos(radA) + Math.cos(radB);
  let z = Math.sin(radA) + Math.sin(radB);

  if (Math.hypot(x, z) < 0.15) {
    x = Math.cos(radA + Math.PI / 2);
    z = Math.sin(radA + Math.PI / 2);
  }

  return (Math.atan2(z, x) * 180) / Math.PI;
}

function computeDyadPosition(dyad: DyadEmotion, dyadIndex: number): Vec3 {
  const [a, b] = dyad.components;
  const emotionA = getBasicEmotion(a);
  const emotionB = getBasicEmotion(b);
  const posA = basicPositions.get(a)!;
  const posB = basicPositions.get(b)!;

  const bisector = bisectorAngleDegrees(emotionA.angle, emotionB.angle);
  const rad = (bisector * Math.PI) / 180;
  const radius = DYAD_RING_RADIUS[dyad.distance];

  const sameLayer = emotionA.elevated === emotionB.elevated;
  let y = (posA.y + posB.y) / 2;

  if (!sameLayer) {
    const stagger = ((dyadIndex % 3) - 1) * 1.4;
    y += stagger;
  }

  return {
    x: radius * Math.cos(rad),
    y,
    z: radius * Math.sin(rad),
  };
}

const basicPositions = new Map<BasicEmotionId, Vec3>();

for (const emotion of BASIC_EMOTIONS) {
  const rad = (emotion.angle * Math.PI) / 180;
  basicPositions.set(emotion.id, {
    x: RING_RADIUS * Math.cos(rad),
    y: emotion.elevated ? Y_LAYER_OFFSET : -Y_LAYER_OFFSET,
    z: RING_RADIUS * Math.sin(rad),
  });
}

const emotionPositions = new Map<EmotionId, Vec3>();

for (const emotion of BASIC_EMOTIONS) {
  emotionPositions.set(emotion.id, basicPositions.get(emotion.id)!);
}

for (const dyad of DYAD_EMOTIONS) {
  const dyadIndex = Number(dyad.id.replace('dyad-', ''));
  emotionPositions.set(dyad.id, computeDyadPosition(dyad, dyadIndex));
}

export function getEmotionCenter(id: EmotionId): Vec3 {
  return emotionPositions.get(id)!;
}

/** 星系の外縁（銀河中心から見て外側）上のワープゲート位置 */
export function getEmotionSystemEdgePosition(id: EmotionId): [number, number, number] {
  const center = getEmotionCenter(id);
  const radius = getEmotionSphereRadius(id);
  const length = Math.hypot(center.x, center.y, center.z) || 1;
  const nx = center.x / length;
  const ny = center.y / length;
  const nz = center.z / length;
  return [
    center.x + nx * radius,
    center.y + ny * radius,
    center.z + nz * radius,
  ];
}

export function getAllEmotionCenters(): Array<{ id: EmotionId; position: Vec3; color: string; label: string }> {
  return [
    ...BASIC_EMOTIONS.map((emotion) => ({
      id: emotion.id as EmotionId,
      position: emotionPositions.get(emotion.id)!,
      color: emotion.color,
      label: emotion.label,
    })),
    ...DYAD_EMOTIONS.map((dyad) => {
      const [a, b] = dyad.components;
      return {
        id: dyad.id,
        position: emotionPositions.get(dyad.id)!,
        color: blendHex(getBasicEmotion(a).color, getBasicEmotion(b).color),
        label: dyad.label,
      };
    }),
  ];
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

export function findNearestEmotionByAngle(angle: number): EmotionId {
  const normalized = ((angle % 360) + 360) % 360;
  let nearest: EmotionId = 'joy';
  let minDist = Infinity;

  for (const [id, pos] of emotionPositions) {
    const emotionAngle = (Math.atan2(pos.z, pos.x) * 180) / Math.PI;
    const normEmotion = ((emotionAngle % 360) + 360) % 360;
    let diff = Math.abs(normEmotion - normalized);
    if (diff > 180) diff = 360 - diff;
    const dist3d = Math.abs(pos.y) * 0.02 + diff;
    if (dist3d < minDist) {
      minDist = dist3d;
      nearest = id;
    }
  }

  return nearest;
}

export function findNearestBasicEmotionByAngle(angle: number): BasicEmotionId {
  const normalized = ((angle % 360) + 360) % 360;
  let nearest: BasicEmotionId = 'joy';
  let minDist = Infinity;

  for (const emotion of BASIC_EMOTIONS) {
    let diff = Math.abs(emotion.angle - normalized);
    if (diff > 180) diff = 360 - diff;
    if (diff < minDist) {
      minDist = diff;
      nearest = emotion.id;
    }
  }

  return nearest;
}
