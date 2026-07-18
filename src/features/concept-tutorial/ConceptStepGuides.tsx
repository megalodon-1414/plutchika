import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export function OrbitingStepLabel({
  center,
  label,
  color,
  phaseOffset = 0,
}: {
  center: readonly [number, number, number];
  label: string;
  color: string;
  phaseOffset?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const radius = 0.38;

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const t = state.clock.elapsedTime * 0.7 + phaseOffset;
    group.position.set(
      center[0] + Math.cos(t) * radius,
      center[1] + Math.sin(t * 0.85) * 0.12,
      center[2] + Math.sin(t) * radius,
    );
  });

  return (
    <group ref={groupRef}>
      <Text
        fontSize={0.11}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#05070c"
        fillOpacity={0.92}
        letterSpacing={0.08}
      >
        {label}
      </Text>
    </group>
  );
}

export function StepGuideParticles({
  source,
  target,
  color,
  phaseOffset = 0,
}: {
  source: readonly [number, number, number];
  target: readonly [number, number, number];
  color: string;
  phaseOffset?: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 18;
  const positions = useMemo(() => new Float32Array(count * 3), []);
  const seeds = useMemo(
    () => Float32Array.from({ length: count }, (_, i) => (i / count + phaseOffset) % 1),
    [phaseOffset],
  );

  useFrame((state) => {
    const points = pointsRef.current;
    if (!points) {
      return;
    }
    const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const u = (seeds[i] + t * 0.22) % 1;
      const wobble = Math.sin(t * 2.1 + i) * 0.03;
      attr.setXYZ(
        i,
        THREE.MathUtils.lerp(source[0], target[0], u) + wobble,
        THREE.MathUtils.lerp(source[1], target[1], u) + Math.sin(u * Math.PI) * 0.08,
        THREE.MathUtils.lerp(source[2], target[2], u) + wobble * 0.6,
      );
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        color={color}
        transparent
        opacity={0.75}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
