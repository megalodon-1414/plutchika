import type { EmotionPlotParams } from './emotionPlotBridge';
import { EMOTION_INTENSITY_MAX } from './emotionPlotBridge';
import {
  PURE_AREA_RATIO,
  getEmotionCenter,
  getEmotionSphereRadius,
} from './emotionSpaceLayout';

const ORBIT_PLANE_VARIATION_RAD = Math.PI / 4;
const MIXED_INTENSITY_POSITION_MAX = 50;

export interface PlotOrbitOverride {
  groupKey: string;
  center: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  radius: number;
  phase: number;
  speed?: number;
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function orbitBasis(intensity: number, wordId: string): { u: [number, number, number]; v: [number, number, number] } {
  const seed = hashId(`${wordId}:${Math.round(intensity)}`);
  const theta = (seed % 360) * (Math.PI / 180);
  const planeRandom = ((seed >> 4) % 1000) / 999;
  const phi = (planeRandom - 0.5) * ORBIT_PLANE_VARIATION_RAD;

  const ux = Math.cos(theta);
  const uy = Math.sin(theta) * Math.cos(phi);
  const uz = Math.sin(theta) * Math.sin(phi);

  const vx = -Math.sin(theta);
  const vy = Math.cos(theta) * Math.cos(phi);
  const vz = Math.cos(theta) * Math.sin(phi);

  return { u: [ux, uy, uz], v: [vx, vy, vz] };
}

/** 強度 max → 中心付近、強度 0 → 純感情エリア外周。最内でもわずかに公転する */
const PURE_ORBIT_MIN_RADIUS_RATIO = 0.06;

function pureOrbitRadius(intensity: number, sphereRadius: number): number {
  const t = 1 - Math.min(intensity, EMOTION_INTENSITY_MAX) / EMOTION_INTENSITY_MAX;
  const ratio = PURE_ORBIT_MIN_RADIUS_RATIO + t * (PURE_AREA_RATIO - PURE_ORBIT_MIN_RADIUS_RATIO);
  return ratio * sphereRadius;
}

export function getPureOrbitRingPoints(
  params: EmotionPlotParams,
  wordId: string,
  segments = 72,
): [number, number, number][] | null {
  if (!params.isPure) return null;

  const center = getEmotionCenter(params.primaryId);
  const sphereRadius = getEmotionSphereRadius(params.primaryId);
  const radius = pureOrbitRadius(params.intensity, sphereRadius);
  if (radius < 0.002) return null;

  const { u, v } = orbitBasis(params.intensity, wordId);
  const points: [number, number, number][] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points.push([
      center.x + radius * (cos * u[0] + sin * v[0]),
      center.y + radius * (cos * u[1] + sin * v[1]),
      center.z + radius * (cos * u[2] + sin * v[2]),
    ]);
  }

  return points;
}

export function getEmotionPlotPosition(
  params: EmotionPlotParams,
  wordId: string,
  time = 0,
  orbitOverride?: PlotOrbitOverride,
): [number, number, number] {
  const center = getEmotionCenter(params.primaryId);
  const sphereRadius = getEmotionSphereRadius(params.primaryId);

  if (orbitOverride) {
    const angle = time * (orbitOverride.speed ?? 0.35) + orbitOverride.phase;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return [
      orbitOverride.center[0] + orbitOverride.radius * (cos * orbitOverride.u[0] + sin * orbitOverride.v[0]),
      orbitOverride.center[1] + orbitOverride.radius * (cos * orbitOverride.u[1] + sin * orbitOverride.v[1]),
      orbitOverride.center[2] + orbitOverride.radius * (cos * orbitOverride.u[2] + sin * orbitOverride.v[2]),
    ];
  }

  if (params.isPure) {
    const radius = pureOrbitRadius(params.intensity, sphereRadius);
    const { u, v } = orbitBasis(params.intensity, wordId);
    const phase = hashId(wordId) * 0.001;
    const angle = time * 0.35 + phase;

    return [
      center.x + radius * (Math.cos(angle) * u[0] + Math.sin(angle) * v[0]),
      center.y + radius * (Math.cos(angle) * u[1] + Math.sin(angle) * v[1]),
      center.z + radius * (Math.cos(angle) * u[2] + Math.sin(angle) * v[2]),
    ];
  }

  // 主感情中心から副感情（基本8 or 合成24）方向へ、強度に応じて引く
  const secondaryCenter = getEmotionCenter(params.secondaryId);
  const dx = secondaryCenter.x - center.x;
  const dy = secondaryCenter.y - center.y;
  const dz = secondaryCenter.z - center.z;
  const len = Math.hypot(dx, dy, dz) || 1;

  const intensityT = Math.min(params.intensity, MIXED_INTENSITY_POSITION_MAX) / MIXED_INTENSITY_POSITION_MAX;
  const minDist = sphereRadius * 0.52;
  const maxDist = sphereRadius * 1.46;
  const dist = minDist + intensityT * (maxDist - minDist);

  return [
    center.x + (dx / len) * dist,
    center.y + (dy / len) * dist,
    center.z + (dz / len) * dist,
  ];
}

/** 副感情方向の指定強度における空間位置（ワープゲート配置用） */
export function getMixedDirectionPositionAtIntensity(
  primaryId: EmotionPlotParams['primaryId'],
  secondaryId: EmotionPlotParams['secondaryId'],
  intensity: number,
): [number, number, number] {
  const center = getEmotionCenter(primaryId);
  const sphereRadius = getEmotionSphereRadius(primaryId);
  const secondaryCenter = getEmotionCenter(secondaryId);
  const dx = secondaryCenter.x - center.x;
  const dy = secondaryCenter.y - center.y;
  const dz = secondaryCenter.z - center.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  // 語の位置スケール(0–50)基準。55なら最外語より少し外側に置く
  const intensityT = Math.max(0, intensity) / MIXED_INTENSITY_POSITION_MAX;
  const minDist = sphereRadius * 0.52;
  const maxDist = sphereRadius * 1.46;
  const dist = minDist + intensityT * (maxDist - minDist);

  return [
    center.x + (dx / len) * dist,
    center.y + (dy / len) * dist,
    center.z + (dz / len) * dist,
  ];
}
