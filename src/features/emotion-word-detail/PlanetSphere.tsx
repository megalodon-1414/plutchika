/**
 * 単語ページの惑星。Moon_2K.obj（public/models/Moon_2K.obj）を読み込み、
 * ホームの PlanetGlobe と同じトゥーンマテリアル＋クレーターテクスチャで表示する。
 * 地平線が画面上端から80%（CSSの --surface-bottom: 20% と対）に来るよう配置する。
 */
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FlagShapes } from './FlagModel';

const MOON_OBJ_URL = '/models/Moon_2K.obj';

/** 回転の追従速度（ホームのPlanetGlobeと同じ手触り） */
const ROTATION_LERP_SPEED = 4;

const CRATER_COUNT = 46;

/** 感情固有の色（accent）から、淡い地表色と暗いクレーター色を作る */
function planetPalette(accent: string): { base: string; crater: string } {
  const base = new THREE.Color(accent).lerp(new THREE.Color('#e6e9f7'), 0.62);
  const crater = new THREE.Color(accent).lerp(new THREE.Color('#20244c'), 0.66);
  return { base: `#${base.getHexString()}`, crater: `#${crater.getHexString()}` };
}

/** 画面上端から地平線（惑星の頂点）までの比率。CSS側の --surface-bottom と揃えること。 */
export const WORD_PLANET_HORIZON_RATIO = 0.8;

/** 惑星の半径(px)。ジェムの傾き計算でも使う。 */
export function wordPlanetRadius(viewportWidth: number): number {
  return Math.min(viewportWidth * 1.24, 1800);
}

function createPlanetTexture(accent: string): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const palette = planetPalette(accent);
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.4;
  ctx.fillStyle = palette.crater;
  for (let i = 0; i < CRATER_COUNT; i += 1) {
    const x = (i * 97 + 31) % width;
    const y = 30 + ((i * 53 + 17) % (height - 60));
    const radius = 8 + ((i * 31) % 22);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface PlanetMeshProps {
  /** 感情固有の色。地表とクレーターの色をこの色から作る。 */
  accent: string;
  /** 画面面内での目標回転角（ラジアン）。正で反時計回り。 */
  rotationRad: number;
  /** 手前奥方向（X軸まわり）の目標回転角（ラジアン）。負で手前の面がせり上がる。 */
  pitchRad: number;
}

function MoonMesh({ accent, rotationRad, pitchRad }: PlanetMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { size } = useThree();
  const texture = useMemo(() => createPlanetTexture(accent), [accent]);
  const obj = useLoader(OBJLoader, MOON_OBJ_URL);

  // モデルを中心合わせし、半径1に正規化しておく（表示半径はscaleで与える）
  const model = useMemo(() => {
    const clone = obj.clone(true);
    const material = new THREE.MeshToonMaterial({ map: texture });
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
      }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3());
    const modelRadius = Math.max(extent.x, extent.y, extent.z) / 2 || 1;
    clone.position.set(-center.x / modelRadius, -center.y / modelRadius, -center.z / modelRadius);
    clone.scale.setScalar(1 / modelRadius);
    return clone;
  }, [obj, texture]);

  const radius = wordPlanetRadius(size.width);
  const apexY = size.height / 2 - WORD_PLANET_HORIZON_RATIO * size.height;
  const centerY = apexY - radius;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const t = 1 - Math.exp(-ROTATION_LERP_SPEED * delta);
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, rotationRad, t);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, pitchRad, t);
  });

  return (
    <group ref={groupRef} position={[0, centerY, 0]} scale={radius}>
      <primitive object={model} />
    </group>
  );
}

/** 星に刺さっている旗。惑星中心まわりの極座標（角度と中心からの距離px）で表す */
export interface PlanetFlagInfo {
  id: string;
  /** 頂点（星の真上）から時計回り正の角度（ラジアン） */
  angleRad: number;
  /** 惑星中心から旗の根元までの距離(px) */
  radiusPx: number;
}

/** 旗の表示サイズ(px)。ポールの高さに相当し、下半分が星にめり込む */
const FLAG_SIZE_PX = 152;
/** 刺した瞬間に地面から生えるアニメーションの長さ(秒) */
const FLAG_GROW_DURATION = 0.45;

/** 星の表面に刺さった1本の旗。出現時は地面から生える */
function SurfaceFlag({ accent, flag }: { accent: string; flag: PlanetFlagInfo }) {
  const growRef = useRef<THREE.Group>(null);
  const bornAtRef = useRef<number | null>(null);
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useFrame(({ clock }) => {
    const group = growRef.current;
    if (!group) {
      return;
    }
    if (reducedMotion) {
      group.scale.setScalar(FLAG_SIZE_PX);
      return;
    }
    const t = clock.getElapsedTime();
    if (bornAtRef.current === null) {
      bornAtRef.current = t;
    }
    const progress = Math.min(1, (t - bornAtRef.current) / FLAG_GROW_DURATION);
    const eased = 1 + (progress - 1) ** 3; // easeOutCubic
    group.scale.setScalar(FLAG_SIZE_PX * Math.max(0.001, eased));
  });

  return (
    <group
      position={[
        Math.sin(flag.angleRad) * flag.radiusPx,
        Math.cos(flag.angleRad) * flag.radiusPx,
        0,
      ]}
      /* 画面上で時計回りの傾き＝Three.jsではrotation.zの負方向 */
      rotation={[0, 0, -flag.angleRad]}
    >
      <group ref={growRef} scale={FLAG_SIZE_PX}>
        <FlagShapes color={accent} />
      </group>
    </group>
  );
}

/** 星に刺さった旗のグループ。星の面内回転（rotation.z）に一緒に乗って回る。
    ピッチ（rotation.x）は球のシルエットを変えないため適用せず、
    DOM側のクリック領域・吹き出しと画面位置を揃える */
function SurfaceFlags({
  accent,
  flags,
  rotationRad,
  centerY,
}: {
  accent: string;
  flags: PlanetFlagInfo[];
  rotationRad: number;
  centerY: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const t = 1 - Math.exp(-ROTATION_LERP_SPEED * delta);
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, rotationRad, t);
  });

  return (
    <group ref={groupRef} position={[0, centerY, 0]}>
      {flags.map((flag) => (
        <SurfaceFlag key={flag.id} accent={accent} flag={flag} />
      ))}
    </group>
  );
}

/** 旗の配置基準になる惑星中心のY座標(px)。MoonMeshと同じ計算 */
function usePlanetCenterY(): number {
  const { size } = useThree();
  const radius = wordPlanetRadius(size.width);
  const apexY = size.height / 2 - WORD_PLANET_HORIZON_RATIO * size.height;
  return apexY - radius;
}

function PlanetScene({
  accent,
  rotationRad,
  pitchRad,
  flags,
}: Required<Omit<PlanetSphereProps, 'flags'>> & { flags: PlanetFlagInfo[] }) {
  const centerY = usePlanetCenterY();
  return (
    <>
      <Suspense fallback={null}>
        <MoonMesh accent={accent} rotationRad={rotationRad} pitchRad={pitchRad} />
      </Suspense>
      <SurfaceFlags
        accent={accent}
        flags={flags}
        rotationRad={rotationRad}
        centerY={centerY}
      />
    </>
  );
}

interface PlanetSphereProps {
  /** 感情固有の色。地表とクレーターの色をこの色から作る。 */
  accent?: string;
  /** 画面面内での回転角（ラジアン）。ジェムのフォーカスに合わせて球体を転がす。 */
  rotationRad?: number;
  /** 手前奥方向の回転角（ラジアン）。負で手前の面がせり上がる。 */
  pitchRad?: number;
  /** 星に刺さっている旗の一覧 */
  flags?: PlanetFlagInfo[];
}

export function PlanetSphere({
  accent = '#8b9dc1',
  rotationRad = 0,
  pitchRad = 0,
  flags = [],
}: PlanetSphereProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 2000], near: 1, far: 10000, zoom: 1 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 1.5]}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[0.4, 1, 1]} intensity={1} />
      <PlanetScene
        accent={accent}
        rotationRad={rotationRad}
        pitchRad={pitchRad}
        flags={flags}
      />
    </Canvas>
  );
}
