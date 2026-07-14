import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { HOME_TUTORIAL_SPHERE_RADIUS } from './constants';

const ORBIT_RADIUS = HOME_TUTORIAL_SPHERE_RADIUS * 2.55;
const ORBIT_SPEED = 0.85;
const LABEL_FONT_SIZE = 0.076;
const RING_LINE_WIDTH = 0.0022;

interface OrbitingStepLabelProps {
  center: [number, number, number];
  label: string;
  color: string;
  phaseOffset?: number;
}

export function OrbitingStepLabel({
  center,
  label,
  color,
  phaseOffset = 0,
}: OrbitingStepLabelProps) {
  const ringPlaneRef = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const ringColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame((state) => {
    const ringPlane = ringPlaneRef.current;
    const labelGroup = labelRef.current;
    if (!ringPlane || !labelGroup) {
      return;
    }

    ringPlane.lookAt(camera.position);

    const angle = state.clock.elapsedTime * ORBIT_SPEED + phaseOffset;
    labelGroup.position.set(
      Math.cos(angle) * ORBIT_RADIUS,
      Math.sin(angle) * ORBIT_RADIUS,
      0,
    );
    // 文字の下側が中心を向く（円の内側へ）
    labelGroup.rotation.z = angle - Math.PI / 2;
  });

  return (
    <group position={center} raycast={() => null}>
      <group ref={ringPlaneRef}>
        <mesh renderOrder={1}>
          <ringGeometry args={[ORBIT_RADIUS - RING_LINE_WIDTH, ORBIT_RADIUS + RING_LINE_WIDTH, 96]} />
          <meshBasicMaterial
            color={ringColor}
            transparent
            opacity={0.22}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <group ref={labelRef}>
          <Text
            fontSize={LABEL_FONT_SIZE}
            color={color}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.06}
            outlineWidth={0.005}
            outlineColor="#050508"
            fillOpacity={0.92}
          >
            {label}
          </Text>
        </group>
      </group>
    </group>
  );
}

interface StepGuideParticlesProps {
  source: [number, number, number];
  target: [number, number, number];
  color: string;
  phaseOffset?: number;
}

const PARTICLE_COUNT = 16;
const PARTICLE_SPEED = 0.24;
const PARTICLE_SIZE = 0.011;

export function StepGuideParticles({
  source,
  target,
  color,
  phaseOffset = 0,
}: StepGuideParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const start = useMemo(() => new THREE.Vector3(...source), [source]);
  const end = useMemo(() => new THREE.Vector3(...target), [target]);
  const temp = useRef(new THREE.Vector3());
  const spread = useRef(new THREE.Vector3());
  const baseColor = useMemo(() => new THREE.Color(color), [color]);
  const spreadDirections = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const angle = index * 2.399963229728653;
        const y = 1 - (index / Math.max(1, PARTICLE_COUNT - 1)) * 2;
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      }),
    [],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const progress = (state.clock.elapsedTime * PARTICLE_SPEED + i / PARTICLE_COUNT + phaseOffset) % 1;
      const eased = progress * progress * (3 - 2 * progress);
      temp.current.copy(start).lerp(end, eased);

      const convergence = Math.pow(1 - progress, 2.4);
      spread.current.copy(spreadDirections[i]).multiplyScalar(0.07 * convergence);
      temp.current.add(spread.current);

      const pulse = Math.sin(progress * Math.PI);
      dummy.position.copy(temp.current);
      dummy.scale.setScalar(PARTICLE_SIZE * (0.35 + pulse * 0.65));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        color={baseColor}
        transparent
        opacity={0.62}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
