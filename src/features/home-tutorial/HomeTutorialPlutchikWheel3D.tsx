import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BASIC_EMOTIONS } from '../../data/emotions';
import {
  createPlutchikPetalShape,
  PLUTCHIK_PETAL_EXTRUDE_SETTINGS,
} from '../../utils/plutchikPetalShape3d';

/** 全花弁共通サイズ */
const OUTER_RADIUS = 0.7;
const HALF_SPREAD_DEG = 22.5;
const WHEEL_SCALE = 1.3;
/** 平面の傾き — 右下が手前に来る */
const PLANE_TILT_X = -0.52;
const PLANE_TILT_Y = -0.38;
/** 中心点（ハブ）を軸にした回転速度 [rad/s] */
const SPIN_SPEED = 0.12;

interface HomeTutorialPlutchikWheel3DProps {
  center: [number, number, number];
  visible: boolean;
}

function getPetalPlaneAngle(emotionAngle: number): number {
  return ((90 - emotionAngle) * Math.PI) / 180;
}

export function HomeTutorialPlutchikWheel3D({ center, visible }: HomeTutorialPlutchikWheel3DProps) {
  const ringRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const opacityTarget = useRef(visible ? 1 : 0);
  const opacityCurrent = useRef(visible ? 1 : 0);

  const petalGeometry = useMemo(() => {
    const shape = createPlutchikPetalShape(OUTER_RADIUS, HALF_SPREAD_DEG);
    return new THREE.ExtrudeGeometry(shape, PLUTCHIK_PETAL_EXTRUDE_SETTINGS);
  }, []);

  const petalDepth = PLUTCHIK_PETAL_EXTRUDE_SETTINGS.depth ?? 0.048;

  const petals = useMemo(
    () =>
      BASIC_EMOTIONS.map((emotion) => {
        const planeAngle = getPetalPlaneAngle(emotion.angle);
        return {
          id: emotion.id,
          color: emotion.color,
          rotation: [0, 0, planeAngle - Math.PI / 2] as [number, number, number],
        };
      }),
    [],
  );

  useFrame((_, delta) => {
    opacityTarget.current = visible ? 1 : 0;
    opacityCurrent.current = THREE.MathUtils.lerp(
      opacityCurrent.current,
      opacityTarget.current,
      1 - Math.exp(-6 * delta),
    );

    const ring = ringRef.current;
    if (!ring) {
      return;
    }

    if (spinRef.current && opacityCurrent.current > 0.02) {
      spinRef.current.rotation.z += delta * SPIN_SPEED;
    }

    ring.visible = opacityCurrent.current > 0.02;
    ring.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      const material = child.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.opacity = opacityCurrent.current * 0.92;
      }
    });
  });

  return (
    <group ref={ringRef} position={center} scale={WHEEL_SCALE}>
      <group rotation={[PLANE_TILT_X, PLANE_TILT_Y, 0]}>
        <group ref={spinRef}>
          {petals.map((petal) => (
            <group key={petal.id} rotation={petal.rotation}>
              <mesh geometry={petalGeometry} position={[0, 0, -petalDepth / 2]}>
                <meshStandardMaterial
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
    </group>
  );
}
