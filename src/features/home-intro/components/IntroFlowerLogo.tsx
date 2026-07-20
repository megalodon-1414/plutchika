import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BASIC_EMOTIONS } from '../../../data/emotions';
import { createPlutchikPetalShape } from '../../../utils/plutchikPetalShape3d';
import { HOME_INTRO_HORIZON_RATIO } from '../sceneLayout';

/**
 * 旧 home-tutorial の3D花ロゴ（HomeTutorialPlutchikWheel3D、intro-redesign前に削除済み）を
 * 参考にした、①ロゴステップ専用の押し出し花びら＋中心球。
 *
 * BoardingRocket.tsx と同じ前例パターンで、PlanetGlobe とは別Canvas（同じオルソグラフィック
 * カメラ設定＝世界単位がCSSピクセルになる構成）に描画する。中心球の位置・半径だけを
 * PlanetGlobe.tsx側の計算式（apexY/radius）に合わせて補間することで、スクロールで
 * 次シーンの惑星（地平線の球）へ同じ球が繋がって見える演出にする。
 * PlanetGlobe.tsx / sceneLayout.ts は一切改修しない（HOME_INTRO_HORIZON_RATIOを読むだけ）。
 */

const PETAL_OUTER_RADIUS = 140;
const PETAL_HALF_SPREAD_DEG = 22.5;
/** 旧実装の depth/outerRadius 比（0.048/0.7）を、この画面のpx単位スケールに合わせて引き伸ばした値。 */
const PETAL_DEPTH = 10;
const PLANE_TILT_X = -0.52;
const PLANE_TILT_Y = -0.38;
const SPIN_SPEED = 0.12;
/** 散開しきったときに花びらが中心から離れる距離(px)。 */
const PETAL_SCATTER_DISTANCE = 320;

/** 静止時の中心球の半径(px)。旧TutorialStepSphereを参考にしたシンプルな発光球のサイズ。 */
const HUB_REST_RADIUS = 34;

/** 静止時、花全体を画面中央からどれだけ左へ寄せるか（画面幅に対する比率）。右側にワードマークを置くレイアウト用。 */
const HUB_REST_OFFSET_X_RATIO = 0.23;

/** ロゴ離脱時（花びら散開・中心球の受け渡し）の収束速度。 */
const PROGRESS_SCATTER_SPEED = 3.2;
/** ロゴ復帰時（花びら集合・中心球の縮小）の収束速度。戻りがダレないよう散開より速くする。 */
const PROGRESS_GATHER_SPEED = 8;

function getPetalPlaneAngle(emotionAngle: number): number {
  return ((90 - emotionAngle) * Math.PI) / 180;
}

function easeOutCubic(t: number): number {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - (1 - clamped) ** 3;
}

interface PetalDef {
  id: string;
  color: string;
  rotationZ: number;
  outward: [number, number];
}

function FlowerScene({ atLogoStep }: { atLogoStep: boolean }) {
  const { size } = useThree();
  const flowerAnchorRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const hubRef = useRef<THREE.Mesh>(null);
  const hubMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const petalGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const petalMaterialRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const progress = useRef(atLogoStep ? 0 : 1);
  const progressTarget = useRef(atLogoStep ? 0 : 1);
  /** 一度でもロゴを離れて散開を始めたか。復帰時の集合モーション保証に使う。 */
  const hasScatteredRef = useRef(!atLogoStep);

  useEffect(() => {
    if (atLogoStep) {
      // 復帰時：progress が集合済み寄りのまま残っているとモーションが飛ばされるので、
      // 散開経験がある場合は散開端から集合をやり直す。
      if (hasScatteredRef.current && progress.current < 0.2) {
        progress.current = 1;
      }
      progressTarget.current = 0;
    } else {
      hasScatteredRef.current = true;
      progressTarget.current = 1;
    }
  }, [atLogoStep]);

  const petalGeometry = useMemo(() => {
    const shape = createPlutchikPetalShape(PETAL_OUTER_RADIUS, PETAL_HALF_SPREAD_DEG);
    return new THREE.ExtrudeGeometry(shape, { depth: PETAL_DEPTH, bevelEnabled: false });
  }, []);

  const petals = useMemo<PetalDef[]>(
    () =>
      BASIC_EMOTIONS.map((emotion) => {
        const planeAngle = getPetalPlaneAngle(emotion.angle);
        return {
          id: emotion.id,
          color: emotion.color,
          rotationZ: planeAngle - Math.PI / 2,
          outward: [Math.cos(planeAngle), Math.sin(planeAngle)],
        };
      }),
    [],
  );

  useFrame((_, delta) => {
    const lerpSpeed = progressTarget.current > progress.current ? PROGRESS_SCATTER_SPEED : PROGRESS_GATHER_SPEED;
    const lerpT = 1 - Math.exp(-lerpSpeed * delta);
    progress.current = THREE.MathUtils.lerp(progress.current, progressTarget.current, lerpT);
    const eased = easeOutCubic(progress.current);

    if (spinRef.current && progress.current < 0.98) {
      spinRef.current.rotation.z += delta * SPIN_SPEED;
    }

    petals.forEach((petal, index) => {
      const group = petalGroupRefs.current[index];
      const material = petalMaterialRefs.current[index];
      if (group) {
        group.position.set(
          petal.outward[0] * PETAL_SCATTER_DISTANCE * eased,
          petal.outward[1] * PETAL_SCATTER_DISTANCE * eased,
          0,
        );
      }
      if (material) {
        material.opacity = (1 - eased) * 0.92;
      }
    });

    // PlanetGlobe.tsx（PlanetMesh）と全く同じ式。同ファイルは改修せず、ここで読み取り専用に複製する。
    const planetRadius = Math.min(size.width * 0.62, 900);
    const apexY = size.height / 2 - HOME_INTRO_HORIZON_RATIO * size.height;
    const planetCenterY = apexY - planetRadius;
    // 花びらは常に「花の錨点」(restX, 0)へ収束するので、中心球も静止時はそこに揃える
    // （花の中心＝旧参考実装と同じ見た目）。PlanetGlobeの球は常に画面中央(x=0)なので、
    // 散開時の中心球はX方向にも受け渡し先へ補間する。
    const restX = -size.width * HUB_REST_OFFSET_X_RATIO;
    const restY = 0;

    // ロゴ復帰（gather）時は惑星から戻るモーションにせず、花の中心に固定したまま
    // 花びらの集合と同期して不透明度だけ上げる（だんだんと濃く現れさせる）。
    // ロゴ離脱（scatter）時だけ、位置・半径をPlanetGlobeへ補間して受け渡し演出にする。
    const isGathering = progressTarget.current === 0;
    const hubRadius = isGathering
      ? HUB_REST_RADIUS
      : THREE.MathUtils.lerp(HUB_REST_RADIUS, planetRadius, eased);
    const hubX = isGathering ? restX : THREE.MathUtils.lerp(restX, 0, eased);
    const hubY = isGathering ? restY : THREE.MathUtils.lerp(restY, planetCenterY, eased);

    if (flowerAnchorRef.current) {
      flowerAnchorRef.current.position.set(restX, restY, 0);
    }
    if (hubRef.current) {
      hubRef.current.scale.setScalar(hubRadius);
      hubRef.current.position.set(hubX, hubY, 0);
    }
    if (hubMaterialRef.current) {
      hubMaterialRef.current.opacity = 1 - eased;
    }
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight position={[200, 300, 400]} intensity={0.9} />
      <group ref={flowerAnchorRef} rotation={[PLANE_TILT_X, PLANE_TILT_Y, 0]}>
        <group ref={spinRef}>
          {petals.map((petal, index) => (
            <group
              key={petal.id}
              ref={(el) => {
                petalGroupRefs.current[index] = el;
              }}
              rotation={[0, 0, petal.rotationZ]}
            >
              <mesh geometry={petalGeometry} position={[0, 0, -PETAL_DEPTH / 2]}>
                <meshStandardMaterial
                  ref={(el) => {
                    petalMaterialRefs.current[index] = el;
                  }}
                  color={petal.color}
                  emissive={petal.color}
                  emissiveIntensity={0.28}
                  roughness={0.45}
                  metalness={0}
                  toneMapped={false}
                  transparent
                  opacity={0.92}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      {/* 中心球：旧TutorialStepSphereを参考にしたシンプルな発光球のまま（PlanetGlobeのトゥーン・
          クレーターテクスチャには寄せない）。位置・半径だけをPlanetGlobeの式へ補間して「繋がる」演出にする。 */}
      <mesh ref={hubRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          ref={hubMaterialRef}
          color="#f8f4fb"
          emissive="#f4ecf7"
          emissiveIntensity={0.6}
          roughness={0.3}
          metalness={0}
          toneMapped={false}
          transparent
          opacity={1}
        />
      </mesh>
    </>
  );
}

interface IntroFlowerLogoProps {
  /** true の間は花びらが集合した静止状態。false になった瞬間から放射状に散開し、中心球がPlanetGlobeへ成長する。 */
  atLogoStep: boolean;
}

/** ①ロゴ画面専用の3D花ロゴ。PlanetGlobeと同じオルソグラフィックカメラの別Canvasで、位置だけを合わせる。 */
export function IntroFlowerLogo({ atLogoStep }: IntroFlowerLogoProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 2000], near: 1, far: 10000, zoom: 1 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <FlowerScene atLogoStep={atLogoStep} />
    </Canvas>
  );
}
