import * as THREE from 'three';
import type { ConceptTutorialStepDefinition } from './constants';

const DEFAULT_CAMERA_DISTANCE = 5;

/**
 * ステップ球を注視点に、yaw/pitch/distance でカメラ位置を決める。
 */
export function getConceptTutorialCameraPose(
  step: Pick<
    ConceptTutorialStepDefinition,
    'worldPosition' | 'cameraYaw' | 'cameraPitch' | 'cameraDistance'
  >,
  viewportWidth = 1200,
): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
  const narrow = viewportWidth < 640;
  const distance =
    (step.cameraDistance ?? DEFAULT_CAMERA_DISTANCE) * (narrow ? 1.12 : 1);
  const yaw = step.cameraYaw ?? Math.PI / 2;
  const pitch = step.cameraPitch ?? 0;

  const lookAt = new THREE.Vector3(
    step.worldPosition[0],
    step.worldPosition[1],
    step.worldPosition[2],
  );

  const cosPitch = Math.cos(pitch);
  const position = new THREE.Vector3(
    lookAt.x + Math.sin(yaw) * cosPitch * distance,
    lookAt.y + Math.sin(pitch) * distance,
    lookAt.z + Math.cos(yaw) * cosPitch * distance,
  );

  return { position, lookAt };
}
