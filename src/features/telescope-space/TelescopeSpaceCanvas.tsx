import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BasicEmotionId } from '../../data/emotions';
import {
  TELESCOPE_CAMERA_DISTANCE_FAR,
  TELESCOPE_CAMERA_DISTANCE_WIDE,
  TELESCOPE_CAMERA_FOV,
  TELESCOPE_CLICK_DRAG_THRESHOLD_PX,
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
  onZoomComplete?: (phase: TelescopeSettledPhase) => void;
  onCanvasClickZoom?: () => void;
  onViewFocus?: (focus: TelescopeViewFocus) => void;
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
}: {
  zoomPhase: TelescopeZoomPhase;
  focusBasicId: BasicEmotionId | null;
  onZoomComplete?: (phase: TelescopeSettledPhase) => void;
  onCanvasClickZoom?: () => void;
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
  /** survey 距離補間か、自由ポーズ補間か */
  const animKind = useRef<'survey' | 'free'>('survey');
  const animating = useRef(false);
  const targetPhase = useRef<TelescopeSettledPhase>('far');
  const completedRef = useRef(onZoomComplete);
  const clickZoomRef = useRef(onCanvasClickZoom);
  completedRef.current = onZoomComplete;
  clickZoomRef.current = onCanvasClickZoom;

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
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_FOCUS_VIEW.moveMs;
      const from = surveyWorldPose(radius.current, theta.current, phi.current);
      fromPos.current.set(...from.position);
      fromLook.current.set(...from.lookAt);
      toPos.current.set(...pose.position);
      toLook.current.set(...pose.lookAt);
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'detail';
    } else if (zoomPhase === 'zooming-out') {
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
      if (!focusBase.current) {
        focusBase.current = computeFocusCameraPose(focusBasicId);
      }
    } else if (zoomPhase === 'wide') {
      mode.current = 'survey';
      focusBase.current = null;
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
      const eased = t * t * (3 - 2 * t);

      if (animKind.current === 'free') {
        camera.position.lerpVectors(fromPos.current, toPos.current, eased);
        TMP_LOOK.lerpVectors(fromLook.current, toLook.current, eased);
        // 銀河俯瞰(Y-up) ↔ 平面縦視点(Z-up) を遷移で補間
        const toFocus = targetPhase.current === 'detail';
        if (toFocus) {
          TMP_UP.lerpVectors(SURVEY_UP, PLANE_UP, eased).normalize();
        } else {
          TMP_UP.lerpVectors(PLANE_UP, SURVEY_UP, eased).normalize();
        }
        camera.up.copy(TMP_UP);
        camera.lookAt(TMP_LOOK);
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
      }

      if (progress.current >= 1) {
        animating.current = false;
        if (targetPhase.current === 'detail') {
          mode.current = 'focus';
        } else if (targetPhase.current === 'wide') {
          mode.current = 'survey';
          focusBase.current = null;
          radius.current = distanceForPhase('wide');
          theta.current = 0;
          phi.current = TELESCOPE_ORBIT_PHI_CENTER;
          targetTheta.current = 0;
          targetPhi.current = TELESCOPE_ORBIT_PHI_CENTER;
        } else if (targetPhase.current === 'far') {
          mode.current = 'survey';
          focusBase.current = null;
        }
        completedRef.current?.(targetPhase.current);
      }
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
  onViewFocus,
}: {
  zoomPhase: TelescopeZoomPhase;
  focusBasicId: BasicEmotionId | null;
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
      nextVis = THREE.MathUtils.lerp(
        TELESCOPE_WIDE_DYAD_OPACITY,
        1,
        zoomProgress.current,
      );
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
      focusBasicId={focusBasicId}
      onViewFocus={onViewFocus}
    />
  );
}

export function TelescopeSpaceCanvas({
  zoomPhase,
  focusBasicId,
  onZoomComplete,
  onCanvasClickZoom,
  onViewFocus,
}: TelescopeSpaceCanvasProps) {
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
      />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 2, 8]} intensity={1.1} />
      <Starfield />
      <DetailVisibilityBridge
        zoomPhase={zoomPhase}
        focusBasicId={focusBasicId}
        onViewFocus={onViewFocus}
      />
    </Canvas>
  );
}
