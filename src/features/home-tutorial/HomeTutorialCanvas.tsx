import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { applySelectionViewOffset, clearSelectionViewOffset } from '../../utils/cameraFocus';
import { getHomeTutorialCameraPose } from './camera';
import {
  HOME_TUTORIAL_ACTIVE_HOVER_SCALE_BOOST,
  HOME_TUTORIAL_ACTIVE_SPHERE_SCALE,
  HOME_TUTORIAL_HOVER_SPHERE_SCALE,
  HOME_TUTORIAL_SPHERE_RADIUS,
  HOME_TUTORIAL_STEPS,
} from './constants';
import { HomeTutorialPlutchikWheel3D } from './HomeTutorialPlutchikWheel3D';
import { HomeTutorialVoidCloud } from './HomeTutorialVoidCloud';
import { OrbitingStepLabel, StepGuideParticles } from './HomeTutorialStepGuides';

const CAMERA_FOV = 55;
const CAMERA_POS_LERP_SPEED = 3.4;
const LOOK_AT_LERP_SPEED = 3.6;
const ANCHOR_LERP_SPEED = 5.5;

interface HomeTutorialCanvasProps {
  activeStepIndex: number;
  onActiveSphereScreenPosition?: (point: { x: number; y: number; visible: boolean } | null) => void;
  onStepSelect?: (index: number) => void;
}

function HomeTutorialCamera({
  activeStepIndex,
}: {
  activeStepIndex: number;
}) {
  const { camera, size } = useThree();
  const targetLookAt = useRef(new THREE.Vector3());
  const smoothLookAt = useRef(new THREE.Vector3());
  const targetCameraPos = useRef(new THREE.Vector3());
  const smoothCameraPos = useRef(new THREE.Vector3());
  const currentAnchor = useRef({ ...HOME_TUTORIAL_STEPS[0].screenAnchor });
  const targetAnchor = useRef({ ...HOME_TUTORIAL_STEPS[0].screenAnchor });
  const initialized = useRef(false);

  const applyPoseTargets = (stepIndex: number) => {
    const step = HOME_TUTORIAL_STEPS[stepIndex] ?? HOME_TUTORIAL_STEPS[0];
    const pose = getHomeTutorialCameraPose(step);
    targetLookAt.current.copy(pose.lookAt);
    targetCameraPos.current.copy(pose.position);
    targetAnchor.current = step.screenAnchor;
  };

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();

    if (!initialized.current) {
      const pose = getHomeTutorialCameraPose(HOME_TUTORIAL_STEPS[0]);
      smoothLookAt.current.copy(pose.lookAt);
      smoothCameraPos.current.copy(pose.position);
      targetLookAt.current.copy(pose.lookAt);
      targetCameraPos.current.copy(pose.position);
      currentAnchor.current = { ...HOME_TUTORIAL_STEPS[0].screenAnchor };
      targetAnchor.current = { ...HOME_TUTORIAL_STEPS[0].screenAnchor };
      camera.position.copy(smoothCameraPos.current);
      camera.lookAt(smoothLookAt.current);
      applySelectionViewOffset(camera, size.width, size.height, 1, currentAnchor.current);
      initialized.current = true;
    }

    return () => {
      clearSelectionViewOffset(camera);
    };
  }, [camera, size.width, size.height]);

  useEffect(() => {
    applyPoseTargets(activeStepIndex);
  }, [activeStepIndex]);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    const posLerp = 1 - Math.exp(-CAMERA_POS_LERP_SPEED * delta);
    const lookLerp = 1 - Math.exp(-LOOK_AT_LERP_SPEED * delta);
    const anchorLerp = 1 - Math.exp(-ANCHOR_LERP_SPEED * delta);

    smoothCameraPos.current.lerp(targetCameraPos.current, posLerp);
    smoothLookAt.current.lerp(targetLookAt.current, lookLerp);
    currentAnchor.current = {
      x: THREE.MathUtils.lerp(currentAnchor.current.x, targetAnchor.current.x, anchorLerp),
      y: THREE.MathUtils.lerp(currentAnchor.current.y, targetAnchor.current.y, anchorLerp),
    };

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
      position={step.worldPosition}
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
  onActiveSphereScreenPosition,
  onStepSelect,
}: HomeTutorialCanvasProps) {
  const initialPose = getHomeTutorialCameraPose(HOME_TUTORIAL_STEPS[0]);
  const activeStep = HOME_TUTORIAL_STEPS[activeStepIndex] ?? HOME_TUTORIAL_STEPS[0];
  const mainStep = HOME_TUTORIAL_STEPS[0];
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
      <ambientLight intensity={0.45} />
      <pointLight position={[2, 3, 4]} intensity={0.9} />
      <HomeTutorialCamera activeStepIndex={activeStepIndex} />
      <HomeTutorialVoidCloud />
      <HomeTutorialPlutchikWheel3D
        center={mainStep.worldPosition}
        visible={showPlutchikWheel}
      />
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
