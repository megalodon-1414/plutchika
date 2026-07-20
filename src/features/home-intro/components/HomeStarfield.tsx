import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const STAR_COUNT = 420;
const SPACE_CLEAR = '#05070f';

/**
 * 決定的疑似乱数（0〜1）。再マウントしても同じ星配置になる。
 */
function seededRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createStarPositions(count: number, seed: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const s = seed + i * 17.13;
    // カメラ前方の直方体ボリュームにランダム配置（遠近で奥行きが感じられる範囲）
    positions[i * 3] = (seededRandom(s) - 0.5) * 48;
    positions[i * 3 + 1] = (seededRandom(s + 1.7) - 0.5) * 32;
    positions[i * 3 + 2] = -2 - seededRandom(s + 3.1) * 55;
  }
  return positions;
}

function StarPoints({
  positions,
  size,
  opacity,
}: {
  positions: Float32Array;
  size: number;
  opacity: number;
}) {
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color="#ffffff"
        transparent
        opacity={opacity}
        depthWrite={false}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}

function StarfieldScene() {
  const groupRef = useRef<THREE.Group>(null);
  const dimStars = useMemo(() => createStarPositions(STAR_COUNT, 0x91a2), []);
  const brightStars = useMemo(() => createStarPositions(70, 0xc4e1), []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.012;
      groupRef.current.rotation.x += delta * 0.004;
    }
  });

  return (
    <group ref={groupRef}>
      <StarPoints positions={dimStars} size={0.045} opacity={0.55} />
      <StarPoints positions={brightStars} size={0.09} opacity={0.95} />
    </group>
  );
}

/**
 * ホーム最奥の3D空間背景。ランダム配置の白い点群を透視投影で描画する。
 * ロゴ／惑星キャンバスは透明なので、このレイヤーが常に背後に見える。
 */
export function HomeStarfield() {
  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 55, near: 0.1, far: 80 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(SPACE_CLEAR, 1);
        scene.background = new THREE.Color(SPACE_CLEAR);
      }}
    >
      <StarfieldScene />
    </Canvas>
  );
}
