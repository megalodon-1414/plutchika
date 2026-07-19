import * as THREE from 'three';
import type { BasicEmotionId } from '../../data/emotions';
import { getDyadsContainingBasic } from '../../data/emotions';
import {
  TELESCOPE_DETAIL_NODES,
  TELESCOPE_GALAXY_NODES,
  TELESCOPE_GALAXY_RADIUS,
} from './constants';

/**
 * 3段階目カメラ視点 — ここを触って調整する。
 *
 * 選択感情の延長線上・環平面付近にカメラを置き、平面法線(+Z)を画面上にする。
 * 視線は選択感情方向（正面）。回転中心はカメラ自身。
 *
 * - `radialScale`: 環半径に対するカメラ距離（大きいほど引いた視点）
 * - `zLift`: 環平面から手前(+Z)へわずかに浮かせる量
 * - `focusDrop`: 注視点の Z ずらし（+で平面法線マイナス側）
 * - `fov`: レイヤー2到着時に適用する画角
 * - `moveMs`: 延長線上への移動時間
 * - `orbitYawMax` / `orbitPitchMax`: 見回し限界（rad）
 */
export const TELESCOPE_FOCUS_VIEW = {
  radialScale: 1.5,
  zLift: 0.8,
  focusDrop: 0,
  fov: 38,
  moveMs: 720,
  /** 到着後、選択感情の注視から視線を少し上へ持ち上げる時間 */
  tiltUpMs: 600,
  /** バー登場アニメーション開始から見上げ開始までの遅延 */
  tiltUpDelayMs:900,
  /** 見上げ量: 最終注視点を環の中心から +Z へ持ち上げる高さ */
  tiltUpRise: 0,
  /**
   * 見上げの強さ 0..1。
   * 0 = 選択感情を見たまま（見上げなし）、1 = 環の中心（+tiltUpRise）まで見上げる。
   */
  tiltUpBlend: 0.5,
  orbitYawMax: 1.05,
  orbitPitchMax: 0.3,
  orbitSensitivity: 0.0011,
  relatedMaxDistance: 3 as 1 | 2 | 3,
  includePartnerBasics: true,
} as const;

/** レイヤー2の画面上方向＝環平面の法線（水平に見回すための安定 up） */
export const TELESCOPE_FOCUS_PLANE_UP: [number, number, number] = [0, 0, 1];

export interface TelescopeFocusCameraPose {
  /** カメラ位置＝回転中心 */
  position: [number, number, number];
  /** 基準の注視点（選択感情）。見回しはこの方向を起点に回転する */
  lookAt: [number, number, number];
}

function nodePosition(id: string): [number, number, number] | null {
  const basic = TELESCOPE_GALAXY_NODES.find((n) => n.id === id);
  if (basic) {
    return basic.position;
  }
  const dyad = TELESCOPE_DETAIL_NODES.find((n) => n.id === id);
  return dyad?.position ?? null;
}

/** フォーカス感情まわりで見渡す対象ノード ID */
export function getRelatedFocusNodeIds(basicId: BasicEmotionId): Set<string> {
  const ids = new Set<string>([basicId]);
  for (const dyad of getDyadsContainingBasic(basicId)) {
    if (dyad.distance > TELESCOPE_FOCUS_VIEW.relatedMaxDistance) {
      continue;
    }
    ids.add(dyad.id);
    if (TELESCOPE_FOCUS_VIEW.includePartnerBasics) {
      const partner =
        dyad.components[0] === basicId ? dyad.components[1] : dyad.components[0];
      ids.add(partner);
    }
  }
  return ids;
}

/** 選択基本感情と合成感情を持つ相手の基本感情 ID */
export function getDyadPartnerBasicIds(basicId: BasicEmotionId): BasicEmotionId[] {
  const partners = new Set<BasicEmotionId>();
  for (const dyad of getDyadsContainingBasic(basicId)) {
    if (dyad.distance > TELESCOPE_FOCUS_VIEW.relatedMaxDistance) {
      continue;
    }
    const partner =
      dyad.components[0] === basicId ? dyad.components[1] : dyad.components[0];
    partners.add(partner);
  }
  return [...partners];
}

/**
 * 銀河俯瞰の現在ポーズから、注視点・アングルを保ったまま後退したポーズ。
 */
export function computeSurveyPullbackPose(
  from: TelescopeFocusCameraPose,
  distanceMul: number,
): TelescopeFocusCameraPose {
  const lookAt = new THREE.Vector3(...from.lookAt);
  const position = new THREE.Vector3(...from.position);
  const offset = position.clone().sub(lookAt);
  if (offset.lengthSq() < 1e-8) {
    offset.set(0, 0, -1);
  }
  const distance = offset.length() * distanceMul;
  offset.normalize().multiplyScalar(distance);
  const pulled = lookAt.clone().add(offset);
  return {
    position: [pulled.x, pulled.y, pulled.z],
    lookAt: from.lookAt,
  };
}

export function computeFocusCameraPose(
  basicId: BasicEmotionId,
): TelescopeFocusCameraPose {
  const emotion =
    TELESCOPE_GALAXY_NODES.find((n) => n.id === basicId) ??
    TELESCOPE_GALAXY_NODES[0];
  const [ex, ey, ez] = emotion.position;
  const len = Math.hypot(ex, ey, ez) || 1;
  const ux = ex / len;
  const uy = ey / len;
  const uz = ez / len;

  const radial = TELESCOPE_GALAXY_RADIUS * TELESCOPE_FOCUS_VIEW.radialScale;
  const position: [number, number, number] = [
    ux * radial,
    uy * radial,
    uz * radial + TELESCOPE_FOCUS_VIEW.zLift,
  ];

  // Layer2の最終注視点。到着直後は選択感情を注視し、その後ここに視線を上げる。
  // 選択感情 → 環の中心(+tiltUpRise) を tiltUpBlend で内分して見上げ角度を抑える。
  const fullUp: [number, number, number] = [
    0,
    0,
    -TELESCOPE_FOCUS_VIEW.focusDrop + TELESCOPE_FOCUS_VIEW.tiltUpRise,
  ];
  const blend = TELESCOPE_FOCUS_VIEW.tiltUpBlend;
  const lookAt: [number, number, number] = [
    ex + (fullUp[0] - ex) * blend,
    ey + (fullUp[1] - ey) * blend,
    ez + (fullUp[2] - ez) * blend,
  ];

  return { position, lookAt };
}

export function getFocusEmotionPosition(
  basicId: BasicEmotionId,
): [number, number, number] {
  return (
    nodePosition(basicId) ??
    TELESCOPE_GALAXY_NODES[0]?.position ?? [0, TELESCOPE_GALAXY_RADIUS, 0]
  );
}
