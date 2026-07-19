/**
 * 単語ページの惑星。ホームの PlanetGlobe と同じ描画方法（Three.js の3Dスフィア＋
 * クレーターを平らなテクスチャとして貼ったトゥーンマテリアル）で、
 * 地平線が画面上端から86%（CSSの --surface-bottom: 14% と対）に来るよう配置する。
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/** 回転の追従速度（ホームのPlanetGlobeと同じ手触り） */
const ROTATION_LERP_SPEED = 4;

const PLANET_BASE_COLOR = '#c3cbef';
const CRATER_COLOR = 'rgba(64, 68, 116, 0.4)';
const CRATER_COUNT = 46;

/** 画面上端から地平線（惑星の頂点）までの比率。CSS側の --surface-bottom と揃えること。 */
export const WORD_PLANET_HORIZON_RATIO = 0.86;

/** 惑星の半径(px)。ジェムの傾き計算でも使う。 */
export function wordPlanetRadius(viewportWidth: number): number {
  return Math.min(viewportWidth * 0.62, 900);
}

function createPlanetTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = PLANET_BASE_COLOR;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = CRATER_COLOR;
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
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface PlanetMeshProps {
  /** 画面面内での目標回転角（ラジアン）。正で反時計回り。 */
  rotationRad: number;
  /** 手前奥方向（X軸まわり）の目標回転角（ラジアン）。負で手前の面がせり上がる。 */
  pitchRad: number;
}

function PlanetMesh({ rotationRad, pitchRad }: PlanetMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size } = useThree();
  const texture = useMemo(() => createPlanetTexture(), []);

  const radius = wordPlanetRadius(size.width);
  const apexY = size.height / 2 - WORD_PLANET_HORIZON_RATIO * size.height;
  const centerY = apexY - radius;

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const t = 1 - Math.exp(-ROTATION_LERP_SPEED * delta);
    mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, rotationRad, t);
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, pitchRad, t);
  });

  return (
    <mesh ref={meshRef} position={[0, centerY, 0]}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshToonMaterial map={texture} />
    </mesh>
  );
}

interface PlanetSphereProps {
  /** 画面面内での回転角（ラジアン）。ジェムのフォーカスに合わせて球体を転がす。 */
  rotationRad?: number;
  /** 手前奥方向の回転角（ラジアン）。負で手前の面がせり上がる。 */
  pitchRad?: number;
}

export function PlanetSphere({ rotationRad = 0, pitchRad = 0 }: PlanetSphereProps) {
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
      <PlanetMesh rotationRad={rotationRad} pitchRad={pitchRad} />
    </Canvas>
  );
}
