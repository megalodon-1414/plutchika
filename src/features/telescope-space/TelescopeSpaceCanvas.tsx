import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import { getEmotionById } from '../../data/emotions';
import type { UserPlotRow } from '../../types/userPlot';
import type { MinimapSyncState } from '../../utils/emotionMinimapLayout';
import { getTelescopeEmotionWorldPosition } from '../../utils/telescopeMinimapLayout';
import {
  TELESCOPE_CAMERA_DISTANCE_FAR,
  TELESCOPE_CAMERA_DISTANCE_WIDE,
  TELESCOPE_CAMERA_FOV,
  TELESCOPE_CLICK_DRAG_THRESHOLD_PX,
  TELESCOPE_GALAXY_RADIUS,
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
  getFocusEmotionPosition,
  TELESCOPE_FOCUS_PLANE_UP,
  TELESCOPE_FOCUS_VIEW,
  type TelescopeFocusCameraPose,
} from './focusCameraView';
import {
  computeTelescopeRegionCameraPose,
  getTelescopeRegionDefinition,
  TELESCOPE_REGION_VIEW,
  type TelescopeRegionDefinition,
} from './layer3Region';
import {
  computeTelescopeExplorationCameraPose,
  getTelescopeRegionPlotPosition,
  TELESCOPE_EXPLORATION_VIEW,
} from './layer4Exploration';
import {
  TelescopeGalaxyLayer,
  type TelescopeRegionIndicatorState,
  type TelescopeSegmentFocusState,
  type TelescopeViewFocus,
} from './TelescopeGalaxyLayer';

interface TelescopeSpaceCanvasProps {
  zoomPhase: TelescopeZoomPhase;
  focusBasicId: BasicEmotionId | null;
  selectedDyadId: EmotionId | null;
  wordPlots: readonly UserPlotRow[];
  viewFocus: TelescopeViewFocus;
  onZoomComplete?: (phase: TelescopeSettledPhase) => void;
  onCanvasClickZoom?: () => void;
  onLayer2RotationComplete?: () => void;
  onViewFocus?: (focus: TelescopeViewFocus) => void;
  onMinimapSync?: (state: MinimapSyncState | null) => void;
  /** レイヤー3の現在位置インジケータ（画面固定 HUD）との共有状態 */
  regionIndicator?: { current: TelescopeRegionIndicatorState };
  /** レイヤー3の中央検知区画（レイヤー4入口） */
  segmentFocus?: { current: TelescopeSegmentFocusState };
  /** レイヤー4で選択中の感情点 */
  explorationPlotId?: string | null;
  onSelectExplorationPlot?: (id: string) => void;
}

const PIVOT = new THREE.Vector3(...TELESCOPE_PIVOT);
const LOOK_AHEAD = new THREE.Vector3();
const TMP_LOOK = new THREE.Vector3();
const TMP_TANGENT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();
const TMP_FORWARD = new THREE.Vector3();
const SURVEY_UP = new THREE.Vector3(0, 1, 0);
const FOCUS_UP = new THREE.Vector3(...TELESCOPE_FOCUS_PLANE_UP);
const REACT_SYNC_INTERVAL_MS = 1000 / 24;

type CameraMode = 'survey' | 'focus' | 'region' | 'exploration';
type ZoomInSubPhase = 'rotate' | 'focusIn';

/**
 * 遷移中の中間姿勢用。選択感情→原点の XY 方向を画面上にし、
 * 8感情の中心が画面上側に来るようにする。
 */
function getFocusScreenUp(
  base: TelescopeFocusCameraPose,
  out: THREE.Vector3,
): THREE.Vector3 {
  out.set(-base.lookAt[0], -base.lookAt[1], 0);
  if (out.lengthSq() < 1e-8) {
    return out.copy(FOCUS_UP);
  }
  return out.normalize();
}

function easeRotateToFocusView(t: number): number {
  return t * t * (3 - 2 * t);
}

function orientationLookingAt(
  position: THREE.Vector3,
  lookAt: THREE.Vector3,
  up: THREE.Vector3,
  out: THREE.Quaternion,
): THREE.Quaternion {
  TMP_FORWARD.copy(lookAt).sub(position);
  if (TMP_FORWARD.lengthSq() < 1e-8) {
    TMP_FORWARD.set(0, 0, -1);
  } else {
    TMP_FORWARD.normalize();
  }
  const basis = new THREE.Matrix4();
  basis.lookAt(position, lookAt, up);
  return out.setFromRotationMatrix(basis);
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

const _gazeDir = new THREE.Vector3();
const _gazeHit = new THREE.Vector3();

/**
 * カメラ→注視点の視線と銀河平面(z=0)の交点。
 * ミニマップ用：俯瞰カメラの生座標(z≈28)をマーカーに渡さない。
 */
function intersectLookWithGalaxyPlane(
  cameraPosition: THREE.Vector3,
  lookAt: THREE.Vector3,
): [number, number, number] {
  _gazeDir.copy(lookAt).sub(cameraPosition);
  if (Math.abs(_gazeDir.z) < 1e-6) {
    return [lookAt.x, lookAt.y, 0];
  }
  const t = -cameraPosition.z / _gazeDir.z;
  if (t < 0.05) {
    // 背面や極端に近い交点は注視点の XY へフォールバック
    return [lookAt.x, lookAt.y, 0];
  }
  _gazeHit.copy(cameraPosition).addScaledVector(_gazeDir, t);
  // 環の少し外までに抑え、マーカーが飛んでいかないようにする
  const maxR = TELESCOPE_GALAXY_RADIUS * 1.35;
  const r = Math.hypot(_gazeHit.x, _gazeHit.y);
  if (r > maxR) {
    const s = maxR / r;
    return [_gazeHit.x * s, _gazeHit.y * s, 0];
  }
  return [_gazeHit.x, _gazeHit.y, 0];
}

function applyFocusPose(
  camera: THREE.PerspectiveCamera,
  base: TelescopeFocusCameraPose,
  orbitYaw: number,
  orbitPitch: number,
) {
  // 回転中心＝カメラ自身。位置固定、視線だけ左右・上下。
  // up は環平面法線で固定し、正面＝選択感情方向にする。
  camera.position.set(...base.position);

  TMP_FORWARD.set(
    base.lookAt[0] - base.position[0],
    base.lookAt[1] - base.position[1],
    base.lookAt[2] - base.position[2],
  );
  if (TMP_FORWARD.lengthSq() < 1e-8) {
    TMP_FORWARD.set(0, 0, -1);
  } else {
    TMP_FORWARD.normalize();
  }

  TMP_UP.copy(FOCUS_UP);
  TMP_FORWARD.applyAxisAngle(TMP_UP, orbitYaw);
  TMP_TANGENT.crossVectors(TMP_FORWARD, TMP_UP);
  if (TMP_TANGENT.lengthSq() < 1e-8) {
    TMP_TANGENT.set(1, 0, 0);
  } else {
    TMP_TANGENT.normalize();
  }
  TMP_FORWARD.applyAxisAngle(TMP_TANGENT, orbitPitch);

  TMP_LOOK.copy(camera.position).add(TMP_FORWARD);
  camera.up.copy(TMP_UP);
  camera.lookAt(TMP_LOOK);
}

/** レイヤー2到着時に姿勢・画角・見回し角を正面基準へ揃える */
function settleFocusCamera(
  camera: THREE.PerspectiveCamera,
  base: TelescopeFocusCameraPose,
) {
  camera.fov = TELESCOPE_FOCUS_VIEW.fov;
  camera.updateProjectionMatrix();
  applyFocusPose(camera, base, 0, 0);
}

function applyRegionPose(
  camera: THREE.PerspectiveCamera,
  region: TelescopeRegionDefinition,
  progress: number,
) {
  const pose = computeTelescopeRegionCameraPose(region, progress);
  camera.position.set(...pose.position);
  TMP_LOOK.set(...pose.lookAt);
  // バーを水平に保つため、レイヤー2と同じ平面法線を up にする。
  camera.up.copy(FOCUS_UP);
  camera.lookAt(TMP_LOOK);
}

function applyExplorationPose(
  camera: THREE.PerspectiveCamera,
  region: TelescopeRegionDefinition,
  lookAt: [number, number, number],
  offset?: THREE.Vector3,
) {
  if (offset && offset.lengthSq() > 1e-8) {
    camera.position.set(
      lookAt[0] + offset.x,
      lookAt[1] + offset.y,
      lookAt[2] + offset.z,
    );
  } else {
    const pose = computeTelescopeExplorationCameraPose(region, lookAt);
    camera.position.set(...pose.position);
  }
  TMP_LOOK.set(lookAt[0], lookAt[1], lookAt[2]);
  camera.up.copy(FOCUS_UP);
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
  selectedDyadId,
  wordPlots,
  explorationPlotId,
  onZoomComplete,
  onCanvasClickZoom,
  onLayer2SceneChange,
  onLayer2RotationComplete,
  onRegionProgressChange,
  onCameraStateChange,
}: {
  zoomPhase: TelescopeZoomPhase;
  focusBasicId: BasicEmotionId | null;
  selectedDyadId: EmotionId | null;
  wordPlots: readonly UserPlotRow[];
  explorationPlotId?: string | null;
  onZoomComplete?: (phase: TelescopeSettledPhase) => void;
  onCanvasClickZoom?: () => void;
  onLayer2SceneChange?: (active: boolean) => void;
  onLayer2RotationComplete?: () => void;
  onRegionProgressChange?: (progress: number) => void;
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
  const regionDefinition = useRef<TelescopeRegionDefinition | null>(null);
  const regionProgress = useRef(0.5);
  const explorationOffset = useRef(new THREE.Vector3());
  const explorationLook = useRef(new THREE.Vector3());
  const lastExplorationPlotId = useRef<string | null>(null);
  const explorationRetargeting = useRef(false);
  const explorationFromLook = useRef(new THREE.Vector3());
  const explorationToLook = useRef(new THREE.Vector3());
  const explorationRetargetProgress = useRef(1);
  const wordPlotsRef = useRef(wordPlots);
  const explorationPlotIdRef = useRef(explorationPlotId);
  wordPlotsRef.current = wordPlots;
  explorationPlotIdRef.current = explorationPlotId;

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
  const fromQuat = useRef(new THREE.Quaternion());
  const toQuat = useRef(new THREE.Quaternion());
  /** survey 距離補間か、自由ポーズ補間か */
  const animKind = useRef<'survey' | 'free'>('survey');
  const animating = useRef(false);
  const targetPhase = useRef<TelescopeSettledPhase>('far');
  const zoomPhaseRef = useRef(zoomPhase);
  const zoomInSubPhase = useRef<ZoomInSubPhase | null>(null);
  const zoomInCameraLock = useRef(false);
  const rotationPosition = useRef(new THREE.Vector3());
  /** 遷移中の screen-up（原点が上）。最終カメラは FOCUS_UP に接続する */
  const focusScreenUp = useRef(new THREE.Vector3().copy(FOCUS_UP));
  const completedRef = useRef(onZoomComplete);
  const clickZoomRef = useRef(onCanvasClickZoom);
  const layer2SceneRef = useRef(onLayer2SceneChange);
  const rotationCompleteRef = useRef(onLayer2RotationComplete);
  const regionProgressRef = useRef(onRegionProgressChange);
  const cameraStateRef = useRef(onCameraStateChange);
  const lastReactSyncAt = useRef(-Infinity);
  const lastReportedCamera = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    up: THREE.Vector3;
  } | null>(null);
  const currentLookAt = useRef(new THREE.Vector3(...surveyWorldPose(
    TELESCOPE_CAMERA_DISTANCE_FAR,
    0,
    TELESCOPE_ORBIT_PHI_CENTER,
  ).lookAt));
  completedRef.current = onZoomComplete;
  clickZoomRef.current = onCanvasClickZoom;
  layer2SceneRef.current = onLayer2SceneChange;
  rotationCompleteRef.current = onLayer2RotationComplete;
  regionProgressRef.current = onRegionProgressChange;
  cameraStateRef.current = onCameraStateChange;
  zoomPhaseRef.current = zoomPhase;

  const reportMinimapCamera = (camera: THREE.PerspectiveCamera) => {
    const onChange = cameraStateRef.current;
    if (!onChange) {
      return;
    }

    const now = performance.now();
    if (now - lastReactSyncAt.current < REACT_SYNC_INTERVAL_MS) {
      return;
    }

    const previous = lastReportedCamera.current;
    if (
      previous &&
      previous.position.distanceToSquared(camera.position) < 1e-8 &&
      previous.target.distanceToSquared(currentLookAt.current) < 1e-8 &&
      previous.up.distanceToSquared(camera.up) < 1e-8
    ) {
      return;
    }

    lastReactSyncAt.current = now;

    if (previous) {
      previous.position.copy(camera.position);
      previous.target.copy(currentLookAt.current);
      previous.up.copy(camera.up);
    } else {
      lastReportedCamera.current = {
        position: camera.position.clone(),
        target: currentLookAt.current.clone(),
        up: camera.up.clone(),
      };
    }

    onChange({
      // 俯瞰時は視線と銀河平面の交点を「現在地」にし、Layer2 では実カメラ XY を平面へ落とす
      cameraPosition:
        mode.current === 'focus' ||
        mode.current === 'region' ||
        mode.current === 'exploration'
          ? [camera.position.x, camera.position.y, 0]
          : intersectLookWithGalaxyPlane(camera.position, currentLookAt.current),
      cameraTarget: [0, 0, 0],
      cameraUp: [0, 1, 0],
    });
  };

  const beginCloseUpFromRotate = (camera: THREE.PerspectiveCamera) => {
    if (!focusBasicId || !focusBase.current) {
      return;
    }
    const pose = focusBase.current;
    zoomInSubPhase.current = 'focusIn';
    layer2SceneRef.current?.(true);
    rotationCompleteRef.current?.();
    animKind.current = 'free';
    animDurationMs.current = TELESCOPE_FOCUS_VIEW.moveMs;
    fromPos.current.copy(rotationPosition.current);
    toPos.current.set(...pose.position);
    fromLook.current.set(...getFocusEmotionPosition(focusBasicId));
    toLook.current.set(...pose.lookAt);
    // 遷移時のscreen-upから、接近中に最終の平面upへ乗り換える。
    fromFov.current = camera.fov;
    toFov.current = TELESCOPE_FOCUS_VIEW.fov;
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
      zoomInSubPhase.current = 'rotate';
      zoomInCameraLock.current = true;
      layer2SceneRef.current?.(false);
      const from = surveyWorldPose(radius.current, theta.current, phi.current);
      const rotatePose: TelescopeFocusCameraPose = {
        position: pose.position,
        lookAt: getFocusEmotionPosition(focusBasicId),
      };
      rotationPosition.current.set(...from.position);
      fromPos.current.set(...from.position);
      toPos.current.set(...from.position);
      fromLook.current.set(...from.lookAt);
      toLook.current.set(...rotatePose.lookAt);
      // 第1段: 位置固定のまま、選択感情注視＋原点が画面上の姿勢へ回転
      getFocusScreenUp(rotatePose, focusScreenUp.current);
      orientationLookingAt(
        fromPos.current,
        fromLook.current,
        SURVEY_UP,
        fromQuat.current,
      );
      orientationLookingAt(
        toPos.current,
        toLook.current,
        focusScreenUp.current,
        toQuat.current,
      );
      fromFov.current = camera.fov;
      toFov.current = camera.fov;
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_LAYER2_ROTATE_MS;
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'detail';
    } else if (zoomPhase === 'entering-region' && selectedDyadId) {
      const region = getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
      if (!region || !focusBase.current) {
        return;
      }
      regionDefinition.current = region;
      regionProgress.current = 0.5;
      regionProgressRef.current?.(0.5);
      applyFocusPose(
        camera,
        focusBase.current,
        focusOrbitYaw.current,
        focusOrbitPitch.current,
      );
      fromPos.current.copy(camera.position);
      fromLook.current.copy(TMP_LOOK);
      const pose = computeTelescopeRegionCameraPose(region, 0.5);
      toPos.current.set(...pose.position);
      toLook.current.set(...pose.lookAt);
      fromFov.current = camera.fov;
      toFov.current = TELESCOPE_REGION_VIEW.fov;
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_REGION_VIEW.moveMs;
      progress.current = 0;
      animating.current = true;
      layer2SceneRef.current?.(false);
      targetPhase.current = 'region';
    } else if (zoomPhase === 'leaving-region') {
      const region = regionDefinition.current;
      if (!region || !focusBase.current) {
        return;
      }
      applyRegionPose(camera, region, regionProgress.current);
      fromPos.current.copy(camera.position);
      fromLook.current.copy(TMP_LOOK);
      toPos.current.set(...focusBase.current.position);
      toLook.current.set(...focusBase.current.lookAt);
      fromFov.current = camera.fov;
      toFov.current = TELESCOPE_FOCUS_VIEW.fov;
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_REGION_VIEW.moveMs;
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'detail';
    } else if (
      zoomPhase === 'entering-exploration' &&
      selectedDyadId &&
      explorationPlotId
    ) {
      const region =
        regionDefinition.current ??
        getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
      const plot = wordPlots.find((row) => row.word_id === explorationPlotId);
      if (!region || !plot) {
        return;
      }
      regionDefinition.current = region;
      applyRegionPose(camera, region, regionProgress.current);
      fromPos.current.copy(camera.position);
      fromLook.current.copy(TMP_LOOK);
      const lookAt = getTelescopeRegionPlotPosition(region, plot, 0);
      const pose = computeTelescopeExplorationCameraPose(region, lookAt);
      toPos.current.set(...pose.position);
      toLook.current.set(...pose.lookAt);
      explorationOffset.current
        .set(...pose.position)
        .sub(new THREE.Vector3(...pose.lookAt));
      lastExplorationPlotId.current = explorationPlotId;
      fromFov.current = camera.fov;
      toFov.current = TELESCOPE_EXPLORATION_VIEW.fov;
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_EXPLORATION_VIEW.moveMs;
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'exploration';
    } else if (zoomPhase === 'leaving-exploration') {
      const region = regionDefinition.current;
      if (!region) {
        return;
      }
      applyExplorationPose(
        camera,
        region,
        [
          explorationLook.current.x,
          explorationLook.current.y,
          explorationLook.current.z,
        ],
        explorationOffset.current,
      );
      fromPos.current.copy(camera.position);
      fromLook.current.copy(TMP_LOOK);
      const pose = computeTelescopeRegionCameraPose(
        region,
        regionProgress.current,
      );
      toPos.current.set(...pose.position);
      toLook.current.set(...pose.lookAt);
      fromFov.current = camera.fov;
      toFov.current = TELESCOPE_REGION_VIEW.fov;
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_EXPLORATION_VIEW.moveMs;
      progress.current = 0;
      animating.current = true;
      targetPhase.current = 'region';
    } else if (zoomPhase === 'zooming-out') {
      zoomInSubPhase.current = null;
      zoomInCameraLock.current = true;
      layer2SceneRef.current?.(true);
      animKind.current = 'free';
      animDurationMs.current = TELESCOPE_FOCUS_VIEW.moveMs;
      if (focusBase.current) {
        focusScreenUp.current.copy(FOCUS_UP);
        applyFocusPose(
          camera,
          focusBase.current,
          focusOrbitYaw.current,
          focusOrbitPitch.current,
        );
        fromPos.current.copy(camera.position);
        fromLook.current.copy(TMP_LOOK);
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
      fromFov.current = camera.fov;
      toFov.current = TELESCOPE_CAMERA_FOV;
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
    } else if (zoomPhase === 'region' && selectedDyadId) {
      const region =
        regionDefinition.current ??
        getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
      if (region) {
        regionDefinition.current = region;
        mode.current = 'region';
        zoomInCameraLock.current = false;
        layer2SceneRef.current?.(false);
        camera.fov = TELESCOPE_REGION_VIEW.fov;
        camera.updateProjectionMatrix();
        applyRegionPose(camera, region, regionProgress.current);
        currentLookAt.current.copy(TMP_LOOK);
      }
    } else if (zoomPhase === 'exploration' && selectedDyadId) {
      const region =
        regionDefinition.current ??
        getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
      if (region) {
        regionDefinition.current = region;
        mode.current = 'exploration';
        zoomInCameraLock.current = false;
        layer2SceneRef.current?.(false);
        camera.fov = TELESCOPE_EXPLORATION_VIEW.fov;
        camera.updateProjectionMatrix();
        // 点間移動の追従は useFrame 側。ここではモード定着だけ行う。
      }
    } else if (zoomPhase === 'detail' && focusBasicId) {
      mode.current = 'focus';
      zoomInSubPhase.current = null;
      zoomInCameraLock.current = false;
      layer2SceneRef.current?.(true);
      if (!focusBase.current) {
        focusBase.current = computeFocusCameraPose(focusBasicId);
      }
      focusOrbitYaw.current = 0;
      focusOrbitPitch.current = 0;
      focusScreenUp.current.copy(FOCUS_UP);
      settleFocusCamera(camera, focusBase.current);
      currentLookAt.current.copy(TMP_LOOK);
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
  }, [zoomPhase, focusBasicId, selectedDyadId, explorationPlotId, wordPlots, camera]);

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

      if (mode.current === 'region') {
        // バーは画面水平（左=start、右=end）。右ドラッグで景色をつかんで左（start 側）へ進む。
        regionProgress.current = THREE.MathUtils.clamp(
          regionProgress.current - dx * TELESCOPE_REGION_VIEW.dragSensitivity,
          TELESCOPE_REGION_VIEW.progressMin,
          TELESCOPE_REGION_VIEW.progressMax,
        );
        regionProgressRef.current?.(regionProgress.current);
        return;
      }

      // レイヤー4では点クリックで移動するため、ドラッグ見回しは無効
      if (mode.current === 'exploration') {
        return;
      }

      if (mode.current === 'focus') {
        const sens = TELESCOPE_FOCUS_VIEW.orbitSensitivity;
        // ドラッグ方向とカメラ回転を直感に合わせる（左右・上下を反転）
        const next = clampFocusOrbit(
          focusOrbitYaw.current + dx * sens,
          focusOrbitPitch.current + dy * sens,
        );
        focusOrbitYaw.current = next.yaw;
        focusOrbitPitch.current = next.pitch;
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
      if (
        !dragged &&
        !animating.current &&
        mode.current !== 'exploration'
      ) {
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

  useFrame(({ clock }, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    if (animating.current) {
      const duration = Math.max(1, animDurationMs.current);
      progress.current = Math.min(1, progress.current + delta / (duration / 1000));
      const t = progress.current;
      const eased =
        zoomInSubPhase.current === 'rotate'
          ? easeRotateToFocusView(t)
          : t * t * (3 - 2 * t);

      if (animKind.current === 'free') {
        camera.position.lerpVectors(fromPos.current, toPos.current, eased);
        if (zoomInSubPhase.current === 'rotate') {
          // 位置は保ったまま、選択感情注視＋原点が画面上側の姿勢へ回り込む。
          camera.quaternion.slerpQuaternions(
            fromQuat.current,
            toQuat.current,
            eased,
          );
          TMP_LOOK.lerpVectors(fromLook.current, toLook.current, eased);
          camera.up.copy(focusScreenUp.current);
        } else {
          TMP_LOOK.lerpVectors(fromLook.current, toLook.current, eased);
          if (zoomInSubPhase.current === 'focusIn') {
            // 接近しながら遷移 up → 最終の平面 up へ滑らかに接続
            TMP_UP.lerpVectors(
              focusScreenUp.current,
              FOCUS_UP,
              eased,
            ).normalize();
          } else if (
            zoomPhaseRef.current === 'entering-region' ||
            zoomPhaseRef.current === 'leaving-region' ||
            zoomPhaseRef.current === 'entering-exploration' ||
            zoomPhaseRef.current === 'leaving-exploration'
          ) {
            // レイヤー3/4もレイヤー2と同じ平面法線 up を使う
            TMP_UP.copy(FOCUS_UP);
          } else if (zoomPhaseRef.current === 'zooming-out') {
            TMP_UP.lerpVectors(FOCUS_UP, SURVEY_UP, eased).normalize();
          } else {
            TMP_UP.copy(SURVEY_UP);
          }
          camera.up.copy(TMP_UP);
          camera.lookAt(TMP_LOOK);
        }
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
          focusOrbitYaw.current = 0;
          focusOrbitPitch.current = 0;
          if (focusBase.current) {
            settleFocusCamera(camera, focusBase.current);
            currentLookAt.current.copy(TMP_LOOK);
          }
          completedRef.current?.('detail');
          return;
        }
        if (targetPhase.current === 'region') {
          mode.current = 'region';
          if (regionDefinition.current) {
            applyRegionPose(
              camera,
              regionDefinition.current,
              regionProgress.current,
            );
            currentLookAt.current.copy(TMP_LOOK);
          }
        } else if (targetPhase.current === 'exploration') {
          mode.current = 'exploration';
          explorationLook.current.copy(toLook.current);
          explorationOffset.current
            .copy(toPos.current)
            .sub(toLook.current);
        } else if (targetPhase.current === 'detail') {
          mode.current = 'focus';
          layer2SceneRef.current?.(true);
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

    if (mode.current === 'region' && regionDefinition.current) {
      applyRegionPose(
        camera,
        regionDefinition.current,
        regionProgress.current,
      );
      currentLookAt.current.copy(TMP_LOOK);
      reportMinimapCamera(camera);
      return;
    }

    if (mode.current === 'exploration' && regionDefinition.current) {
      const plotId = explorationPlotIdRef.current;
      const plot = plotId
        ? wordPlotsRef.current.find((row) => row.word_id === plotId)
        : null;
      if (plot) {
        const lookAt = getTelescopeRegionPlotPosition(
          regionDefinition.current,
          plot,
          clock.elapsedTime,
        );

        if (
          lastExplorationPlotId.current &&
          lastExplorationPlotId.current !== plotId
        ) {
          explorationFromLook.current.copy(explorationLook.current);
          explorationToLook.current.set(...lookAt);
          explorationRetargetProgress.current = 0;
          explorationRetargeting.current = true;
          lastExplorationPlotId.current = plotId ?? null;
        } else if (!lastExplorationPlotId.current) {
          lastExplorationPlotId.current = plotId ?? null;
        }

        if (explorationRetargeting.current) {
          explorationRetargetProgress.current = Math.min(
            1,
            explorationRetargetProgress.current +
              delta / (TELESCOPE_EXPLORATION_VIEW.moveMs / 1000),
          );
          const t = explorationRetargetProgress.current;
          const eased = t * t * (3 - 2 * t);
          explorationLook.current.lerpVectors(
            explorationFromLook.current,
            explorationToLook.current,
            eased,
          );
          if (t >= 1) {
            explorationRetargeting.current = false;
            explorationLook.current.set(...lookAt);
          }
        } else {
          explorationLook.current.set(...lookAt);
        }

        applyExplorationPose(
          camera,
          regionDefinition.current,
          [
            explorationLook.current.x,
            explorationLook.current.y,
            explorationLook.current.z,
          ],
          explorationOffset.current,
        );
        currentLookAt.current.copy(TMP_LOOK);
      }
      reportMinimapCamera(camera);
      return;
    }

    if (mode.current === 'focus' && focusBase.current) {
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
  useEffect(() => {
    if (!onChange) {
      return;
    }

    if (!cameraState) {
      onChange(null);
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
  }, [
    cameraState,
    focusBasicId,
    layer2SceneActive,
    onChange,
    viewFocus,
  ]);

  return null;
}

function createStarPositions(
  count: number,
  minRadius: number,
  maxRadius: number,
  seed: number,
): Float32Array {
  const positions = new Float32Array(count * 3);
  let state = seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const radius = THREE.MathUtils.lerp(
      minRadius,
      maxRadius,
      Math.cbrt(random()),
    );
    const azimuth = random() * Math.PI * 2;
    const cosPolar = random() * 2 - 1;
    const sinPolar = Math.sqrt(1 - cosPolar * cosPolar);
    positions[i * 3] = radius * sinPolar * Math.cos(azimuth);
    positions[i * 3 + 1] = radius * sinPolar * Math.sin(azimuth);
    positions[i * 3 + 2] = radius * cosPolar + 4;
  }
  return positions;
}

function StarPoints({
  positions,
  size,
  color,
  opacity,
}: {
  positions: Float32Array;
  size: number;
  color: string;
  opacity: number;
}) {
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}

function Starfield() {
  const dimStars = useMemo(
    () => createStarPositions(2200, 12, 68, 0x41c6ce57),
    [],
  );
  const brightStars = useMemo(
    () => createStarPositions(420, 7, 42, 0xb71d5eed),
    [],
  );

  return (
    <group>
      <StarPoints
        positions={dimStars}
        size={0.035}
        color="#dce7ff"
        opacity={0.72}
      />
      <StarPoints
        positions={brightStars}
        size={0.075}
        color="#ffffff"
        opacity={0.95}
      />
    </group>
  );
}

function DetailVisibilityBridge({
  zoomPhase,
  focusBasicId,
  selectedDyadId,
  wordPlots,
  layer2SceneActive,
  onViewFocus,
  regionIndicator,
  segmentFocus,
  explorationPlotId,
  onSelectExplorationPlot,
}: {
  zoomPhase: TelescopeZoomPhase;
  focusBasicId: BasicEmotionId | null;
  selectedDyadId: EmotionId | null;
  wordPlots: readonly UserPlotRow[];
  layer2SceneActive: boolean;
  onViewFocus?: (focus: TelescopeViewFocus) => void;
  regionIndicator?: { current: TelescopeRegionIndicatorState };
  segmentFocus?: { current: TelescopeSegmentFocusState };
  explorationPlotId?: string | null;
  onSelectExplorationPlot?: (id: string) => void;
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

    const reachedBoundary =
      nextVis !== lastVis.current && (nextVis === 0 || nextVis === 1);
    if (Math.abs(nextVis - lastVis.current) > 0.02 || reachedBoundary) {
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
      selectedDyadId={selectedDyadId}
      wordPlots={wordPlots}
      onViewFocus={onViewFocus}
      regionIndicator={regionIndicator}
      segmentFocus={segmentFocus}
      explorationPlotId={explorationPlotId}
      onSelectExplorationPlot={onSelectExplorationPlot}
    />
  );
}

export function TelescopeSpaceCanvas({
  zoomPhase,
  focusBasicId,
  selectedDyadId,
  wordPlots,
  viewFocus,
  onZoomComplete,
  onCanvasClickZoom,
  onLayer2RotationComplete,
  onViewFocus,
  onMinimapSync,
  regionIndicator,
  segmentFocus,
  explorationPlotId = null,
  onSelectExplorationPlot,
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
        selectedDyadId={selectedDyadId}
        wordPlots={wordPlots}
        explorationPlotId={explorationPlotId}
        onZoomComplete={onZoomComplete}
        onCanvasClickZoom={onCanvasClickZoom}
        onLayer2SceneChange={setLayer2SceneActive}
        onLayer2RotationComplete={onLayer2RotationComplete}
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
        selectedDyadId={selectedDyadId}
        wordPlots={wordPlots}
        layer2SceneActive={layer2SceneActive}
        onViewFocus={onViewFocus}
        regionIndicator={regionIndicator}
        segmentFocus={segmentFocus}
        explorationPlotId={explorationPlotId}
        onSelectExplorationPlot={onSelectExplorationPlot}
      />
    </Canvas>
  );
}
