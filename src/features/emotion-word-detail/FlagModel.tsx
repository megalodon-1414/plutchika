/**
 * 星に立てる旗。3Dデータではなく、立体図形の組み合わせで表現する：
 *   ポール＝細い円柱、先端＝小さな球、布＝頂点を波打たせた平面。
 * 布は感情固有の色（accent）のトゥーンマテリアルで塗り、風になびかせる。
 * 全体は高さ1・中心原点に収める（呼び出し側のサイズ計算・地面クリップと対）。
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/** ポール（円柱）の寸法 */
const POLE_RADIUS = 0.02;
const POLE_HEIGHT = 1;
/** 布（平面）の寸法と取り付け位置 */
const CLOTH_WIDTH = 0.46;
const CLOTH_HEIGHT = 0.312;
const CLOTH_TOP_Y = 0.48;
/** 布のなびき */
const WAVE_AMPLITUDE = 0.035;
const WAVE_SPEED = 3.2;

/** 旗のジオメトリ本体。単体のCanvas（FlagModel）と惑星シーン（PlanetSphere）の両方から使う */
export function FlagShapes({ color, mirrored = false }: { color: string; mirrored?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const clothRef = useRef<THREE.Mesh>(null);
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const clothGeometry = useMemo(
    () => new THREE.PlaneGeometry(CLOTH_WIDTH, CLOTH_HEIGHT, 14, 4),
    [],
  );
  const clothMaterial = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.12,
        side: THREE.DoubleSide,
      }),
    [color],
  );
  const poleMaterial = useMemo(
    () => new THREE.MeshToonMaterial({ color: '#e9edf3' }),
    [],
  );
  const knobMaterial = useMemo(
    () => new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: 0.3 }),
    [color],
  );

  useFrame(({ clock }) => {
    const group = groupRef.current;
    const cloth = clothRef.current;
    if (!group || !cloth || reducedMotion) {
      return;
    }
    const t = clock.getElapsedTime();
    // 風に靡かれているように、ゆったりと大きく角度を変える。
    // 周期の異なる揺れを重ねて、単調な往復に見えないようにする
    group.rotation.y = Math.sin(t * 0.55) * 0.72 + Math.sin(t * 1.3) * 0.14;
    group.rotation.z = Math.sin(t * 0.4 + 1.2) * 0.08;

    // 布はポール側を固定し、自由端ほど大きく波打たせる
    const position = clothGeometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const ratio = (x + CLOTH_WIDTH / 2) / CLOTH_WIDTH; // 0=ポール側, 1=自由端
      position.setZ(
        i,
        Math.sin(ratio * Math.PI * 2 - t * WAVE_SPEED) * WAVE_AMPLITUDE * ratio,
      );
    }
    position.needsUpdate = true;
    clothGeometry.computeVertexNormals();
  });

  return (
    <group ref={groupRef} scale={[mirrored ? -1 : 1, 1, 1]}>
      {/* ポール */}
      <mesh material={poleMaterial}>
        <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 12]} />
      </mesh>
      {/* 先端の飾り球 */}
      <mesh position={[0, POLE_HEIGHT / 2, 0]} material={knobMaterial}>
        <sphereGeometry args={[0.045, 16, 16]} />
      </mesh>
      {/* 布（ポールの右側に取り付け） */}
      <mesh
        ref={clothRef}
        geometry={clothGeometry}
        material={clothMaterial}
        position={[POLE_RADIUS + CLOTH_WIDTH / 2, CLOTH_TOP_Y - CLOTH_HEIGHT / 2, 0]}
      />
    </group>
  );
}

interface FlagModelProps {
  /** 感情固有の色。布と先端の球をこの色ベースで塗る。 */
  color: string;
  /** 表示サイズ(px)。正方形で描画する。 */
  size: number;
  /** 布の向きを左右反転する。 */
  mirrored?: boolean;
}

export function FlagModel({ color, size, mirrored = false }: FlagModelProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: size * 0.92, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ width: size, height: size, pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[0.6, 1, 1]} intensity={1.1} />
      <FlagShapes color={color} mirrored={mirrored} />
    </Canvas>
  );
}
