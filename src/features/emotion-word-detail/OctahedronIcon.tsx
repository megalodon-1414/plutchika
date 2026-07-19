/**
 * ボタン用の8面体（ダイヤ型）ジェム。ゆっくり回転しながら上下に浮遊する。
 * 選択中は8枚の面が放射状に分離し、中の光るコアが露出する。
 * 面は塗りつぶさず輪郭線のみで構成する（上半分はアクセント色、
 * 下半分はロケットのボディと同じ白 #e9edf3 の線）。
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/** ロケットのボディと同じ白 */
const HULL_COLOR = '#e9edf3';

/** 8面それぞれの頂点符号 (±x, ±y, ±z)。分離方向もこの符号を正規化した向き。 */
const FRAGMENT_SIGNS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
  [-1, 1, 1],
  [-1, 1, -1],
  [-1, -1, 1],
  [-1, -1, -1],
];

/** 分離が最大のときに各面が外へ離れる距離 */
const SPLIT_DISTANCE = 0.55;

/** 面の三角形の輪郭（3辺の閉じたライン）ジオメトリ */
function createFaceOutlineGeometry([sx, sy, sz]: readonly [number, number, number]) {
  const points = [
    new THREE.Vector3(sx, 0, 0),
    new THREE.Vector3(0, sy, 0),
    new THREE.Vector3(0, 0, sz),
    new THREE.Vector3(sx, 0, 0),
  ];
  return new THREE.BufferGeometry().setFromPoints(points);
}

/** 面の三角形（塗り用）ジオメトリ */
function createFaceFillGeometry([sx, sy, sz]: readonly [number, number, number]) {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([sx, 0, 0, 0, sy, 0, 0, 0, sz]);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function SpinningOctahedron({ color, active }: { color: string; active: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const fragmentRefs = useRef<(THREE.Group | null)[]>([]);
  const coreRef = useRef<THREE.Mesh>(null);
  const spinRef = useRef(0);
  const glowRef = useRef(0);
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const outlineGeometries = useMemo(
    () => FRAGMENT_SIGNS.map((signs) => createFaceOutlineGeometry(signs)),
    [],
  );
  const fillGeometries = useMemo(
    () => FRAGMENT_SIGNS.map((signs) => createFaceFillGeometry(signs)),
    [],
  );
  // 輪郭線＋透明度の高い塗り。上半分はアクセント色、下半分はロケットのボディと同じ白
  const accentLineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    [color],
  );
  const hullLineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: HULL_COLOR, transparent: true, opacity: 0.8 }),
    [],
  );
  const accentFillMaterial = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [color],
  );
  const hullFillMaterial = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: HULL_COLOR,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );
  const coreMaterial = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: HULL_COLOR,
        emissive: color,
        emissiveIntensity: 0.4,
      }),
    [color],
  );

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group || reducedMotion) {
      return;
    }
    const t = clock.getElapsedTime();
    // 選択中は8面が分離してコアが露出する。遷移はなめらかに
    glowRef.current = THREE.MathUtils.lerp(glowRef.current, active ? 1 : 0, 1 - Math.exp(-6 * delta));
    const glow = glowRef.current;
    // 通常時は回転せず、選択中だけゆっくり回る（glowの立ち上がりに合わせてなめらかに加減速）
    spinRef.current += delta * 0.8 * glow;
    group.rotation.y = spinRef.current;
    group.position.y = Math.sin(t * 1.5) * 0.07;

    const split = glow * SPLIT_DISTANCE;
    FRAGMENT_SIGNS.forEach(([sx, sy, sz], index) => {
      const fragment = fragmentRefs.current[index];
      if (fragment) {
        const inv = split / Math.sqrt(3);
        fragment.position.set(sx * inv, sy * inv, sz * inv);
      }
    });
    // 選択中は線と塗りを少し明るくする
    accentLineMaterial.opacity = 0.9 + glow * 0.1;
    hullLineMaterial.opacity = 0.8 + glow * 0.2;
    accentFillMaterial.opacity = 0.22 + glow * 0.12;
    hullFillMaterial.opacity = 0.16 + glow * 0.1;
    accentFillMaterial.emissiveIntensity = glow * 0.3;

    const core = coreRef.current;
    if (core) {
      // コアは分離に合わせて姿を現し、強く脈打つように光る
      const pulse = 1 + Math.sin(t * 6) * 0.12 * glow;
      core.scale.setScalar((0.2 + glow * 0.22) * pulse);
      core.rotation.y = -spinRef.current * 1.6;
      coreMaterial.emissiveIntensity = 0.4 + glow * 1.4;
    }
  });

  return (
    // 少し縦長にしてダイヤらしいシルエットにする
    <group ref={groupRef} rotation={[0.16, 0, 0]} scale={[0.82, 1.15, 0.82]}>
      {/* 各面＝輪郭線＋透明度の高い塗り。分離時はグループごと外へ動かす */}
      {FRAGMENT_SIGNS.map((signs, index) => (
        <group
          key={signs.join()}
          ref={(fragment) => {
            fragmentRefs.current[index] = fragment;
          }}
        >
          <mesh
            geometry={fillGeometries[index]}
            material={signs[1] > 0 ? accentFillMaterial : hullFillMaterial}
          />
          {/* eslint-disable-next-line react/no-unknown-property */}
          <line
            // @ts-expect-error R3FのlineはSVGの<line>と名前が衝突するが、three.Lineとして扱われる
            geometry={outlineGeometries[index]}
            material={signs[1] > 0 ? accentLineMaterial : hullLineMaterial}
          />
        </group>
      ))}
      <mesh ref={coreRef} scale={0.2} material={coreMaterial}>
        <octahedronGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

interface OctahedronIconProps {
  color: string;
  /** 表示サイズ(px)。正方形で描画する。 */
  size: number;
  /** 選択中の特別演出（分離してコアが露出）を有効にする。 */
  active?: boolean;
}

export function OctahedronIcon({ color, size, active = false }: OctahedronIconProps) {
  // 分離時に面がキャンバス外へはみ出して見切れないよう、描画領域は一回り大きく取る。
  // ズームはsize基準のままなので見た目の大きさは変わらず、レイアウト上も負マージンでsizeに収める
  const canvasSize = Math.round(size * 1.75);
  const overflowMargin = -(canvasSize - size) / 2;
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: size / 2.7, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{
        width: canvasSize,
        height: canvasSize,
        margin: overflowMargin,
        pointerEvents: 'none',
      }}
    >
      {/* ロケットのキャンバスと同じライティングで質感を揃える */}
      <ambientLight intensity={0.8} />
      <directionalLight position={[0.5, 1, 1]} intensity={1.1} />
      <SpinningOctahedron color={color} active={active} />
    </Canvas>
  );
}
