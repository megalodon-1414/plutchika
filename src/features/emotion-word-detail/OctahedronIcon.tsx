/**
 * ボタン用の8面体（ダイヤ型）ジェム。ゆっくり回転しながら上下に浮遊する。
 */
import { Edges } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

function SpinningOctahedron({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || reducedMotion) {
      return;
    }
    const t = clock.getElapsedTime();
    mesh.rotation.y = t * 0.8;
    mesh.position.y = Math.sin(t * 1.5) * 0.07;
  });

  return (
    // 少し縦長にしてダイヤらしいシルエットにする
    <mesh ref={meshRef} rotation={[0.16, 0, 0]} scale={[0.82, 1.15, 0.82]}>
      <octahedronGeometry args={[1, 0]} />
      <meshToonMaterial color={color} />
      <Edges color="#f4ecf7" transparent opacity={0.55} />
    </mesh>
  );
}

interface OctahedronIconProps {
  color: string;
  /** 表示サイズ(px)。正方形で描画する。 */
  size: number;
}

export function OctahedronIcon({ color, size }: OctahedronIconProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: size / 2.7, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ width: size, height: size, pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[0.6, 1, 1]} intensity={1.1} />
      <SpinningOctahedron color={color} />
    </Canvas>
  );
}
