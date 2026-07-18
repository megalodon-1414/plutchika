import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getConceptTutorialCameraPose } from './camera';
import { OrbitingStepLabel, StepGuideParticles } from './ConceptStepGuides';
import { CONCEPT_TUTORIAL_STEPS } from './constants';

const CAMERA_FOV = 55;
const CAMERA_POS_LERP_SPEED = 3.4;
const LOOK_AT_LERP_SPEED = 3.6;
const SPHERE_RADIUS = 0.12;
const ACTIVE_SCALE = 1.2;
const HOVER_SCALE = 1.1;

function ConceptTutorialCamera({ activeStepIndex }: { activeStepIndex: number }) {
  const { camera, size } = useThree();
  const targetLookAt = useRef(new THREE.Vector3());
  const smoothLookAt = useRef(new THREE.Vector3());
  const targetCameraPos = useRef(new THREE.Vector3());
  const smoothCameraPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();

    const step = CONCEPT_TUTORIAL_STEPS[activeStepIndex] ?? CONCEPT_TUTORIAL_STEPS[0];
    const pose = getConceptTutorialCameraPose(step, size.width);
    smoothLookAt.current.copy(pose.lookAt);
    smoothCameraPos.current.copy(pose.position);
    targetLookAt.current.copy(pose.lookAt);
    targetCameraPos.current.copy(pose.position);
    camera.position.copy(smoothCameraPos.current);
    camera.lookAt(smoothLookAt.current);
  }, [activeStepIndex, camera, size.width]);

  useEffect(() => {
    const step = CONCEPT_TUTORIAL_STEPS[activeStepIndex] ?? CONCEPT_TUTORIAL_STEPS[0];
    const pose = getConceptTutorialCameraPose(step, size.width);
    targetLookAt.current.copy(pose.lookAt);
    targetCameraPos.current.copy(pose.position);
  }, [activeStepIndex, size.width]);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    const posLerp = 1 - Math.exp(-CAMERA_POS_LERP_SPEED * delta);
    const lookLerp = 1 - Math.exp(-LOOK_AT_LERP_SPEED * delta);
    smoothCameraPos.current.lerp(targetCameraPos.current, posLerp);
    smoothLookAt.current.lerp(targetLookAt.current, lookLerp);
    camera.position.copy(smoothCameraPos.current);
    camera.lookAt(smoothLookAt.current);
  });

  return null;
}

function ConceptStepSphere({
  stepIndex,
  activeStepIndex,
  onStepSelect,
}: {
  stepIndex: number;
  activeStepIndex: number;
  onStepSelect?: (index: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const hovered = useRef(false);
  const hoverBlend = useRef(0);
  const step = CONCEPT_TUTORIAL_STEPS[stepIndex];
  const isActive = stepIndex === activeStepIndex;

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const hoverTarget = hovered.current ? 1 : 0;
    hoverBlend.current = THREE.MathUtils.lerp(hoverBlend.current, hoverTarget, 1 - Math.exp(-9 * delta));
    const pulse = (Math.sin(state.clock.elapsedTime * (isActive ? 1.2 : 0.8)) + 1) / 2;
    const baseScale = THREE.MathUtils.lerp(isActive ? ACTIVE_SCALE : 0.92, isActive ? ACTIVE_SCALE * 1.05 : HOVER_SCALE, hoverBlend.current);
    mesh.scale.setScalar(baseScale + pulse * (isActive ? 0.09 : 0.04));
  });

  return (
    <mesh
      ref={meshRef}
      position={step.worldPosition}
      onClick={(event) => {
        event.stopPropagation();
        onStepSelect?.(stepIndex);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hovered.current = false;
        document.body.style.cursor = 'auto';
      }}
    >
      <sphereGeometry args={[SPHERE_RADIUS, 18, 18]} />
      <meshStandardMaterial
        color={step.sphereColor}
        emissive={step.sphereColor}
        emissiveIntensity={isActive ? 1.05 : 0.62}
        roughness={0.2}
        metalness={0}
        toneMapped={false}
        transparent={!isActive}
        opacity={isActive ? 1 : 0.92}
      />
    </mesh>
  );
}

export function ConceptTutorialCanvas({
  activeStepIndex,
  onStepSelect,
}: {
  activeStepIndex: number;
  onStepSelect?: (index: number) => void;
}) {
  const initialViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const initialPose = useMemo(() => getConceptTutorialCameraPose(CONCEPT_TUTORIAL_STEPS[0], initialViewportWidth), []);
  const activeStep = CONCEPT_TUTORIAL_STEPS[activeStepIndex] ?? CONCEPT_TUTORIAL_STEPS[0];
  const nextStep = CONCEPT_TUTORIAL_STEPS[activeStepIndex + 1];
  const previousStep = CONCEPT_TUTORIAL_STEPS[activeStepIndex - 1];

  return (
    <Canvas
      camera={{ position: initialPose.position.toArray(), fov: CAMERA_FOV }}
      dpr={[1, 1.25]}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#04070c']} />
      <ambientLight intensity={0.45} />
      <pointLight position={[2, 3, 4]} intensity={0.9} />
      <ConceptTutorialCamera activeStepIndex={activeStepIndex} />
      {nextStep && (
        <>
          <OrbitingStepLabel center={nextStep.worldPosition} label="NEXT" color={nextStep.sphereColor} phaseOffset={0} />
          <StepGuideParticles source={activeStep.worldPosition} target={nextStep.worldPosition} color={nextStep.sphereColor} />
        </>
      )}
      {previousStep && (
        <>
          <OrbitingStepLabel center={previousStep.worldPosition} label="PREVIOUS" color={previousStep.sphereColor} phaseOffset={Math.PI} />
          <StepGuideParticles source={activeStep.worldPosition} target={previousStep.worldPosition} color={previousStep.sphereColor} phaseOffset={0.5} />
        </>
      )}
      {CONCEPT_TUTORIAL_STEPS.map((step, index) => (
        <ConceptStepSphere key={step.id} stepIndex={index} activeStepIndex={activeStepIndex} onStepSelect={onStepSelect} />
      ))}
    </Canvas>
  );
}
