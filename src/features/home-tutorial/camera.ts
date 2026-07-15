import * as THREE from 'three';
import type { HomeTutorialStepDefinition } from './constants';

const DEFAULT_CAMERA_DISTANCE = 5;

/**
 * ウィンドウ幅に応じたカメラ距離の倍率。
 * 横が狭いほど 1 より大きくなり、カメラが少し離れる。
 *
 * - VIEWPORT_WIDTH_REFERENCE 以上 … 倍率 1（ベース距離）
 * - VIEWPORT_WIDTH_NARROW 以下 … NARROW_VIEWPORT_DISTANCE_SCALE
 */
const VIEWPORT_WIDTH_REFERENCE = 1200;
const VIEWPORT_WIDTH_NARROW = 520;
const NARROW_VIEWPORT_DISTANCE_SCALE = 0.95;

export function getHomeTutorialCameraDistanceScale(viewportWidth: number): number {
  if (viewportWidth >= VIEWPORT_WIDTH_REFERENCE) {
    return 1;
  }

  const span = VIEWPORT_WIDTH_REFERENCE - VIEWPORT_WIDTH_NARROW;
  const t = span <= 0
    ? 1
    : Math.min(1, Math.max(0, (VIEWPORT_WIDTH_REFERENCE - viewportWidth) / span));

  return 1 + t * (NARROW_VIEWPORT_DISTANCE_SCALE - 1);
}

export function getHomeTutorialCameraDistance(
  viewportWidth: number,
  baseDistance = DEFAULT_CAMERA_DISTANCE,
): number {
  return baseDistance * getHomeTutorialCameraDistanceScale(viewportWidth);
}

export interface HomeTutorialCameraPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export function getHomeTutorialCameraPose(
  step: HomeTutorialStepDefinition,
  viewportWidth?: number,
): HomeTutorialCameraPose {
  const lookAt = new THREE.Vector3(...step.worldPosition);
  const baseDistance = step.cameraDistance ?? DEFAULT_CAMERA_DISTANCE;
  const distance = viewportWidth != null
    ? getHomeTutorialCameraDistance(viewportWidth, baseDistance)
    : baseDistance;
  const yaw = step.cameraYaw ?? 0;
  const pitch = step.cameraPitch ?? 0;

  const offset = new THREE.Vector3(0, 0, distance);
  offset.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

  return {
    position: lookAt.clone().add(offset),
    lookAt,
  };
}
