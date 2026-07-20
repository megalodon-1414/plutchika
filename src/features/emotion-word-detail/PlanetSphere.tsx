/**
 * 単語ページの惑星。Moon_2K.obj（public/models/Moon_2K.obj）を読み込み、
 * ホームの PlanetGlobe と同じトゥーンマテリアル＋クレーターテクスチャで表示する。
 * 地平線位置は wordPlanetHorizonRatio() で決め、CSSの --surface-bottom と対になるよう揃える。
 */
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FlagShapes, FLAG_EXPAND_POLE_SCALE } from './FlagModel';

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

/**
 * 画面上端から地平線（惑星の頂点）までの比率。
 * スマホのみ少し上げて星の下側まで見せ、PCは従来どおり（0.8＝画面下20%）。
 * CSS側の --surface-bottom（= 1 - この値）と揃えること。
 */
export function wordPlanetHorizonRatio(viewportWidth: number): number {
  return viewportWidth <= 640 ? 0.72 : 0.8;
}

/** 惑星の半径(px)。ジェムの傾き計算でも使う。 */
export function wordPlanetRadius(viewportWidth: number): number {
  // スマホは画面に占める面積を大きくするため、係数をデスクトップより強める
  if (viewportWidth <= 640) {
    return Math.min(viewportWidth * 1.72, 1100);
  }
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
  const apexY = size.height / 2 - wordPlanetHorizonRatio(size.width) * size.height;
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
  /** 選択中か。布を消しポールを伸ばす */
  selected?: boolean;
  /** 登場を遅らせる秒数（ロード時の旗はジェムのフェードインに合わせる） */
  appearDelaySec?: number;
}

/** 旗の表示サイズ(px)。ポールの高さに相当し、下半分が星にめり込む */
export const FLAG_SIZE_DESKTOP = 152;
export const FLAG_SIZE_MOBILE = 110;
/** 刺した瞬間に地面から生えるアニメーションの長さ(秒) */
const FLAG_GROW_DURATION = 0.45;
/** 選択時にポールが3倍まで伸びる時間(秒) */
export const FLAG_POLE_EXTEND_DURATION = 0.55;
/** ロード時の旗：ジェム（uiReveal）と同じく着陸後に出す遅延（秒） */
export const FLAG_LOAD_APPEAR_DELAY_SEC = 3.3 + 0.6;

/** 星の表面に刺さった1本の旗。出現時は地面から生える。
 *  選択時は布を消し、画面に対してまっすぐなままポールを3倍まで伸ばす */
function SurfaceFlag({
  accent,
  flag,
  sizePx,
  groupRotationZRef,
}: {
  accent: string;
  flag: PlanetFlagInfo;
  sizePx: number;
  /** SurfaceFlags グループの現在の rotation.z（画面垂直化に使う） */
  groupRotationZRef: MutableRefObject<number>;
}) {
  const growRef = useRef<THREE.Group>(null);
  const orientRef = useRef<THREE.Group>(null);
  const bornAtRef = useRef<number | null>(null);
  const expandAtRef = useRef<number | null>(null);
  const wasSelectedRef = useRef(false);
  const poleScaleRef = useRef(1);
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [poleScale, setPoleScale] = useState(1);

  useFrame(({ clock }, delta) => {
    const grow = growRef.current;
    const orient = orientRef.current;
    if (!grow) {
      return;
    }
    const t = clock.getElapsedTime();
    const appearDelay = flag.appearDelaySec ?? 0;

    // 登場時のスケール（ロード旗はジェムと同じ遅延のあとで生やす）
    if (reducedMotion) {
      grow.scale.setScalar(t >= appearDelay ? sizePx : 0.001);
    } else if (t < appearDelay) {
      grow.scale.setScalar(0.001);
      bornAtRef.current = null;
    } else {
      if (bornAtRef.current === null) {
        bornAtRef.current = t;
      }
      const progress = Math.min(1, (t - bornAtRef.current) / FLAG_GROW_DURATION);
      const eased = 1 + (progress - 1) ** 3;
      grow.scale.setScalar(sizePx * Math.max(0.001, eased));
    }

    // 選択開始／終了のタイミングを記録。開始時は即座に画面垂直へスナップしてから伸ばす
    if (flag.selected && !wasSelectedRef.current) {
      expandAtRef.current = t;
      wasSelectedRef.current = true;
      if (orient) {
        orient.rotation.z = -groupRotationZRef.current;
      }
    } else if (!flag.selected && wasSelectedRef.current) {
      expandAtRef.current = t;
      wasSelectedRef.current = false;
    }

    // ポール伸長（根元固定で1→3）。閉じるときは3→1
    let nextPole = 1;
    if (reducedMotion) {
      nextPole = flag.selected ? FLAG_EXPAND_POLE_SCALE : 1;
    } else if (expandAtRef.current !== null) {
      const p = Math.min(1, (t - expandAtRef.current) / FLAG_POLE_EXTEND_DURATION);
      const eased = 1 - (1 - p) ** 3;
      if (flag.selected) {
        nextPole = 1 + (FLAG_EXPAND_POLE_SCALE - 1) * eased;
      } else {
        nextPole = FLAG_EXPAND_POLE_SCALE + (1 - FLAG_EXPAND_POLE_SCALE) * eased;
      }
    } else if (flag.selected) {
      nextPole = FLAG_EXPAND_POLE_SCALE;
    }
    if (Math.abs(nextPole - poleScaleRef.current) > 0.002) {
      poleScaleRef.current = nextPole;
      setPoleScale(nextPole);
    }

    // 画面に対してポールをまっすぐ立てる。
    // 非選択時は地表の法線方向（-angleRad）。
    // 選択時はグループ回転だけ打ち消し、ワールド回転.z = 0（画面垂直）にする。
    // ※ -angleRad - groupZ だと二重打ち消しになり斜めに伸びてしまう
    if (orient) {
      const targetZ = flag.selected
        ? -groupRotationZRef.current
        : -flag.angleRad;
      if (reducedMotion || flag.selected) {
        // 選択中は伸び始める前に垂直へスナップ／強く追従させる
        const k = reducedMotion ? 1 : 1 - Math.exp(-18 * delta);
        orient.rotation.z = THREE.MathUtils.lerp(orient.rotation.z, targetZ, k);
      } else {
        const k = 1 - Math.exp(-10 * delta);
        orient.rotation.z = THREE.MathUtils.lerp(orient.rotation.z, targetZ, k);
      }
    }
  });

  return (
    <group
      position={[
        Math.sin(flag.angleRad) * flag.radiusPx,
        Math.cos(flag.angleRad) * flag.radiusPx,
        0,
      ]}
    >
      <group ref={orientRef} rotation={[0, 0, -flag.angleRad]}>
        <group ref={growRef} scale={sizePx}>
          <FlagShapes
            color={accent}
            clothOpacity={flag.selected || poleScale > 1.08 ? 0 : 1}
            poleScale={poleScale}
            still={Boolean(flag.selected) || poleScale > 1.05}
          />
        </group>
      </group>
    </group>
  );
}

/** 星に刺さった旗のグループ。星の面内回転（rotation.z）と奥行き回転（rotation.x）に
 *  一緒に乗り、ジェム選択時は月面と共に奥へ遠ざかる。
 *  同じグループ内に深度専用の球を置き、ポールのめり込み分を星の手前に出さない */
function SurfaceFlags({
  accent,
  flags,
  rotationRad,
  pitchRad,
  centerY,
  occludeWithDepth = false,
}: {
  accent: string;
  flags: PlanetFlagInfo[];
  rotationRad: number;
  pitchRad: number;
  centerY: number;
  /** 旗専用レイヤー用。色なしの球で深度だけ書き、めり込んだポールを隠す */
  occludeWithDepth?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const rotationZRef = useRef(0);
  const { size } = useThree();
  const flagSizePx = size.width <= 640 ? FLAG_SIZE_MOBILE : FLAG_SIZE_DESKTOP;
  const radius = wordPlanetRadius(size.width);
  const depthMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: true,
        depthTest: true,
      }),
    [],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const t = 1 - Math.exp(-ROTATION_LERP_SPEED * delta);
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, rotationRad, t);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, pitchRad, t);
    rotationZRef.current = group.rotation.z;
  });

  return (
    <group ref={groupRef} position={[0, centerY, 0]}>
      {occludeWithDepth && (
        <mesh
          renderOrder={-1000}
          scale={radius}
          material={depthMaterial}
          frustumCulled={false}
        >
          {/* 旗の配置半径と一致する球。OBJ月より幾何がずれない */}
          <sphereGeometry args={[1, 64, 48]} />
        </mesh>
      )}
      {flags.map((flag) => (
        <group key={flag.id} renderOrder={1}>
          <SurfaceFlag
            accent={accent}
            flag={flag}
            sizePx={flagSizePx}
            groupRotationZRef={rotationZRef}
          />
        </group>
      ))}
    </group>
  );
}

/** 旗の配置基準になる惑星中心のY座標(px)。MoonMeshと同じ計算 */
function usePlanetCenterY(): number {
  const { size } = useThree();
  const radius = wordPlanetRadius(size.width);
  const apexY = size.height / 2 - wordPlanetHorizonRatio(size.width) * size.height;
  return apexY - radius;
}

function PlanetScene({
  accent,
  rotationRad,
  pitchRad,
}: Required<Omit<PlanetSphereProps, 'flags'>>) {
  return (
    <Suspense fallback={null}>
      <MoonMesh accent={accent} rotationRad={rotationRad} pitchRad={pitchRad} />
    </Suspense>
  );
}

function FlagsScene({
  accent,
  rotationRad,
  pitchRad,
  flags,
}: Required<Omit<PlanetSphereProps, 'flags'>> & { flags: PlanetFlagInfo[] }) {
  const centerY = usePlanetCenterY();
  return (
    <SurfaceFlags
      accent={accent}
      flags={flags}
      rotationRad={rotationRad}
      pitchRad={pitchRad}
      centerY={centerY}
      occludeWithDepth
    />
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
}: Omit<PlanetSphereProps, 'flags'>) {
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
      />
    </Canvas>
  );
}

/** 旗専用レイヤー。ロケット(z=3)より手前・人物(z=5)より奥(z=4)に描く。
 *  星の回転で旗が人の位置を通るときは人が手前に見える。
 *  めり込んだポールと星の裏へ回った旗は、同グループの深度球で隠す */
export function PlantedFlagsLayer({
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
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[0.4, 1, 1]} intensity={1} />
      <FlagsScene
        accent={accent}
        rotationRad={rotationRad}
        pitchRad={pitchRad}
        flags={flags}
      />
    </Canvas>
  );
}
