import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const VOID_POINT_COUNT = 420;
const VOID_POINT_SIZE = 0.16;
const OPACITY_MIN = 0.18;
const OPACITY_MAX = 0.72;
const DISTANCE_OPACITY_NEAR = 3;
const DISTANCE_OPACITY_FAR = 16;

function seededRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function getDistanceOpacity(distance: number): number {
  const t = THREE.MathUtils.smoothstep(distance, DISTANCE_OPACITY_NEAR, DISTANCE_OPACITY_FAR);
  return THREE.MathUtils.lerp(OPACITY_MIN, OPACITY_MAX, t);
}

const voidPointMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uSize: { value: VOID_POINT_SIZE },
  },
  vertexShader: `
    attribute float aOpacity;
    varying float vOpacity;
    uniform float uSize;

    void main() {
      vOpacity = aOpacity;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = uSize * (300.0 / max(-mvPosition.z, 0.001));
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying float vOpacity;

    void main() {
      vec2 centered = gl_PointCoord - vec2(0.5);
      float dist = length(centered);
      if (dist > 0.5) discard;
      float alpha = smoothstep(0.5, 0.16, dist) * vOpacity;
      gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
    }
  `,
});

export function HomeTutorialVoidCloud() {
  const pointsRef = useRef<THREE.Points>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);

  const { positions, opacities } = useMemo(() => {
    const nextPositions = new Float32Array(VOID_POINT_COUNT * 3);
    const nextOpacities = new Float32Array(VOID_POINT_COUNT);

    for (let i = 0; i < VOID_POINT_COUNT; i += 1) {
      const theta = seededRandom(i * 3.17) * Math.PI * 2;
      const phi = Math.acos(2 * seededRandom(i * 5.91) - 1);
      const radius = 4.5 + seededRandom(i * 7.43) * 14;
      nextPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      nextPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      nextPositions[i * 3 + 2] = radius * Math.cos(phi);
      nextOpacities[i] = OPACITY_MIN;
    }

    return { positions: nextPositions, opacities: nextOpacities };
  }, []);

  useFrame((state) => {
    const geometry = pointsRef.current?.geometry;
    if (!geometry) {
      return;
    }

    const cameraPosition = state.camera.position;

    for (let i = 0; i < VOID_POINT_COUNT; i += 1) {
      const offset = i * 3;
      worldPosition.set(positions[offset], positions[offset + 1], positions[offset + 2]);
      opacities[i] = getDistanceOpacity(cameraPosition.distanceTo(worldPosition));
    }

    geometry.attributes.aOpacity.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false} material={voidPointMaterial}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aOpacity" args={[opacities, 1]} />
      </bufferGeometry>
    </points>
  );
}
