import * as THREE from 'three';
import type { HomeTutorialStepDefinition } from './constants';

const DEFAULT_CAMERA_DISTANCE = 5;

export interface HomeTutorialCameraPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export function getHomeTutorialCameraPose(step: HomeTutorialStepDefinition): HomeTutorialCameraPose {
  const lookAt = new THREE.Vector3(...step.worldPosition);
  const distance = step.cameraDistance ?? DEFAULT_CAMERA_DISTANCE;
  const yaw = step.cameraYaw ?? 0;
  const pitch = step.cameraPitch ?? 0;

  const offset = new THREE.Vector3(0, 0, distance);
  offset.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

  return {
    position: lookAt.clone().add(offset),
    lookAt,
  };
}
