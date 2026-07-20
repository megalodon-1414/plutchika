/**
 * rocket.obj（public/models/rocket.obj）を読み込んで表示する3Dロケット。
 * mtlファイルが無いため、OBJ内のマテリアル名を手掛かりに色を割り当てる。
 *
 * 登場演出も3D空間内で行う：
 *   フェーズA: カメラの目の前に機体の底（ノズル）をカメラへ向けて巨大に現れる
 *   フェーズB: 奥へ飛び去りながら機体を起こし、着陸地点の上空でホバリング位置へ
 *   フェーズC: 減速しながら垂直降下して接地
 * 離陸（Mapに戻る）はホーム導入の搭乗ロケットに合わせる：
 *   上昇 → 画面外で機首転換 → カメラへ突っ込んで画面を埋める
 * 炎は機体に追従する3Dのコーンで表現する。砂埃・接地影はCSS側が担当。
 */
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { wordPlanetRadius } from './PlanetSphere';

const ROCKET_OBJ_URL = '/models/rocket.obj';

/** 着陸シーケンス全体の秒数。CSS側の --landing-time と一致させること。 */
const LANDING_TIME = 3.3;

/** 離陸①：垂直上昇して画面外へ消えるまでの時間 */
const TAKEOFF_ASCEND_S = 0.9;
/** 離陸：炎が出るまでの点火の溜め */
const TAKEOFF_FLAME_DELAY_S = 0.2;
/** 離陸②：画面外で向きを変える間 */
const TAKEOFF_TURN_PAUSE_S = 0.2;
/** 離陸③：機首をこちらへ向けてカメラへ突っ込む時間 */
const TAKEOFF_DIVE_S = 0.7;

/** 呼び出し側が /telescope へ遷移するタイマーに使う長さ（ms）。 */
export const ROCKET_TAKEOFF_TOTAL_MS =
  (TAKEOFF_ASCEND_S + TAKEOFF_TURN_PAUSE_S + TAKEOFF_DIVE_S) * 1000;

const CAMERA_FOV = 42;
const CAMERA_DIST = 24;

/** 着陸時の機体の向き（Y軸まわりのヨー角） */
const LANDED_YAW = Math.PI / 8 + THREE.MathUtils.degToRad(-20);

/** マテリアル名 → 表示色。"red" のパーツはテーマのアクセント色で塗る。 */
function materialColor(name: string, accent: string): string {
  if (name.toLowerCase().includes('red')) {
    return accent;
  }
  return '#e9edf3';
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInCubic(t: number): number {
  return t ** 3;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** 離陸用。最初はほとんど動かず、後半で爆発的に加速する強いイーズイン。 */
function easeInQuint(t: number): number {
  return t ** 5;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

interface RocketSceneProps {
  accent: string;
  /** 着陸時の見た目の高さ(px)。 */
  heightPx: number;
  /** 接地点（足元）の画面下端からの位置(px)。 */
  feetBottomPx: number;
  /** 星（球体）の回転に乗るときの目標角。画面上で時計回り正（ラジアン）。 */
  surfaceAngleRad: number;
  /** 星の奥方向（X軸まわり）への目標回転角（ラジアン）。負で星の裏側へ回り込む。 */
  surfacePitchRad: number;
  /** true のとき離陸シーケンスを再生する */
  takingOff: boolean;
  reducedMotion: boolean;
}

function RocketScene({
  accent,
  heightPx,
  feetBottomPx,
  surfaceAngleRad,
  surfacePitchRad,
  takingOff,
  reducedMotion,
}: RocketSceneProps) {
  const obj = useLoader(OBJLoader, ROCKET_OBJ_URL);
  const { size } = useThree();

  const pivotRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.Group>(null);
  /** 球体ライドの現在角（なめらかに目標へ追従させる） */
  const rideAngleRef = useRef(0);
  const ridePitchRef = useRef(0);
  /** 離陸開始時刻（clock）。null なら未開始 */
  const takeoffStartedAtRef = useRef<number | null>(null);

  const model = useMemo(() => {
    const clone = obj.clone(true);

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const replaced = materials.map(
        (material) =>
          new THREE.MeshToonMaterial({
            color: materialColor(material?.name ?? '', accent),
          }),
      );
      child.material = Array.isArray(child.material) ? replaced : replaced[0];
    });

    // 高さ1・中心を原点に正規化（回転の軸を機体中心にするため）
    const box = new THREE.Box3().setFromObject(clone);
    const sizeVec = box.getSize(new THREE.Vector3());
    const scale = 1 / sizeVec.y;
    clone.scale.setScalar(scale);
    box.setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, -center.y, -center.z);

    return clone;
  }, [obj, accent]);

  // z=0 平面での 1px あたりのワールド長。着陸時のサイズ・位置合わせに使う
  const unitsPerPixel =
    (2 * CAMERA_DIST * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2))) / size.height;

  const worldHeight = heightPx * unitsPerPixel;
  /** 接地時の機体中心のy座標 */
  const landedY = (feetBottomPx - size.height / 2) * unitsPerPixel + worldHeight / 2;
  /** ホバリング開始位置（旧演出の -32vh 相当） */
  const hoverY = landedY + size.height * 0.32 * unitsPerPixel;

  /** 指定した奥行きzでの、画面比率→ワールド座標の係数（遠近で視界が広がる分の補正） */
  const frustumScale = (z: number) => (CAMERA_DIST - z) / CAMERA_DIST;

  useFrame(({ clock }, frameDelta) => {
    const pivot = pivotRef.current;
    const spin = spinRef.current;
    const flame = flameRef.current;
    if (!pivot || !spin) {
      return;
    }

    // 星の回転への追従（PlanetSphereのlerp速度4と同じ手触り）
    const followT = 1 - Math.exp(-4 * frameDelta);
    rideAngleRef.current = THREE.MathUtils.lerp(rideAngleRef.current, surfaceAngleRad, followT);
    ridePitchRef.current = THREE.MathUtils.lerp(ridePitchRef.current, surfacePitchRad, followT);

    /** 着陸姿勢を、惑星中心まわりに面内角aと奥行き角pitchだけ回した位置・傾きにする */
    const applyLandedPose = () => {
      const a = rideAngleRef.current;
      const pitch = ridePitchRef.current;
      const planetR = wordPlanetRadius(size.width) * unitsPerPixel;
      const feetY = landedY - worldHeight / 2;
      const planetCenterY = feetY - planetR;
      const standAxisR = planetR + worldHeight / 2; // 惑星中心から機体中心まで
      // 半径方向の単位ベクトル：面内回転aのあと、X軸まわりにpitch回す
      const ux = Math.sin(a);
      const uy = Math.cos(a) * Math.cos(pitch);
      const uz = Math.cos(a) * Math.sin(pitch);
      pivot.position.set(
        standAxisR * ux,
        planetCenterY + standAxisR * uy,
        standAxisR * uz,
      );
      // 機体の上方向を半径方向に合わせる（Rx(pitch)·Rz(-a)、時計回りはz負方向）
      pivot.rotation.set(pitch, 0, -a);
    };

    const setFlame = (opacity: number, stretch: number) => {
      if (!flame) return;
      flame.scale.set(1, Math.max(stretch, 0.001), 1);
      flame.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.Material & { opacity: number }).opacity = opacity;
        }
      });
    };

    if (takingOff) {
      if (takeoffStartedAtRef.current === null) {
        takeoffStartedAtRef.current = clock.getElapsedTime();
      }
      const elapsed = clock.getElapsedTime() - takeoffStartedAtRef.current;
      spin.rotation.y = LANDED_YAW;

      if (reducedMotion) {
        pivot.scale.setScalar(worldHeight * 8);
        pivot.position.set(0, 0, CAMERA_DIST - worldHeight * 4);
        pivot.rotation.set(-Math.PI / 2, 0, 0);
        setFlame(0, 0);
        return;
      }

      const ascendEnd = TAKEOFF_ASCEND_S;
      const turnEnd = ascendEnd + TAKEOFF_TURN_PAUSE_S;

      if (elapsed < ascendEnd) {
        // 発射①：ふわっと浮いたあと爆発的に加速しながら画面上方へ
        const t = easeInQuint(clamp01(elapsed / TAKEOFF_ASCEND_S));
        pivot.scale.setScalar(worldHeight);
        pivot.position.set(0, landedY + size.height * 1.6 * unitsPerPixel * t, 0);
        pivot.rotation.set(0, 0, 0);
        const flameOn = elapsed >= TAKEOFF_FLAME_DELAY_S;
        setFlame(flameOn ? 0.75 : 0, flameOn ? 1.35 : 0);
        return;
      }

      if (elapsed < turnEnd) {
        // 発射②：画面外で機首をカメラへ向ける（見えない）
        pivot.scale.setScalar(worldHeight * 0.001);
        pivot.position.set(0, size.height * 0.2 * unitsPerPixel, 0);
        pivot.rotation.set(-Math.PI / 2, 0, 0);
        setFlame(0, 0);
        return;
      }

      // 発射③：機首をこちらへ向け、遠くから一気に近づいて画面を埋める
      const diveT = clamp01((elapsed - turnEnd) / TAKEOFF_DIVE_S);
      const grow = easeInCubic(diveT);
      const startZ = CAMERA_DIST - (worldHeight * 0.5 + 0.6);
      const farZ = -CAMERA_DIST * 0.35;
      const z = THREE.MathUtils.lerp(farZ, startZ, grow);
      const fillBoost = 1 + grow * 2.4;
      pivot.scale.setScalar(worldHeight * fillBoost);
      pivot.position.set(
        0,
        THREE.MathUtils.lerp(size.height * 0.15 * unitsPerPixel, 0, grow),
        z,
      );
      pivot.rotation.set(-Math.PI / 2, 0, 0);
      setFlame(0.55 * (1 - grow), 1.1);
      return;
    }

    takeoffStartedAtRef.current = null;

    if (reducedMotion) {
      pivot.scale.setScalar(worldHeight);
      applyLandedPose();
      spin.rotation.y = LANDED_YAW;
      setFlame(0, 0);
      return;
    }

    const t = clock.getElapsedTime();
    const p = clamp01(t / LANDING_TIME);

    // 着陸完了後は星の回転に乗る
    if (p >= 1) {
      pivot.scale.setScalar(worldHeight);
      applyLandedPose();
      spin.rotation.y = LANDED_YAW;
      setFlame(0, 0);
      return;
    }

    pivot.scale.setScalar(worldHeight);

    // 画面比率での位置（各奥行きの視界サイズに合わせて換算する）
    const fracToWorldX = (fx: number, z: number) =>
      fx * size.width * unitsPerPixel * frustumScale(z);
    const fracToWorldY = (fy: number, z: number) =>
      fy * size.height * unitsPerPixel * frustumScale(z);

    if (p < 0.55) {
      // フェーズA: 底部が画面を覆いつくした状態で一瞬ホールドし、
      // そこから徐々に遠ざかって小さくなりながら上空へ（イーズイン・アウトで滑らかに縮小）
      const HOLD = 0.1;
      const q = p < HOLD ? 0 : easeInOutCubic((p - HOLD) / (0.55 - HOLD));
      // 開始位置は「機体の底面がカメラの0.6ワールド単位手前」になるよう機体サイズから逆算する
      // （底面はピボット中心から高さの半分だけカメラ側に突き出るため、その分を引く）
      const startZ = CAMERA_DIST - (worldHeight * 0.5 + 0.6);
      const z = THREE.MathUtils.lerp(startZ, 0, q);
      pivot.position.set(
        fracToWorldX(0, z),
        THREE.MathUtils.lerp(0, hoverY, q) + fracToWorldY(0, z),
        z,
      );
      // 底をカメラに向けた姿勢（-90°）から直立（0°）へ
      const upright = easeInOutCubic(clamp01((p - HOLD - 0.05) / 0.36));
      pivot.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0, upright);
      // 飛行中は機体軸まわりにゆっくりロール
      spin.rotation.y = LANDED_YAW + (1 - q) * Math.PI * 1.6;
      setFlame(0.6, 1.25);
    } else {
      // フェーズC: 上空から減速しつつ垂直降下
      const q = easeOutCubic((p - 0.55) / 0.45);
      pivot.position.set(0, THREE.MathUtils.lerp(hoverY, landedY, q), 0);
      pivot.rotation.x = 0;
      spin.rotation.y = LANDED_YAW;
      // 降下の後半で炎を絞って消す
      const fade = clamp01((p - 0.67) / 0.12);
      setFlame(0.55 * (1 - fade), 1 - 0.7 * fade);
    }
  });

  const planetRWorld = wordPlanetRadius(size.width) * unitsPerPixel;
  const planetCenterYWorld = landedY - worldHeight / 2 - planetRWorld;

  return (
    <>
      {/* 見えない遮蔽円盤：深度だけ書き込み、星の裏側(z<0)へ回り込んだロケットを隠す。
          球体だと透視投影で描画中の星（平行投影）より大きく映ってしまうため、
          z=0平面の円盤にして輪郭を画面上の星とぴったり一致させる */}
      {!takingOff && (
        <mesh position={[0, planetCenterYWorld, 0]} renderOrder={-1}>
          <circleGeometry args={[planetRWorld - 0.05, 64]} />
          <meshBasicMaterial colorWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <group ref={pivotRef}>
      <group ref={spinRef}>
        <primitive object={model} />
      </group>
      {/* 噴射炎：機体底部に追従する半透明のコーン2枚重ね */}
      <group ref={flameRef} position={[0, -0.52, 0]}>
        <mesh position={[0, -0.22, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.1, 0.46, 16]} />
          <meshBasicMaterial
            color="#4f8dff"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, -0.15, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.055, 0.3, 16]} />
          <meshBasicMaterial
            color="#c9f2ff"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
      </group>
    </>
  );
}

interface RocketModelProps {
  /** テーマのアクセント色。モデルの赤いパーツに塗る。 */
  accent: string;
  /** 着陸時の表示高さ(px)。 */
  heightPx: number;
  /** 接地点（足元）の画面下端からの位置(px)を返す。CSSの --surface-bottom と揃えること。 */
  feetBottom: (viewportHeight: number) => number;
  /** 星（球体）の回転に乗るときの目標角。画面上で時計回り正（ラジアン）。 */
  surfaceAngleRad?: number;
  /** 星の奥方向への目標回転角（ラジアン）。負で星の裏側へ回り込む。 */
  surfacePitchRad?: number;
  /** true のとき離陸シーケンスを再生する */
  takingOff?: boolean;
}

export function RocketModel({
  accent,
  heightPx,
  feetBottom,
  surfaceAngleRad = 0,
  surfacePitchRad = 0,
  takingOff = false,
}: RocketModelProps) {
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  return (
    <Canvas
      camera={{ position: [0, 0, CAMERA_DIST], fov: CAMERA_FOV, near: 0.1, far: 200 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        /* 離陸の画面埋め中はUIより手前に出す */
        zIndex: takingOff ? 12 : 3,
      }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[0.5, 1, 1]} intensity={1.1} />
      <Suspense fallback={null}>
        <FeetAwareRocket
          accent={accent}
          heightPx={heightPx}
          feetBottom={feetBottom}
          surfaceAngleRad={surfaceAngleRad}
          surfacePitchRad={surfacePitchRad}
          takingOff={takingOff}
          reducedMotion={reducedMotion}
        />
      </Suspense>
    </Canvas>
  );
}

interface FeetAwareRocketProps extends Omit<RocketSceneProps, 'feetBottomPx'> {
  feetBottom: (viewportHeight: number) => number;
}

function FeetAwareRocket({ feetBottom, ...rest }: FeetAwareRocketProps) {
  const { size } = useThree();
  return <RocketScene {...rest} feetBottomPx={feetBottom(size.height)} />;
}
