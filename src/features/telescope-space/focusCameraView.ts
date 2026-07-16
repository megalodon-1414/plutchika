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
 * 環中央 → 選択感情の延長線上付近へ一気に移動し、
 * 回転中心は選択球。画面の上下は常に環平面の法線（+Z）方向。
 *
 * - `radialScale`: 環半径に対するカメラ距離（大きいほど引いた視点）
 * - `zLift`: 環平面から手前(+Z)へ浮かせて立体角をつける
 * - `focusDrop`: 焦点（注視点）を平面法線の下方向へずらす量
 * - `moveMs`: 延長線上への移動時間（短いほど「いっきに」）
 * - `orbitYawMax`: 詳細時の横回転限界（rad）
 * - `orbitPitchMax`: 詳細時の縦回転限界（rad）
 */
export const TELESCOPE_FOCUS_VIEW = {
  radialScale: 2.2,
  zLift: 1.85,
  focusDrop: -0.42,
  moveMs: 720,
  orbitYawMax: 1.05,
  orbitPitchMax: 0.38,
  orbitSensitivity: 0.0011,
  relatedMaxDistance: 3 as 1 | 2 | 3,
  includePartnerBasics: true,
} as const;

/** 環平面に対する「上」（どの感情でも画面上下をこれに揃える） */
export const TELESCOPE_FOCUS_PLANE_UP: [number, number, number] = [0, 0, 1];

export interface TelescopeFocusCameraPose {
  /** カメラ位置（延長線上付近） */
  position: [number, number, number];
  /** 回転中心＝選択した感情球 */
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
 * 環中央と選択感情の延長線上付近にカメラを置き、
 * 注視点（回転中心）は選択球そのもの。
 */
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

  // 焦点＝選択球より少し下（平面法線 -Z）
  const lookAt: [number, number, number] = [
    ex,
    ey,
    ez - TELESCOPE_FOCUS_VIEW.focusDrop,
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
