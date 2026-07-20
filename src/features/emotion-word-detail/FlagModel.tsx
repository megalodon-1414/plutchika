/**
 * 星に立てる旗。3Dデータではなく、立体図形の組み合わせで表現する：
 *   ポール＝細い円柱、先端＝小さな球、布＝頂点を波打たせた平面。
 * 布は感情固有の色（accent）のトゥーンマテリアルで塗り、風になびかせる。
 * 全体は高さ1・中心原点に収める（呼び出し側のサイズ計算・地面クリップと対）。
 * 選択時は布を消し、ポールを根元固定のまま上へ伸ばす。
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
/** 選択時のポール伸長倍率 */
export const FLAG_EXPAND_POLE_SCALE = 3;

interface FlagShapesProps {
  color: string;
  mirrored?: boolean;
  /** 布の不透明度（0=非表示、1=表示）。変化時は内部でフェードする */
  clothOpacity?: number;
  /** ポールの縦方向スケール。1=通常、3=選択時の伸びきり。根元は動かさない */
  poleScale?: number;
  /** 風になびく揺れを止める */
  still?: boolean;
}

/** 旗のジオメトリ本体。単体のCanvas（FlagModel）と惑星シーン（PlanetSphere）の両方から使う */
export function FlagShapes({
  color,
  mirrored = false,
  clothOpacity = 1,
  poleScale = 1,
  still = false,
}: FlagShapesProps) {
  const groupRef = useRef<THREE.Group>(null);
  const clothRef = useRef<THREE.Mesh>(null);
  const clothOpacityRef = useRef(clothOpacity);
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
        transparent: true,
        opacity: clothOpacity,
        depthWrite: clothOpacity > 0.95,
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

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    const cloth = clothRef.current;

    // 布のフェード（縮み終わりの再表示は少しゆっくり、選択時の消去は速く）
    const fadeSpeed = clothOpacity > clothOpacityRef.current ? 5.5 : 16;
    const nextOpacity = reducedMotion
      ? clothOpacity
      : THREE.MathUtils.damp(clothOpacityRef.current, clothOpacity, fadeSpeed, delta);
    clothOpacityRef.current = nextOpacity;
    clothMaterial.opacity = nextOpacity;
    clothMaterial.depthWrite = nextOpacity > 0.95;
    clothMaterial.visible = nextOpacity > 0.01;

    if (!group || reducedMotion || still) {
      if (group && still) {
        group.rotation.y = 0;
        group.rotation.z = 0;
      }
      return;
    }
    const t = clock.getElapsedTime();
    // 風に靡かれているように、ゆったりと大きく角度を変える。
    // 周期の異なる揺れを重ねて、単調な往復に見えないようにする
    group.rotation.y = Math.sin(t * 0.55) * 0.72 + Math.sin(t * 1.3) * 0.14;
    group.rotation.z = Math.sin(t * 0.4 + 1.2) * 0.08;

    if (!cloth || nextOpacity < 0.05) {
      return;
    }
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

  // 根元（y=-0.5）を固定したまま上へ伸ばす
  const poleOffsetY = (poleScale - 1) * (POLE_HEIGHT / 2);

  return (
    <group ref={groupRef} scale={[mirrored ? -1 : 1, 1, 1]}>
      {/* ポール */}
      <mesh
        material={poleMaterial}
        scale={[1, poleScale, 1]}
        position={[0, poleOffsetY, 0]}
      >
        <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 12]} />
      </mesh>
      {/* 先端の飾り球 */}
      <mesh position={[0, -POLE_HEIGHT / 2 + poleScale, 0]} material={knobMaterial}>
        <sphereGeometry args={[0.045, 16, 16]} />
      </mesh>
      {/* 布（ポールの右側）。opacity でフェードイン／アウト */}
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
