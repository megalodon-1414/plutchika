import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import { getEmotionById } from '../../data/emotions';
import type { MinimapSyncState } from '../../utils/emotionMinimapLayout';
import { getTelescopeEmotionWorldPosition } from '../../utils/telescopeMinimapLayout';
import {
  TELESCOPE_CAMERA_DISTANCE_FAR,
  TELESCOPE_CAMERA_DISTANCE_WIDE,
  TELESCOPE_CAMERA_FOV,
  TELESCOPE_CLICK_DRAG_THRESHOLD_PX,
  TELESCOPE_LAYER2_PULLBACK_DISTANCE_MUL,
  TELESCOPE_LAYER2_PULLBACK_FOV,
  TELESCOPE_LAYER2_PULLBACK_MS,
  TELESCOPE_LAYER2_ROTATE_MS,
  TELESCOPE_ORBIT_FOLLOW_MIN_MUL,
  TELESCOPE_ORBIT_FOLLOW_RANGE,
  TELESCOPE_ORBIT_FOLLOW_SPEED,
  TELESCOPE_ORBIT_PHI_CENTER,
  TELESCOPE_ORBIT_RADIUS_MAX,
  TELESCOPE_ORBIT_SENSITIVITY,
  TELESCOPE_PIVOT,
  TELESCOPE_WIDE_DYAD_OPACITY,
  TELESCOPE_ZOOM_MS,
  distanceForPhase,
  type TelescopeSettledPhase,
  type TelescopeZoomPhase,
} from './constants';
import {
  computeFocusCameraPose,
  computeSurveyPullbackPose,
  TELESCOPE_FOCUS_PLANE_UP,
  TELESCOPE_FOCUS_VIEW,
  type TelescopeFocusCameraPose,
} from './focusCameraView';
import {
  TelescopeGalaxyLayer,
  type TelescopeViewFocus,
} from './TelescopeGalaxyLayer';

interface TelescopeSpaceCanvasProps {
  zoomPhase: TelescopeZoomPhase;
  focusBasicId: BasicEmotionId | null;
  viewFocus: TelescopeViewFocus;
  onZoomComplete?: (phase: TelescopeSettledPhase) => void;
  onCanvasClickZoom?: () => void;
  onViewFocus?: (focus: TelescopeViewFocus) => void;
  onMinimapSync?: (state: MinimapSyncState | null) => void;
}

const PIVOT = new THREE.Vector3(...TELESCOPE_PIVOT);
const LOOK_AHEAD = new THREE.Vector3();
const TMP_POS = new THREE.Vector3();
const TMP_LOOK = new THREE.Vector3();
const TMP_OFFSET = new THREE.Vector3();
const TMP_RADIAL = new THREE.Vector3();
const TMP_TANGENT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();
const PLANE_UP = new THREE.Vector3(...TELESCOPE_FOCUS_PLANE_UP);
const SURVEY_UP = new THREE.Vector3(0, 1, 0);

type CameraMode = 'survey' | 'focus';
type ZoomInSubPhase = 'pullBack' | 'rotate' | 'focusIn';

function easePullBack(t: number): number {
  // 終端で減速しすぎない（引いた後の静止感を抑える）
  return 1 - (1 - t) * (1 - t);
}

function easeRotateStart(t: number): number {
  // 回転開始を早め、引き直後の静止感を抑える
  return t * t;
}

/**
 * のぞき穴に合わせ、軌道中心からの角変位を円形にクランプする。
 */
function clampOrbitCircular(
  theta: number,
  phi: number,
  centerTheta: number,
  centerPhi: number,
  radiusMax: number,
): { theta: number; phi: number } {
  const dTheta = theta - centerTheta;
  const dPhi = phi - centerPhi;
  const mag = Math.hypot(dTheta, dPhi);
  if (mag <= radiusMax || mag < 1e-8) {
    return { theta, phi };
  }
  const scale = radiusMax / mag;
  return {
    theta: centerTheta + dTheta * scale,
    phi: centerPhi + dPhi * scale,
  };
}

/** 詳細視点：横・縦で別限界 */
function clampFocusOrbit(
  yaw: number,
  pitch: number,
): { yaw: number; pitch: number } {
  return {
    yaw: THREE.MathUtils.clamp(
      yaw,
      -TELESCOPE_FOCUS_VIEW.orbitYawMax,
      TELESCOPE_FOCUS_VIEW.orbitYawMax,
    ),
    pitch: THREE.MathUtils.clamp(
      pitch,
      -TELESCOPE_FOCUS_VIEW.orbitPitchMax,
      TELESCOPE_FOCUS_VIEW.orbitPitchMax,
    ),
  };
}

function surveyWorldPose(
  radius: number,
  theta: number,
  phi: number,
): TelescopeFocusCameraPose {
  const sinPhi = Math.sin(phi);
  const position: [number, number, number] = [
    PIVOT.x + radius * sinPhi * Math.sin(theta),
    PIVOT.y + radius * Math.cos(phi),
    PIVOT.z - radius * sinPhi * Math.cos(theta),
  ];
  const lookAt: [number, number, number] = [
    position[0] * 2 - PIVOT.x,
    position[1] * 2 - PIVOT.y,
    position[2] * 2 - PIVOT.z,
  ];
  return { position, lookAt };
}

function applySurveySpherical(
  camera: THREE.PerspectiveCamera,
  radius: number,
  theta: number,
  phi: number,
) {
  const pose = surveyWorldPose(radius, theta, phi);
  camera.position.set(...pose.position);
  camera.up.copy(SURVEY_UP);
  LOOK_AHEAD.set(...pose.lookAt);
  camera.lookAt(LOOK_AHEAD);
}

function applyFocusPose(
  camera: THREE.PerspectiveCamera,
  base: TelescopeFocusCameraPose,
  orbitYaw: number,
  orbitPitch: number,
) {
  // 回転中心＝選択球
  TMP_LOOK.set(...base.lookAt);
  TMP_OFFSET.set(
    base.position[0] - base.lookAt[0],
    base.position[1] - base.lookAt[1],
    base.position[2] - base.lookAt[2],
  );

  // 環平面内の動径・接線。pitch=平面に対する上下、yaw=平面法線まわり
  TMP_RADIAL.set(base.lookAt[0], base.lookAt[1], 0);
  if (TMP_RADIAL.lengthSq() < 1e-8) {
    TMP_RADIAL.set(0, 1, 0);
  } else {
    TMP_RADIAL.normalize();
  }
  TMP_TANGENT.crossVectors(PLANE_UP, TMP_RADIAL);
  if (TMP_TANGENT.lengthSq() < 1e-8) {
    TMP_TANGENT.set(1, 0, 0);
  } else {
    TMP_TANGENT.normalize();
  }

  TMP_OFFSET.applyAxisAngle(TMP_TANGENT, orbitPitch);
  TMP_OFFSET.applyAxisAngle(PLANE_UP, orbitYaw);

  TMP_POS.copy(TMP_LOOK).add(TMP_OFFSET);
  camera.position.copy(TMP_POS);
  // どの感情でも画面上下＝環平面の法線方向
  camera.up.copy(PLANE_UP);
  camera.lookAt(TMP_LOOK);
}

function followSpeedMultiplier(errorDist: number): number {
  const progress = 1 - Math.min(1, errorDist / TELESCOPE_ORBIT_FOLLOW_RANGE);
  const bell = 6 * progress * (1 - progress);
  return Math.max(TELESCOPE_ORBIT_FOLLOW_MIN_MUL, bell);
}

function TelescopeCameraController({
  zoomPhase,
  focusBasicId,
  onZoomComplete,
  onCanvasClickZoom,
  onLayer2SceneChange,
  onCameraStateChange,
}: {
  zoomPhase: TelescopeZoomPhase;
  focusBasicId: BasicEmotionId | null;
  onZoomComplete?: (phase: TelescopeSettledPhase) => void;
  onCanvasClickZoom?: () => void;
  onLayer2SceneChange?: (active: boolean) => void;
  onCameraStateChange?: (
    state: Pick<MinimapSyncState, 'cameraPosition' | 'cameraTarget' | 'cameraUp'>,
  ) => void;
}) {
  const { camera, gl } = useThree();
  const mode = useRef<CameraMode>('survey');
  const radius = useRef(TELESCOPE_CAMERA_DISTANCE_FAR);
  const theta = useRef(0);
  const phi = useRef(TELESCOPE_ORBIT_PHI_CENTER);
  const targetTheta = useRef(0);
  const targetPhi = useRef(TELESCOPE_ORBIT_PHI_CENTER);
  const orbitCenterTheta = useRef(0);
  const orbitCenterPhi = useRef(TELESCOPE_ORBIT_PHI_CENTER);
  const orbitRadiusMax = useRef(TELESCOPE_ORBIT_RADIUS_MAX);

  const focusBase = useRef<TelescopeFocusCameraPose | null>(null);
  const focusOrbitYaw = useRef(0);
  const focusOrbitPitch = useRef(0);
  const focusOrbitYawTarget = useRef(0);
  const focusOrbitPitchTarget = useRef(0);

  const progress = useRef(1);
  const animDurationMs = useRef(TELESCOPE_ZOOM_MS);
  const fromPos = useRef(new THREE.Vector3());
  const toPos = useRef(new THREE.Vector3());
  const fromLook = useRef(new THREE.Vector3());
  const toLook = useRef(new THREE.Vector3());
  const fromRadius = useRef(TELESCOPE_CAMERA_DISTANCE_FAR);
  const toRadius = useRef(TELESCOPE_CAMERA_DISTANCE_FAR);
  const fromTheta = useRef(0);
  const toTheta = useRef(0);
  const fromPhi = useRef(TELESCOPE_ORBIT_PHI_CENTER);
  const toPhi = useRef(TELESCOPE_ORBIT_PHI_CENTER);
  const fromFov = useRef(TELESCOPE_CAMERA_FOV);
  const toFov = useRef(TELESCOPE_CAMERA_FOV);
  /** survey 距離補間か、自由ポーズ補間か */
  const animKind = useRef<'survey' | 'free'>('survey');
  const animating = useRef(false);
  const targetPhase = useRef<TelescopeSettledPhase>('far');
  const zoomPhaseRef = useRef(zoomPhase);
  const zoomInSubPhase = useRef<ZoomInSubPhase | null>(null);
  const zoomInCameraLock = useRef(false);
  const overviewLookAt = useRef(new THREE.Vector3());
  const pullbackPosition = useRef(new THREE.Vector3());
  const completedRef = useRef(onZoomComplete);
  const clickZoomRef = useRef(onCanvasClickZoom);
  const layer2SceneRef = useRef(onLayer2SceneChange);
  const cameraStateRef = useRef(onCameraStateChange);
  const minimapFrameCounter = useRef(0);
  const currentLookAt = useRef(new THREE.Vector3(...surveyWorldPose(
    TELESCOPE_CAMERA_DISTANCE_FAR,
    0,
    TELESCOPE_ORBIT_PHI_CENTER,
  ).lookAt));
  completedRef.current = onZoomComplete;
  clickZoomRef.current = onCanvasClickZoom;
  layer2SceneRef.current = onLayer2SceneChange;
  cameraStateRef.current = onCameraStateChange;
  zoomPhaseRef.current = zoomPhase;

  const reportMinimapCamera = (camera: THREE.PerspectiveCamera) => {
    const onChange = cameraStateRef.current;
    if (!onChange) {
      return;
    }

    minimapFrameCounter.current = (minimapFrameCounter.current + 1) % 2;
    if (minimapFrameCounter.current !== 0) {
      return;
    }

    onChange({
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
      cameraTarget: [currentLookAt.current.x, currentLookAt.current.y, currentLookAt.current.z],
      cameraUp: [camera.up.x, camera.up.y, camera.up.z],
    });
  };

  const beginRotateFromPullback = (camera: THREE.PerspectiveCamera) => {
    if (!focusBasicId || !focusBase.current) {
      return;
    }
    pullbackPosition.current.copy(camera.position);
    zoomInSubPhase.current = 'rotate';
    animKind.current = 'free';
    animDurationMs.current = TELESCOPE_LAYER2_ROTATE_MS;
    fromPos.current.copy(pullbackPosition.current);
    toPos.current.copy(pullbackPosition.current);
    fromLook.current.copy(overviewLookAt.current);
    toLook.current.set(...focusBase.current.lookAt);
    fromFov.current = camera.fov;
    toFov.current = camera.fov;
    progress.current = 0;
    animating.current = true;
  };

  const beginCloseUpFromRotate = (camera: THREE.PerspectiveCamera) => {
    if (!focusBasicId || !focusBase.current) {
      return;
    }
    const pose = focusBase.current;
    zoomInSubPhase.current = 'focusIn';
    layer2SceneRef.current?.(true);
    animKind.current = 'free';
    animDurationMs.current = TELESCOPE_FOCUS_VIEW.moveMs;
    fromPos.current.copy(pullbackPosition.current);
    toPos.current.set(...pose.position);
    fromLook.current.set(...pose.lookAt);
    toLook.current.set(...pose.lookAt);
    fromFov.current = camera.fov;
    toFov.current = TELESCOPE_CAMERA_FOV;
    progress.current = 0;
    animating.current = true;
    targetPhase.current = 'detail';
  };

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }
    camera.fov = TELESCOPE_CAMERA_FOV;
    camera.updateProjectionMatrix();
    applySurveySpherical(camera, radius.current, theta.current, phi.current);
  }, [camera]);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    if (zoomPhase === 'approaching') {
      mode.current = 'survey';
      focusBase.current = null;
      animKind.current = 'survey';
      animDurationMs.current = TELESCOPE_ZOOM_MS;
      fromRadius.current = radius.current;
      toRadius.current = distanceForPhase('wide');
      fromTheta.current = theta.current;
      toTheta.current = 0;
      fromPhi.current = phi.current;
      toPhi.current = TELESCOPE_ORBIT_PHI_CENTER;
      orbitCenterTheta.current = 0;
      orbitCenterPhi.current = TELESCOPE_ORBIT_PHI_CENTER;
      orbitRadiusMax.current = TELESCOPE_ORBIT_RADIUS_MAX;
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'wide';
    } else if (zoomPhase === 'zooming-in' && focusBasicId) {
      const pose = computeFocusCameraPose(focusBasicId);
      focusBase.current = pose;
      focusOrbitYaw.current = 0;
      focusOrbitPitch.current = 0;
      focusOrbitYawTarget.current = 0;
      focusOrbitPitchTarget.current = 0;
      zoomInSubPhase.current = 'pullBack';
      zoomInCameraLock.current = true;
      layer2SceneRef.current?.(false);
      const from = surveyWorldPose(radius.current, theta.current, phi.current);
      const pullback = computeSurveyPullbackPose(from, TELESCOPE_LAYER2_PULLBACK_DISTANCE_MUL);
      fromPos.current.set(...from.position);
      fromLook.current.set(...from.lookAt);
      overviewLookAt.current.copy(fromLook.current);
      toPos.current.set(...pullback.position);
      toLook.current.set(...pullback.lookAt);
      fromFov.current = TELESCOPE_CAMERA_FOV;
      toFov.current = TELESCOPE_LAYER2_PULLBACK_FOV;
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_LAYER2_PULLBACK_MS;
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'detail';
    } else if (zoomPhase === 'zooming-out') {
      zoomInSubPhase.current = null;
      zoomInCameraLock.current = true;
      layer2SceneRef.current?.(true);
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_FOCUS_VIEW.moveMs;
      if (focusBase.current) {
        applyFocusPose(
          camera,
          focusBase.current,
          focusOrbitYaw.current,
          focusOrbitPitch.current,
        );
        fromPos.current.copy(camera.position);
        fromLook.current.set(...focusBase.current.lookAt);
      } else {
        const from = surveyWorldPose(radius.current, theta.current, phi.current);
        fromPos.current.set(...from.position);
        fromLook.current.set(...from.lookAt);
      }
      const wide = surveyWorldPose(
        distanceForPhase('wide'),
        0,
        TELESCOPE_ORBIT_PHI_CENTER,
      );
      toPos.current.set(...wide.position);
      toLook.current.set(...wide.lookAt);
      orbitCenterTheta.current = 0;
      orbitCenterPhi.current = TELESCOPE_ORBIT_PHI_CENTER;
      orbitRadiusMax.current = TELESCOPE_ORBIT_RADIUS_MAX;
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'wide';
    } else if (zoomPhase === 'retreating') {
      mode.current = 'survey';
      focusBase.current = null;
      animKind.current = 'survey';
      animDurationMs.current = TELESCOPE_ZOOM_MS;
      fromRadius.current = radius.current;
      toRadius.current = distanceForPhase('far');
      fromTheta.current = theta.current;
      toTheta.current = 0;
      fromPhi.current = phi.current;
      toPhi.current = TELESCOPE_ORBIT_PHI_CENTER;
      orbitCenterTheta.current = 0;
      orbitCenterPhi.current = TELESCOPE_ORBIT_PHI_CENTER;
      orbitRadiusMax.current = TELESCOPE_ORBIT_RADIUS_MAX;
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'far';
    } else if (zoomPhase === 'detail' && focusBasicId) {
      mode.current = 'focus';
      zoomInSubPhase.current = null;
      zoomInCameraLock.current = false;
      layer2SceneRef.current?.(true);
      if (!focusBase.current) {
        focusBase.current = computeFocusCameraPose(focusBasicId);
      }
    } else if (zoomPhase === 'wide') {
      mode.current = 'survey';
      focusBase.current = null;
      zoomInSubPhase.current = null;
      zoomInCameraLock.current = false;
      layer2SceneRef.current?.(false);
      radius.current = distanceForPhase('wide');
      theta.current = 0;
      phi.current = TELESCOPE_ORBIT_PHI_CENTER;
      targetTheta.current = 0;
      targetPhi.current = TELESCOPE_ORBIT_PHI_CENTER;
    }
  }, [zoomPhase, focusBasicId, camera]);

  useEffect(() => {
    const el = gl.domElement;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let dragged = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
      dragged = false;
      el.setPointerCapture(event.pointerId);
      el.style.cursor = 'grabbing';
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      const totalDx = event.clientX - startX;
      const totalDy = event.clientY - startY;
      if (
        !dragged &&
        totalDx * totalDx + totalDy * totalDy >
          TELESCOPE_CLICK_DRAG_THRESHOLD_PX * TELESCOPE_CLICK_DRAG_THRESHOLD_PX
      ) {
        dragged = true;
      }

      if (!dragged || animating.current) {
        return;
      }

      if (mode.current === 'focus') {
        const sens = TELESCOPE_FOCUS_VIEW.orbitSensitivity;
        const next = clampFocusOrbit(
          focusOrbitYawTarget.current - dx * sens,
          focusOrbitPitchTarget.current - dy * sens,
        );
        focusOrbitYawTarget.current = next.yaw;
        focusOrbitPitchTarget.current = next.pitch;
        return;
      }

      const next = clampOrbitCircular(
        targetTheta.current - dx * TELESCOPE_ORBIT_SENSITIVITY,
        targetPhi.current - dy * TELESCOPE_ORBIT_SENSITIVITY,
        orbitCenterTheta.current,
        orbitCenterPhi.current,
        orbitRadiusMax.current,
      );
      targetTheta.current = next.theta;
      targetPhi.current = next.phi;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      pointerId = null;
      el.style.cursor = 'grab';
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
      if (!dragged && !animating.current) {
        clickZoomRef.current?.();
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    if (animating.current) {
      const duration = Math.max(1, animDurationMs.current);
      progress.current = Math.min(1, progress.current + delta / (duration / 1000));
      const t = progress.current;
      const eased =
        zoomInSubPhase.current === 'pullBack'
          ? easePullBack(t)
          : zoomInSubPhase.current === 'rotate'
            ? easeRotateStart(t)
            : t * t * (3 - 2 * t);

      if (animKind.current === 'free') {
        camera.position.lerpVectors(fromPos.current, toPos.current, eased);
        TMP_LOOK.lerpVectors(fromLook.current, toLook.current, eased);
        if (zoomInSubPhase.current === 'rotate') {
          TMP_UP.lerpVectors(SURVEY_UP, PLANE_UP, eased).normalize();
        } else if (zoomInSubPhase.current === 'focusIn') {
          TMP_UP.copy(PLANE_UP);
        } else if (zoomPhaseRef.current === 'zooming-out') {
          TMP_UP.lerpVectors(PLANE_UP, SURVEY_UP, eased).normalize();
        } else {
          TMP_UP.copy(SURVEY_UP);
        }
        camera.up.copy(TMP_UP);
        camera.lookAt(TMP_LOOK);
        currentLookAt.current.copy(TMP_LOOK);
        camera.fov = THREE.MathUtils.lerp(fromFov.current, toFov.current, eased);
        camera.updateProjectionMatrix();
        reportMinimapCamera(camera);
      } else {
        radius.current = THREE.MathUtils.lerp(
          fromRadius.current,
          toRadius.current,
          eased,
        );
        const nextTheta = THREE.MathUtils.lerp(
          fromTheta.current,
          toTheta.current,
          eased,
        );
        const nextPhi = THREE.MathUtils.lerp(fromPhi.current, toPhi.current, eased);
        theta.current = nextTheta;
        phi.current = nextPhi;
        targetTheta.current = nextTheta;
        targetPhi.current = nextPhi;
        applySurveySpherical(camera, radius.current, theta.current, phi.current);
        currentLookAt.current.copy(LOOK_AHEAD);
        reportMinimapCamera(camera);
      }

      if (progress.current >= 1) {
        animating.current = false;
        if (
          zoomPhaseRef.current === 'zooming-in' &&
          zoomInSubPhase.current === 'pullBack'
        ) {
          pullbackPosition.current.copy(camera.position);
          beginRotateFromPullback(camera);
          return;
        }
        if (
          zoomPhaseRef.current === 'zooming-in' &&
          zoomInSubPhase.current === 'rotate'
        ) {
          beginCloseUpFromRotate(camera);
          return;
        }
        if (
          zoomPhaseRef.current === 'zooming-in' &&
          zoomInSubPhase.current === 'focusIn'
        ) {
          zoomInSubPhase.current = null;
          zoomInCameraLock.current = false;
          mode.current = 'focus';
          completedRef.current?.('detail');
          return;
        }
        if (targetPhase.current === 'detail') {
          mode.current = 'focus';
        } else if (targetPhase.current === 'wide') {
          mode.current = 'survey';
          focusBase.current = null;
          zoomInCameraLock.current = false;
          layer2SceneRef.current?.(false);
          radius.current = distanceForPhase('wide');
          theta.current = 0;
          phi.current = TELESCOPE_ORBIT_PHI_CENTER;
          targetTheta.current = 0;
          targetPhi.current = TELESCOPE_ORBIT_PHI_CENTER;
        } else if (targetPhase.current === 'far') {
          mode.current = 'survey';
          focusBase.current = null;
          zoomInCameraLock.current = false;
          layer2SceneRef.current?.(false);
        }
        completedRef.current?.(targetPhase.current);
      }
      return;
    }

    if (zoomInCameraLock.current) {
      reportMinimapCamera(camera);
      return;
    }

    if (mode.current === 'focus' && focusBase.current) {
      const errY = focusOrbitYawTarget.current - focusOrbitYaw.current;
      const errP = focusOrbitPitchTarget.current - focusOrbitPitch.current;
      const errDist = Math.hypot(errY, errP);
      if (errDist > 1e-6) {
        const step =
          TELESCOPE_ORBIT_FOLLOW_SPEED * followSpeedMultiplier(errDist) * delta;
        const move = Math.min(step, errDist);
        const inv = move / errDist;
        focusOrbitYaw.current += errY * inv;
        focusOrbitPitch.current += errP * inv;
      } else {
        focusOrbitYaw.current = focusOrbitYawTarget.current;
        focusOrbitPitch.current = focusOrbitPitchTarget.current;
      }
      applyFocusPose(
        camera,
        focusBase.current,
        focusOrbitYaw.current,
        focusOrbitPitch.current,
      );
      currentLookAt.current.copy(TMP_LOOK);
      reportMinimapCamera(camera);
      return;
    }

    const errTh = targetTheta.current - theta.current;
    const errPh = targetPhi.current - phi.current;
    const errDist = Math.hypot(errTh, errPh);
    if (errDist > 1e-6) {
      const step =
        TELESCOPE_ORBIT_FOLLOW_SPEED * followSpeedMultiplier(errDist) * delta;
      const move = Math.min(step, errDist);
      const inv = move / errDist;
      theta.current += errTh * inv;
      phi.current += errPh * inv;
    } else {
      theta.current = targetTheta.current;
      phi.current = targetPhi.current;
    }
    applySurveySpherical(camera, radius.current, theta.current, phi.current);
    currentLookAt.current.copy(LOOK_AHEAD);
    reportMinimapCamera(camera);
  });

  return null;
}

function resolveTelescopeMinimapFocus(
  focusBasicId: BasicEmotionId | null,
  viewFocus: TelescopeViewFocus,
): { id: EmotionId; label: string } | null {
  const candidate = (focusBasicId ?? viewFocus.nearest?.id) as EmotionId | null | undefined;
  if (!candidate) {
    return null;
  }

  const emotion = getEmotionById(candidate);
  if (!emotion) {
    return null;
  }

  return {
    id: candidate,
    label: viewFocus.nearest?.id === candidate ? viewFocus.nearest.label : emotion.label,
  };
}

function TelescopeMinimapSync({
  cameraState,
  focusBasicId,
  viewFocus,
  layer2SceneActive,
  onChange,
}: {
  cameraState: Pick<MinimapSyncState, 'cameraPosition' | 'cameraTarget' | 'cameraUp'> | null;
  focusBasicId: BasicEmotionId | null;
  viewFocus: TelescopeViewFocus;
  layer2SceneActive: boolean;
  onChange?: (state: MinimapSyncState | null) => void;
}) {
  const frameCounter = useRef(0);

  useFrame(() => {
    if (!onChange) {
      return;
    }

    if (!cameraState) {
      onChange(null);
      return;
    }

    frameCounter.current = (frameCounter.current + 1) % 2;
    if (frameCounter.current !== 0) {
      return;
    }

    const relatedLinkBasicId = layer2SceneActive ? focusBasicId : null;
    const selectedStarPosition =
      relatedLinkBasicId != null
        ? getTelescopeEmotionWorldPosition(relatedLinkBasicId)
        : null;
    const focus = resolveTelescopeMinimapFocus(focusBasicId, viewFocus);
    if (!focus) {
      onChange({
        ...cameraState,
        focusPosition: selectedStarPosition,
        primaryId: null,
        primaryLabel: null,
        relatedLinkBasicId,
      });
      return;
    }

    onChange({
      ...cameraState,
      focusPosition: selectedStarPosition,
      primaryId: focus.id,
      primaryLabel: focus.label,
      relatedLinkBasicId,
    });
  });

  return null;
}

function Starfield() {
  const positions = useRef<Float32Array | null>(null);
  if (!positions.current) {
    const count = 1400;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 16 + Math.random() * 48;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(p) * Math.cos(t);
      arr[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      arr[i * 3 + 2] = r * Math.cos(p) - 6;
    }
    positions.current = arr;
  }

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.current, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.024}
        color="#c8d0e8"
        transparent
        opacity={0.5}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function DetailVisibilityBridge({
  zoomPhase,
  focusBasicId,
  layer2SceneActive,
  onViewFocus,
}: {
  zoomPhase: TelescopeZoomPhase;
  focusBasicId: BasicEmotionId | null;
  layer2SceneActive: boolean;
  onViewFocus?: (focus: TelescopeViewFocus) => void;
}) {
  const { camera } = useThree();
  const [visibility, setVisibility] = useState(
    zoomPhase === 'wide' ? TELESCOPE_WIDE_DYAD_OPACITY : 0,
  );
  const lastVis = useRef(visibility);
  const zoomProgress = useRef(
    zoomPhase === 'detail' ? 1 : zoomPhase === 'wide' ? 0 : 0,
  );

  useEffect(() => {
    if (zoomPhase === 'zooming-in') {
      zoomProgress.current = 0;
    } else if (zoomPhase === 'zooming-out') {
      zoomProgress.current = 1;
    } else if (zoomPhase === 'detail') {
      zoomProgress.current = 1;
    } else if (zoomPhase === 'wide') {
      zoomProgress.current = 0;
    }
  }, [zoomPhase]);

  useFrame((_, delta) => {
    if (zoomPhase === 'zooming-in') {
      zoomProgress.current = Math.min(
        1,
        zoomProgress.current + delta / (TELESCOPE_FOCUS_VIEW.moveMs / 1000),
      );
    } else if (zoomPhase === 'zooming-out') {
      zoomProgress.current = Math.max(
        0,
        zoomProgress.current - delta / (TELESCOPE_FOCUS_VIEW.moveMs / 1000),
      );
    }

    let nextVis = 0;
    if (zoomPhase === 'detail') {
      nextVis = 1;
    } else if (zoomPhase === 'far' || zoomPhase === 'retreating') {
      nextVis = 0;
    } else if (zoomPhase === 'approaching') {
      const r = camera.position.distanceTo(PIVOT);
      const span = TELESCOPE_CAMERA_DISTANCE_WIDE - TELESCOPE_CAMERA_DISTANCE_FAR;
      const t = span > 0 ? (r - TELESCOPE_CAMERA_DISTANCE_FAR) / span : 1;
      nextVis = Math.max(0, Math.min(1, t)) * TELESCOPE_WIDE_DYAD_OPACITY;
    } else if (zoomPhase === 'wide') {
      nextVis = TELESCOPE_WIDE_DYAD_OPACITY;
    } else if (zoomPhase === 'zooming-in' || zoomPhase === 'zooming-out') {
      if (!layer2SceneActive) {
        nextVis = TELESCOPE_WIDE_DYAD_OPACITY;
      } else {
        nextVis = THREE.MathUtils.lerp(
          TELESCOPE_WIDE_DYAD_OPACITY,
          1,
          zoomProgress.current,
        );
      }
    }

    if (Math.abs(nextVis - lastVis.current) > 0.02 || nextVis === 0 || nextVis === 1) {
      lastVis.current = nextVis;
      setVisibility(nextVis);
    }
  });

  return (
    <TelescopeGalaxyLayer
      zoomPhase={zoomPhase}
      detailVisibility={visibility}
      layer2SceneActive={layer2SceneActive}
      focusBasicId={focusBasicId}
      onViewFocus={onViewFocus}
    />
  );
}

export function TelescopeSpaceCanvas({
  zoomPhase,
  focusBasicId,
  viewFocus,
  onZoomComplete,
  onCanvasClickZoom,
  onViewFocus,
  onMinimapSync,
}: TelescopeSpaceCanvasProps) {
  const [layer2SceneActive, setLayer2SceneActive] = useState(false);
  const [cameraState, setCameraState] = useState<Pick<
    MinimapSyncState,
    'cameraPosition' | 'cameraTarget' | 'cameraUp'
  > | null>(null);

  const handleCameraStateChange = useCallback(
    (state: Pick<MinimapSyncState, 'cameraPosition' | 'cameraTarget' | 'cameraUp'>) => {
      setCameraState(state);
    },
    [],
  );

  const handleMinimapSync = useCallback(
    (state: MinimapSyncState | null) => {
      onMinimapSync?.(state);
    },
    [onMinimapSync],
  );

  useEffect(() => {
    if (
      zoomPhase === 'wide' ||
      zoomPhase === 'far' ||
      zoomPhase === 'approaching' ||
      zoomPhase === 'retreating'
    ) {
      setLayer2SceneActive(false);
    }
  }, [zoomPhase]);

  return (
    <Canvas
      camera={{
        position: [
          TELESCOPE_PIVOT[0],
          TELESCOPE_PIVOT[1] + 0.2,
          TELESCOPE_PIVOT[2] - TELESCOPE_CAMERA_DISTANCE_FAR,
        ],
        fov: TELESCOPE_CAMERA_FOV,
      }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
    >
      <color attach="background" args={['#02030a']} />
      <TelescopeCameraController
        zoomPhase={zoomPhase}
        focusBasicId={focusBasicId}
        onZoomComplete={onZoomComplete}
        onCanvasClickZoom={onCanvasClickZoom}
        onLayer2SceneChange={setLayer2SceneActive}
        onCameraStateChange={handleCameraStateChange}
      />
      <TelescopeMinimapSync
        cameraState={cameraState}
        focusBasicId={focusBasicId}
        viewFocus={viewFocus}
        layer2SceneActive={layer2SceneActive}
        onChange={handleMinimapSync}
      />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 2, 8]} intensity={1.1} />
      <Starfield />
      <DetailVisibilityBridge
        zoomPhase={zoomPhase}
        focusBasicId={focusBasicId}
        layer2SceneActive={layer2SceneActive}
        onViewFocus={onViewFocus}
      />
    </Canvas>
  );
}
