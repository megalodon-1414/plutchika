import { useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  DYAD_EMOTIONS,
  getBasicEmotion,
  isBasicEmotionId,
  type EmotionId,
} from '../data/emotions';
import {
  getAllEmotionCenters,
  getEmotionCenter,
  getEmotionSphereRadius,
} from '../utils/emotionSpaceLayout';

interface EmotionSystemOverviewProps {
  focusEmotionId?: EmotionId | null;
  onSelectSystem?: (emotionId: EmotionId) => void;
  onHoverSystem?: (emotionId: EmotionId | null) => void;
}

function compositionLabel(id: EmotionId): string | null {
  if (isBasicEmotionId(id)) {
    return null;
  }
  const dyad = DYAD_EMOTIONS.find((item) => item.id === id);
  if (!dyad) {
    return null;
  }
  const [a, b] = dyad.components;
  return `${getBasicEmotion(a).label}＋${getBasicEmotion(b).label}`;
}

function DyadCompositionLines() {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const dyad of DYAD_EMOTIONS) {
      const mid = getEmotionCenter(dyad.id);
      const [a, b] = dyad.components;
      const pa = getEmotionCenter(a);
      const pb = getEmotionCenter(b);
      positions.push(mid.x, mid.y, mid.z, pa.x, pa.y, pa.z);
      positions.push(mid.x, mid.y, mid.z, pb.x, pb.y, pb.z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color="#d7e2ef"
        transparent
        opacity={0.28}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function RotatingWireframe({
  radius,
  color,
  active,
  opacity,
}: {
  radius: number;
  color: string;
  active: boolean;
  opacity: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  const targetSpeedY = 1.35;
  const targetSpeedX = 0.55;
  const fadeSpeed = 2.4;

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    const target = active ? 1 : 0;
    const blend = 1 - Math.exp(-fadeSpeed * delta);
    speedRef.current += (target - speedRef.current) * blend;

    if (speedRef.current > 0.001) {
      groupRef.current.rotation.y += delta * targetSpeedY * speedRef.current;
      groupRef.current.rotation.x += delta * targetSpeedX * speedRef.current;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[radius, 1]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function EmotionSystemOverview({
  focusEmotionId = null,
  onSelectSystem,
  onHoverSystem,
}: EmotionSystemOverviewProps) {
  const centers = useMemo(() => getAllEmotionCenters(), []);
  const [hoveredId, setHoveredId] = useState<EmotionId | null>(null);

  return (
    <group>
      <DyadCompositionLines />
      {centers.map(({ id, position, color, label }) => {
        const sphereRadius = getEmotionSphereRadius(id);
        const isBasic = isBasicEmotionId(id);
        const isFocus = id === focusEmotionId;
        const isHovered = id === hoveredId;
        const scale = (isHovered ? 1.1 : 1) * (isFocus ? 1.08 : 1);
        const markerRadius = sphereRadius * (isBasic ? 0.42 : 0.32) * scale;
        const composition = isHovered ? compositionLabel(id) : null;

        return (
          <group key={id} position={[position.x, position.y, position.z]}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                onSelectSystem?.(id);
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHoveredId(id);
                onHoverSystem?.(id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHoveredId((prev) => (prev === id ? null : prev));
                onHoverSystem?.(null);
                document.body.style.cursor = 'auto';
              }}
            >
              <sphereGeometry args={[markerRadius, 20, 20]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={isHovered ? 0.9 : isFocus ? 0.88 : isBasic ? 0.72 : 0.55}
                depthWrite={false}
              />
            </mesh>
            <RotatingWireframe
              radius={sphereRadius * scale * (isFocus || isHovered ? 1.06 : 1)}
              color={color}
              active={isHovered}
              opacity={isHovered ? 0.55 : isFocus ? 0.38 : isBasic ? 0.2 : 0.12}
            />
            {isFocus && !isHovered && (
              <mesh>
                <icosahedronGeometry args={[sphereRadius * scale * 1.22, 1]} />
                <meshBasicMaterial
                  color={color}
                  wireframe
                  transparent
                  opacity={0.22}
                  depthWrite={false}
                />
              </mesh>
            )}
            <Html
              center
              distanceFactor={isBasic ? 22 : 28}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              <div
                style={{
                  color,
                  fontSize: isFocus
                    ? (isBasic ? '1.05rem' : '0.84rem')
                    : isBasic
                      ? '0.92rem'
                      : '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 10px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)',
                  opacity: 1,
                  textAlign: 'center',
                }}
              >
                {label}
                {composition && (
                  <span
                    style={{
                      display: 'block',
                      marginTop: '3px',
                      fontSize: '0.62rem',
                      fontWeight: 500,
                      letterSpacing: '0.04em',
                      color: 'rgba(230,236,244,0.88)',
                    }}
                  >
                    {composition}
                  </span>
                )}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
