import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { HOME_INTRO_HORIZON_RATIO } from '../sceneLayout';

/** 1ステップぶんの自転角（ラジアン）。歩幅の実感を作る担当。 */
const ROTATION_PER_STEP = Math.PI / 6.5;
const ROTATION_LERP_SPEED = 4;

const PLANET_BASE_COLOR = '#c3cbef';
const CRATER_COLOR = 'rgba(64, 68, 116, 0.4)';
const CRATER_COUNT = 46;

/** クレーターは凹凸をモデリングせず、平らなテクスチャ画像として貼る。 */
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
  stepIndex: number;
}

function PlanetMesh({ stepIndex }: PlanetMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetRotationY = useRef(0);
  const { size } = useThree();
  const texture = useMemo(() => createPlanetTexture(), []);

  const radius = Math.min(size.width * 0.62, 900);
  const apexY = size.height / 2 - HOME_INTRO_HORIZON_RATIO * size.height;
  const centerY = apexY - radius;

  useEffect(() => {
    targetRotationY.current = -stepIndex * ROTATION_PER_STEP;
  }, [stepIndex]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const t = 1 - Math.exp(-ROTATION_LERP_SPEED * delta);
    mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, targetRotationY.current, t);
  });

  return (
    <mesh ref={meshRef} position={[0, centerY, 0]}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshToonMaterial map={texture} />
    </mesh>
  );
}

interface PlanetGlobeProps {
  stepIndex: number;
}

/** 惑星部分のみ Three.js の SphereGeometry で実装した本物の3D球体。凹凸はテクスチャで表現し、フラットなイラスト調のトゥーンマテリアルで陰影を抑える。 */
export function PlanetGlobe({ stepIndex }: PlanetGlobeProps) {
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
      <PlanetMesh stepIndex={stepIndex} />
    </Canvas>
  );
}
