/**
 * ④搭乗ステップ専用のロケット演出レイヤー。
 *
 * ロケット本体は public/models/rocket.obj（Blender製）をOBJLoaderで読み込み、
 * PlanetGlobe と同じオルソグラフィックカメラ（世界単位＝CSSピクセル）の別Canvasに重ねて描画する。
 *
 * フェーズは3段階:
 * - enter:  星空と同じ消失点（地平線の奥）から現れ、拡大しながら人物の右横へ着陸する
 * - board:  着陸したままゆっくり上下に揺れて待機する（人物が歩いて乗り込む間）
 * - launch: なめらかに加速して画面上方へ飛び去った後、機首をこちらへ向けて
 *           カメラに向かって飛んできて、最後は画面全体を覆う
 */
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { HOME_INTRO_HORIZON_RATIO } from '../sceneLayout';

export type RocketPhase = 'enter' | 'board' | 'launch';

const ROCKET_OBJ_URL = '/models/rocket.obj';

/**
 * ロケットの着陸位置（画面中央からの右オフセット、px）。
 * home-intro.css の `--rocket-offset-x`（人物の乗り込みアニメの移動先）と必ず同じ値にする。
 */
export const ROCKET_OFFSET_X = 90;

const ENTER_DURATION_S = 1.8;
/** 上昇して画面外へ消えるまでの時間 */
const ASCEND_DURATION_S = 0.9;
/** 発射開始から炎が出るまでのわずかな間（点火の溜め） */
const FLAME_DELAY_S = 0.2;
/** 画面外で向きを変えている「間」 */
const TURN_PAUSE_S = 0.2;
/** 機首をこちらへ向けてカメラへ突っ込んでくる時間 */
const DIVE_DURATION_S = 0.7;

/** 呼び出し側（HomeIntroView）がフェーズ切り替えのタイマーに使う長さ（ms）。 */
export const ROCKET_ENTER_DURATION_MS = ENTER_DURATION_S * 1000;
/** 発射シーケンス全体（上昇→方向転換→カメラへ飛来し画面が埋まる）の長さ（ms）。 */
export const ROCKET_LAUNCH_TOTAL_MS = (ASCEND_DURATION_S + TURN_PAUSE_S + DIVE_DURATION_S) * 1000;

const BODY_COLOR = '#e4d9ea';
const ACCENT_COLOR = '#8f231c';
const FLAME_COLOR = '#3d8bff';
const FLAME_CORE_COLOR = '#eef6ff';

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInCubic(t: number): number {
  return t ** 3;
}

/** 離陸用。最初はほとんど動かず、後半で爆発的に加速する強いイーズイン。 */
function easeInQuint(t: number): number {
  return t ** 5;
}

/**
 * OBJに付属のMTLは同梱していないため、マテリアル名（usemtl）を手掛かりに
 * サイト共通のトゥーン調パレットへ塗り替える（'red' 系＝フィン・ノーズをアクセント色に）。
 */
function applyToonMaterials(root: THREE.Group) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    child.material = materials.length === 1 ? toToon(materials[0]) : materials.map(toToon);
  });
}

function toToon(material: THREE.Material): THREE.MeshToonMaterial {
  const isAccent = material.name.toLowerCase().includes('red');
  const toon = new THREE.MeshToonMaterial({ color: isAccent ? ACCENT_COLOR : BODY_COLOR });
  toon.name = material.name;
  return toon;
}

interface RocketModelProps {
  phase: RocketPhase;
}

function RocketModel({ phase }: RocketModelProps) {
  const obj = useLoader(OBJLoader, ROCKET_OBJ_URL);
  const { size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.Group>(null);
  const phaseRef = useRef<RocketPhase>(phase);
  const phaseStartRef = useRef<number | null>(null);

  /** 底面を原点(y=0)・中心をx=z=0へ揃え、画面サイズ基準の高さへ正規化したモデル。 */
  const { model, rocketHeight, rocketWidth } = useMemo(() => {
    const clone = obj.clone();
    applyToonMaterials(clone);
    const box = new THREE.Box3().setFromObject(clone);
    const sizeVec = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetHeight = Math.min(size.height * 0.2, 130);
    const scale = targetHeight / sizeVec.y;
    const wrapper = new THREE.Group();
    clone.position.set(-center.x, -box.min.y, -center.z);
    wrapper.add(clone);
    wrapper.scale.setScalar(scale);
    return { model: wrapper, rocketHeight: targetHeight, rocketWidth: sizeVec.x * scale };
  }, [obj, size.height]);

  // 惑星の頂点（人物の足元＝地平線）のワールドY。ここがロケットの接地面になる。
  const horizonY = size.height / 2 - HOME_INTRO_HORIZON_RATIO * size.height;

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const now = state.clock.getElapsedTime();
    if (phaseRef.current !== phase || phaseStartRef.current === null) {
      phaseRef.current = phase;
      phaseStartRef.current = now;
    }
    const elapsed = now - phaseStartRef.current;

    let flameVisible = false;

    if (phase === 'enter') {
      // 消失点（画面中央の地平線）から、拡大しながら右横の着陸位置へ
      const t = easeOutCubic(Math.min(elapsed / ENTER_DURATION_S, 1));
      group.rotation.set(0, 0, 0);
      group.scale.setScalar(0.04 + 0.96 * t);
      group.position.set(ROCKET_OFFSET_X * t, horizonY, 0);
    } else if (phase === 'board') {
      // 着陸姿勢のままわずかに浮遊（待機感）
      group.rotation.set(0, 0, 0);
      group.scale.setScalar(1);
      group.position.set(ROCKET_OFFSET_X, horizonY + Math.sin(now * 2) * 2, 0);
    } else if (elapsed < ASCEND_DURATION_S) {
      // 発射①：横揺れなしで、ふわっと浮いたあと爆発的に加速しながら画面上方へ消える
      const t = easeInQuint(elapsed / ASCEND_DURATION_S);
      group.rotation.set(0, 0, 0);
      group.scale.setScalar(1);
      group.position.set(ROCKET_OFFSET_X, horizonY + size.height * 1.6 * t, 0);
      flameVisible = elapsed >= FLAME_DELAY_S;
    } else if (elapsed < ASCEND_DURATION_S + TURN_PAUSE_S) {
      // 発射②：画面外で向きを変えている「間」（見えないので姿勢だけ切り替えておく）
      group.rotation.set(Math.PI / 2, 0, 0);
      group.scale.setScalar(0.001);
      group.position.set(0, size.height * 0.2, 0);
    } else {
      // 発射③：機首をこちら（+Z＝カメラ方向）へ向け、遠く（極小）から一気に拡大して
      // カメラへ突っ込んでくる。オルソグラフィックカメラなのでz移動では大きくならず、
      // スケール変化そのもので「向かってくる」遠近感を表現し、最後は画面全体を覆う。
      const t = Math.min((elapsed - ASCEND_DURATION_S - TURN_PAUSE_S) / DIVE_DURATION_S, 1);
      const grow = easeInCubic(t);
      const fillScale = (Math.max(size.width, size.height) / rocketWidth) * 1.5;
      const scale = 0.05 + (fillScale - 0.05) * grow;
      group.rotation.set(Math.PI / 2, 0, 0);
      group.scale.setScalar(scale);
      // 機首（+z側）がカメラのnearプレーンを突き抜けて断面が見えないよう、拡大に応じて奥へ引く
      group.position.set(0, size.height * 0.2 * (1 - t), -rocketHeight * scale * 0.9);
    }

    const flame = flameRef.current;
    if (flame) {
      flame.visible = flameVisible;
      if (flameVisible) {
        // ちらつきはランダムではなく、周期の異なる正弦波の合成でなめらかに揺らす
        const widthPulse = 1 + Math.sin(now * 14) * 0.08 + Math.sin(now * 23) * 0.05;
        const lengthPulse = 1.15 + Math.sin(now * 11) * 0.12 + Math.sin(now * 17) * 0.08;
        flame.scale.set(widthPulse, lengthPulse, widthPulse);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} />
      {/* 炎はノズル下に逆さの円錐2枚（外側：青／内側：白寄りの芯）で表現（発射中のみ表示） */}
      <group ref={flameRef} position={[0, -rocketHeight * 0.12, 0]} rotation={[Math.PI, 0, 0]} visible={false}>
        <mesh>
          <coneGeometry args={[rocketHeight * 0.09, rocketHeight * 0.28, 12]} />
          <meshBasicMaterial color={FLAME_COLOR} transparent opacity={0.85} />
        </mesh>
        {/* 内側の芯。外側より細く短い円錐をカメラ寄りに重ね、白く光る中心を見せる。
            親groupがX軸まわりに180°反転しているため、カメラ側（ワールド+z）はローカルでは-zになる */}
        <mesh position={[0, -rocketHeight * 0.05, -rocketHeight * 0.01]}>
          <coneGeometry args={[rocketHeight * 0.045, rocketHeight * 0.16, 12]} />
          <meshBasicMaterial color={FLAME_CORE_COLOR} transparent opacity={0.95} />
        </mesh>
      </group>
    </group>
  );
}

interface BoardingRocketProps {
  phase: RocketPhase;
}

/** ④搭乗ステップの間だけマウントされる、全画面オーバーレイのロケットCanvas。 */
export function BoardingRocket({ phase }: BoardingRocketProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 2000], near: 1, far: 10000, zoom: 1 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      /* 暗転レイヤー（.home-intro-launch-dim、z-index:6）より下に置き、発射中はロケットごと暗くなるようにする */
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[0.4, 1, 1]} intensity={1} />
      <Suspense fallback={null}>
        <RocketModel phase={phase} />
      </Suspense>
    </Canvas>
  );
}
