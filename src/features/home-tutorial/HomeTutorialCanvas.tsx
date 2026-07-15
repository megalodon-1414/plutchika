import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { applySelectionViewOffset, clearSelectionViewOffset } from '../../utils/cameraFocus';
import { getHomeTutorialCameraPose } from './camera';
import {
  HOME_LANDING_INTRO_CENTER_ANCHOR,
  HOME_LANDING_INTRO_MOVE_MS,
  HOME_TUTORIAL_ACTIVE_HOVER_SCALE_BOOST,
  HOME_TUTORIAL_ACTIVE_SPHERE_SCALE,
  HOME_TUTORIAL_HOVER_SPHERE_SCALE,
  HOME_TUTORIAL_SPHERE_RADIUS,
  HOME_TUTORIAL_STEPS,
} from './constants';
import { getResponsiveScreenAnchor } from './responsive';
import { HomeTutorialPlutchikWheel3D } from './HomeTutorialPlutchikWheel3D';
import { HomeTutorialStepPetals3D } from './HomeTutorialStepPetals3D';
import { HomeTutorialVoidCloud } from './HomeTutorialVoidCloud';
import { OrbitingStepLabel, StepGuideParticles } from './HomeTutorialStepGuides';
import type { BasicEmotionId } from '../../data/emotions';

const CAMERA_FOV = 55;
const CAMERA_POS_LERP_SPEED = 3.4;
const LOOK_AT_LERP_SPEED = 3.6;
const ANCHOR_LERP_SPEED = 5.5;

export type HomeLandingIntroPhase = 'pending' | 'moving' | 'done';

interface HomeTutorialCanvasProps {
  activeStepIndex: number;
  landingIntroPhase?: HomeLandingIntroPhase;
  selectedEmotionIds?: readonly BasicEmotionId[];
  selectionLabel?: string;
  /** false で球直下の 3D/Html 感情ラベルを隠す（スマホ STEP3 など） */
  showSelectionLabel?: boolean;
  onEmotionToggle?: (id: BasicEmotionId) => void;
  onActiveSphereScreenPosition?: (point: { x: number; y: number; visible: boolean } | null) => void;
  onStepSelect?: (index: number) => void;
  onReady?: () => void;
}

function SceneReadyNotifier({ onReady }: { onReady?: () => void }) {
  const notified = useRef(false);

  useFrame(() => {
    if (notified.current || !onReady) {
      return;
    }
    notified.current = true;
    onReady();
  });

  return null;
}

function HomeTutorialCamera({
  activeStepIndex,
  landingIntroPhase = 'done',
}: {
  activeStepIndex: number;
  landingIntroPhase?: HomeLandingIntroPhase;
}) {
  const { camera, size } = useThree();
  const targetLookAt = useRef(new THREE.Vector3());
  const smoothLookAt = useRef(new THREE.Vector3());
  const targetCameraPos = useRef(new THREE.Vector3());
  const smoothCameraPos = useRef(new THREE.Vector3());
  const currentAnchor = useRef({ ...HOME_LANDING_INTRO_CENTER_ANCHOR });
  const targetAnchor = useRef({ ...HOME_TUTORIAL_STEPS[0].screenAnchor });
  const introMoveProgress = useRef(0);
  const initialized = useRef(false);

  const resolveScreenAnchor = (stepIndex: number) => {
    const step = HOME_TUTORIAL_STEPS[stepIndex] ?? HOME_TUTORIAL_STEPS[0];
    return getResponsiveScreenAnchor(step.id, size.width, step.screenAnchor);
  };

  const applyPoseTargets = (stepIndex: number, viewportWidth: number) => {
    const step = HOME_TUTORIAL_STEPS[stepIndex] ?? HOME_TUTORIAL_STEPS[0];
    const pose = getHomeTutorialCameraPose(step, viewportWidth);
    const responsiveAnchor = getResponsiveScreenAnchor(step.id, viewportWidth, step.screenAnchor);
    targetLookAt.current.copy(pose.lookAt);
    targetCameraPos.current.copy(pose.position);
    if (stepIndex === 0 && landingIntroPhase !== 'done') {
      targetAnchor.current = landingIntroPhase === 'pending'
        ? HOME_LANDING_INTRO_CENTER_ANCHOR
        : responsiveAnchor;
      return;
    }
    targetAnchor.current = responsiveAnchor;
  };

  useEffect(() => {
    if (landingIntroPhase === 'moving') {
      introMoveProgress.current = 0;
    }
  }, [landingIntroPhase]);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();

    if (!initialized.current) {
      const pose = getHomeTutorialCameraPose(HOME_TUTORIAL_STEPS[0], size.width);
      smoothLookAt.current.copy(pose.lookAt);
      smoothCameraPos.current.copy(pose.position);
      targetLookAt.current.copy(pose.lookAt);
      targetCameraPos.current.copy(pose.position);
      const initialAnchor = landingIntroPhase === 'done'
        ? resolveScreenAnchor(0)
        : HOME_LANDING_INTRO_CENTER_ANCHOR;
      currentAnchor.current = { ...initialAnchor };
      targetAnchor.current = landingIntroPhase === 'pending'
        ? HOME_LANDING_INTRO_CENTER_ANCHOR
        : resolveScreenAnchor(0);
      camera.position.copy(smoothCameraPos.current);
      camera.lookAt(smoothLookAt.current);
      applySelectionViewOffset(camera, size.width, size.height, 1, currentAnchor.current);
      initialized.current = true;
    }

    return () => {
      clearSelectionViewOffset(camera);
    };
  }, [camera, landingIntroPhase, size.width, size.height]);

  useEffect(() => {
    applyPoseTargets(activeStepIndex, size.width);
  }, [activeStepIndex, landingIntroPhase, size.width]);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    const posLerp = 1 - Math.exp(-CAMERA_POS_LERP_SPEED * delta);
    const lookLerp = 1 - Math.exp(-LOOK_AT_LERP_SPEED * delta);
    const anchorLerp = 1 - Math.exp(-ANCHOR_LERP_SPEED * delta);

    smoothCameraPos.current.lerp(targetCameraPos.current, posLerp);
    smoothLookAt.current.lerp(targetLookAt.current, lookLerp);

    if (activeStepIndex === 0 && landingIntroPhase === 'moving') {
      introMoveProgress.current = Math.min(
        1,
        introMoveProgress.current + delta / (HOME_LANDING_INTRO_MOVE_MS / 1000),
      );
      const eased = 1 - (1 - introMoveProgress.current) ** 3;
      const finalAnchor = resolveScreenAnchor(0);
      currentAnchor.current = {
        x: THREE.MathUtils.lerp(HOME_LANDING_INTRO_CENTER_ANCHOR.x, finalAnchor.x, eased),
        y: THREE.MathUtils.lerp(HOME_LANDING_INTRO_CENTER_ANCHOR.y, finalAnchor.y, eased),
      };
    } else {
      currentAnchor.current = {
        x: THREE.MathUtils.lerp(currentAnchor.current.x, targetAnchor.current.x, anchorLerp),
        y: THREE.MathUtils.lerp(currentAnchor.current.y, targetAnchor.current.y, anchorLerp),
      };
    }

    camera.position.copy(smoothCameraPos.current);
    camera.lookAt(smoothLookAt.current);
    applySelectionViewOffset(camera, size.width, size.height, 1, currentAnchor.current);
  });

  return null;
}

function TutorialStepSphere({
  stepIndex,
  activeStepIndex,
  onScreenPosition,
  onStepSelect,
}: {
  stepIndex: number;
  activeStepIndex: number;
  onScreenPosition?: (point: { x: number; y: number; visible: boolean } | null) => void;
  onStepSelect?: (index: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isHovered = useRef(false);
  const hoverBlend = useRef(0);
  const { camera, size } = useThree();
  const projected = useRef(new THREE.Vector3());
  const lastPoint = useRef<{ x: number; y: number; visible: boolean } | null>(null);
  const frameCounter = useRef(0);
  const step = HOME_TUTORIAL_STEPS[stepIndex];
  const worldPosition = step.worldPosition;
  const isActive = stepIndex === activeStepIndex;
  const isClickable = !isActive;
  const inactiveScale = 0.9;

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const hoverTarget = isHovered.current ? 1 : 0;
    hoverBlend.current = THREE.MathUtils.lerp(
      hoverBlend.current,
      hoverTarget,
      1 - Math.exp(-10 * delta),
    );

    const pulse = (Math.sin(state.clock.elapsedTime * (isActive ? 1.25 : 0.9)) + 1) / 2;
    const restedScale = isActive ? HOME_TUTORIAL_ACTIVE_SPHERE_SCALE : inactiveScale;
    const hoveredScale = isActive
      ? HOME_TUTORIAL_ACTIVE_SPHERE_SCALE * HOME_TUTORIAL_ACTIVE_HOVER_SCALE_BOOST
      : HOME_TUTORIAL_HOVER_SPHERE_SCALE;
    const baseScale = THREE.MathUtils.lerp(restedScale, hoveredScale, hoverBlend.current);
    mesh.scale.setScalar(baseScale + pulse * (isActive ? 0.1 : 0.05));

    if (!isActive || !onScreenPosition) {
      return;
    }

    frameCounter.current = (frameCounter.current + 1) % 2;
    if (frameCounter.current !== 0) {
      return;
    }

    projected.current.copy(mesh.position).project(camera);
    const next = {
      x: (projected.current.x * 0.5 + 0.5) * size.width,
      y: (-projected.current.y * 0.5 + 0.5) * size.height,
      visible: projected.current.z >= -1 && projected.current.z <= 1,
    };
    const prev = lastPoint.current;
    const moved =
      !prev || Math.hypot(prev.x - next.x, prev.y - next.y) > 0.75 || prev.visible !== next.visible;

    if (moved) {
      lastPoint.current = next;
      onScreenPosition(next);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={worldPosition}
      onClick={(event) => {
        if (!isClickable || !onStepSelect) {
          return;
        }
        event.stopPropagation();
        onStepSelect(stepIndex);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        isHovered.current = true;
        if (isClickable) {
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        isHovered.current = false;
        document.body.style.cursor = 'auto';
      }}
    >
      <sphereGeometry args={[HOME_TUTORIAL_SPHERE_RADIUS, 16, 16]} />
      <meshStandardMaterial
        color={step.sphereColor}
        emissive={step.sphereColor}
        emissiveIntensity={isActive ? 1.15 : 0.72}
        roughness={0.2}
        metalness={0}
        toneMapped={false}
        transparent={!isActive}
        opacity={isActive ? 1 : 0.9}
      />
    </mesh>
  );
}

export function HomeTutorialCanvas({
  activeStepIndex,
  landingIntroPhase = 'done',
  selectedEmotionIds = [],
  selectionLabel = '紡錘を選ぶ',
  showSelectionLabel = true,
  onEmotionToggle,
  onActiveSphereScreenPosition,
  onStepSelect,
  onReady,
}: HomeTutorialCanvasProps) {
  const initialViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const initialPose = getHomeTutorialCameraPose(HOME_TUTORIAL_STEPS[0], initialViewportWidth);
  const activeStep = HOME_TUTORIAL_STEPS[activeStepIndex] ?? HOME_TUTORIAL_STEPS[0];
  const mainStep = HOME_TUTORIAL_STEPS[0];
  const petalsStepIndex = HOME_TUTORIAL_STEPS.findIndex((step) => step.id === 'emotion-petals');
  const petalsStep = petalsStepIndex >= 0 ? HOME_TUTORIAL_STEPS[petalsStepIndex] : null;
  const isPetalsStepActive = activeStepIndex === petalsStepIndex;
  const showPlutchikWheel = activeStepIndex === 0;
  const nextStep = HOME_TUTORIAL_STEPS[activeStepIndex + 1];
  const previousStep = HOME_TUTORIAL_STEPS[activeStepIndex - 1];

  return (
    <Canvas
      camera={{ position: initialPose.position.toArray(), fov: CAMERA_FOV }}
      dpr={[1, 1.25]}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#030508']} />
      <SceneReadyNotifier onReady={onReady} />
      <ambientLight intensity={0.45} />
      <pointLight position={[2, 3, 4]} intensity={0.9} />
      <HomeTutorialCamera
        activeStepIndex={activeStepIndex}
        landingIntroPhase={landingIntroPhase}
      />
      <HomeTutorialVoidCloud />
      <HomeTutorialPlutchikWheel3D
        center={mainStep.worldPosition}
        visible={showPlutchikWheel}
      />
      {petalsStep && (
        <HomeTutorialStepPetals3D
          center={petalsStep.worldPosition}
          expanded={isPetalsStepActive}
          interactive={isPetalsStepActive}
          selectedIds={isPetalsStepActive ? selectedEmotionIds : []}
          selectionLabel={selectionLabel}
          showSelectionLabel={showSelectionLabel}
          onToggleSelect={onEmotionToggle}
        />
      )}
      {nextStep && (
        <>
          <OrbitingStepLabel
            center={nextStep.worldPosition}
            label="NEXT"
            color={nextStep.sphereColor}
            phaseOffset={0}
          />
          <StepGuideParticles
            source={activeStep.worldPosition}
            target={nextStep.worldPosition}
            color={nextStep.sphereColor}
          />
        </>
      )}
      {previousStep && (
        <>
          <OrbitingStepLabel
            center={previousStep.worldPosition}
            label="PREVIOUS"
            color={previousStep.sphereColor}
            phaseOffset={Math.PI}
          />
          <StepGuideParticles
            source={activeStep.worldPosition}
            target={previousStep.worldPosition}
            color={previousStep.sphereColor}
            phaseOffset={0.5}
          />
        </>
      )}
      {HOME_TUTORIAL_STEPS.map((step, index) => (
        <TutorialStepSphere
          key={step.id}
          stepIndex={index}
          activeStepIndex={activeStepIndex}
          onScreenPosition={index === activeStepIndex ? onActiveSphereScreenPosition : undefined}
          onStepSelect={onStepSelect}
        />
      ))}
    </Canvas>
  );
}
