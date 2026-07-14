import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getBasicEmotion, type BasicEmotionId } from '../data/emotions';
import {
  HIERARCHY_BASIC_RING_RADIUS,
  HIERARCHY_BASIC_SPHERE_RADIUS,
  HIERARCHY_BASIC_Y,
  HIERARCHY_CHILD_RING_RADIUS,
  HIERARCHY_CHILD_SPHERE_RADIUS,
  HIERARCHY_SLOT_BASIC_ID,
  HIERARCHY_SPIN_LERP,
  HIERARCHY_WHEEL_TILT_X,
  HIERARCHY_WHEEL_TILT_Z,
  getHierarchyBasicCenters,
  getHierarchyChildCenter,
  getHierarchyChildPositions,
  getHierarchySpinForBasic,
  hierarchyDepthFactor,
  shortestAngleDelta,
} from '../utils/emotionHierarchyLayout';

interface EmotionHierarchyBrowseProps {
  /** 手前スロットへ回す対象 */
  frontBasicId: BasicEmotionId;
  /** 決定ボタンで確定した感情。下段の合成リングを出す */
  confirmedBasicId?: BasicEmotionId | null;
  onFrontBasicChange?: (id: BasicEmotionId) => void;
}

function OrbitHintRing({
  radius,
  y,
  color,
  opacity,
}: {
  radius: number;
  y: number;
  color: string;
  opacity: number;
}) {
  const points = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
    return curve.getPoints(64).map((p) => new THREE.Vector3(p.x, y, p.y));
  }, [radius, y]);

  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineLoop>
  );
}

function ConnectStem({
  from,
  to,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) {
  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    ]);
  }, [from, to]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} />
    </lineSegments>
  );
}

function BasicEmotionSphere({
  id,
  position,
  color,
  label,
  angleRad,
  spinYRef,
  isFront,
  isConfirmed,
  isHovered,
  onSelect,
  onHover,
}: {
  id: BasicEmotionId;
  position: { x: number; y: number; z: number };
  color: string;
  label: string;
  angleRad: number;
  spinYRef: MutableRefObject<number>;
  isFront: boolean;
  isConfirmed: boolean;
  isHovered: boolean;
  onSelect: (id: BasicEmotionId) => void;
  onHover: (id: BasicEmotionId | null) => void;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useFrame(() => {
    const depth = hierarchyDepthFactor(angleRad, spinYRef.current);
    // サイズは変えず、奥の球だけわずかに落とす（遠近感と矛盾しない範囲）
    if (matRef.current) {
      matRef.current.opacity = THREE.MathUtils.lerp(0.42, 1, depth * depth);
      matRef.current.emissiveIntensity = isFront
        ? 0.72
        : isHovered
          ? 0.48
          : THREE.MathUtils.lerp(0.12, 0.32, depth);
    }
    if (labelRef.current) {
      labelRef.current.style.opacity = String(THREE.MathUtils.lerp(0.28, 0.92, depth));
    }
  });

  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect(id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[HIERARCHY_BASIC_SPHERE_RADIUS, 28, 28]} />
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.28}
          transparent
          opacity={1}
          roughness={0.38}
          metalness={0.16}
          depthWrite
        />
      </mesh>
      {/* 球について回るラベル（固定スロット側の大きい表示とは別） */}
      <Html
        center
        distanceFactor={22}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          ref={labelRef}
          style={{
            color,
            fontSize: '0.72rem',
            fontWeight: 650,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            textShadow: '0 0 8px rgba(0,0,0,0.85)',
            textAlign: 'center',
            transform: 'translateY(1.6rem)',
          }}
        >
          {label}
        </div>
      </Html>
      {isConfirmed && (
        <mesh>
          <ringGeometry args={[HIERARCHY_BASIC_SPHERE_RADIUS * 1.15, HIERARCHY_BASIC_SPHERE_RADIUS * 1.32, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function EmotionHierarchyBrowse({
  frontBasicId,
  confirmedBasicId = null,
  onFrontBasicChange,
}: EmotionHierarchyBrowseProps) {
  const basics = useMemo(() => getHierarchyBasicCenters(), []);
  const spinGroupRef = useRef<THREE.Group>(null);
  const spinCurrentRef = useRef(getHierarchySpinForBasic(frontBasicId));
  const spinTargetRef = useRef(getHierarchySpinForBasic(frontBasicId));
  const [hoveredBasicId, setHoveredBasicId] = useState<BasicEmotionId | null>(null);
  const [hoveredDyadId, setHoveredDyadId] = useState<string | null>(null);

  useEffect(() => {
    spinTargetRef.current = getHierarchySpinForBasic(frontBasicId);
  }, [frontBasicId]);

  useFrame((_, delta) => {
    const group = spinGroupRef.current;
    if (!group) {
      return;
    }
    const deltaAngle = shortestAngleDelta(spinCurrentRef.current, spinTargetRef.current);
    const blend = 1 - Math.exp(-HIERARCHY_SPIN_LERP * delta);
    spinCurrentRef.current += deltaAngle * blend;
    group.rotation.y = spinCurrentRef.current;

    if (Math.abs(deltaAngle) < 0.012) {
      spinCurrentRef.current = spinTargetRef.current;
      group.rotation.y = spinCurrentRef.current;
    }
  });

  const childNodes = useMemo(
    () => (confirmedBasicId ? getHierarchyChildPositions(confirmedBasicId) : []),
    [confirmedBasicId],
  );
  const childCenter = confirmedBasicId ? getHierarchyChildCenter(confirmedBasicId) : null;
  const confirmedBasic = confirmedBasicId ? getBasicEmotion(confirmedBasicId) : null;
  const confirmedPos = confirmedBasicId
    ? basics.find((item) => item.id === confirmedBasicId)?.position
    : null;

  return (
    <group rotation={[HIERARCHY_WHEEL_TILT_X, 0, HIERARCHY_WHEEL_TILT_Z]}>
      <OrbitHintRing
        radius={HIERARCHY_BASIC_RING_RADIUS}
        y={HIERARCHY_BASIC_Y}
        color="#9eb6c9"
        opacity={confirmedBasicId ? 0.16 : 0.28}
      />

      <group ref={spinGroupRef}>
        {basics.map(({ id, position, color, label, angleRad }) => (
          <BasicEmotionSphere
            key={id}
            id={id}
            position={position}
            color={color}
            label={label}
            angleRad={angleRad}
            spinYRef={spinCurrentRef}
            isFront={id === frontBasicId}
            isConfirmed={id === confirmedBasicId}
            isHovered={id === hoveredBasicId}
            onSelect={(nextId) => onFrontBasicChange?.(nextId)}
            onHover={(nextId) => setHoveredBasicId(nextId)}
          />
        ))}

        {confirmedBasic && confirmedPos && childCenter && (
          <group>
            <ConnectStem
              from={[
                confirmedPos.x,
                confirmedPos.y - HIERARCHY_BASIC_SPHERE_RADIUS * 0.95,
                confirmedPos.z,
              ]}
              to={[childCenter.x, childCenter.y + HIERARCHY_CHILD_SPHERE_RADIUS, childCenter.z]}
              color={confirmedBasic.color}
            />
            <group position={[childCenter.x, 0, childCenter.z]}>
              <OrbitHintRing
                radius={HIERARCHY_CHILD_RING_RADIUS}
                y={childCenter.y}
                color={confirmedBasic.color}
                opacity={0.42}
              />
            </group>

            {childNodes.map(({ dyad, position, color }) => {
              const isHovered = hoveredDyadId === dyad.id;
              const [a, b] = dyad.components;
              const composition = `${getBasicEmotion(a).label}＋${getBasicEmotion(b).label}`;
              const radius = HIERARCHY_CHILD_SPHERE_RADIUS * (isHovered ? 1.08 : 1);

              return (
                <group key={dyad.id} position={[position.x, position.y, position.z]}>
                  <mesh
                    onPointerOver={(event) => {
                      event.stopPropagation();
                      setHoveredDyadId(dyad.id);
                      document.body.style.cursor = 'pointer';
                    }}
                    onPointerOut={() => {
                      setHoveredDyadId((prev) => (prev === dyad.id ? null : prev));
                      document.body.style.cursor = 'auto';
                    }}
                  >
                    <sphereGeometry args={[radius, 24, 24]} />
                    <meshStandardMaterial
                      color={color}
                      emissive={color}
                      emissiveIntensity={isHovered ? 0.55 : 0.28}
                      transparent
                      opacity={0.9}
                      roughness={0.42}
                      metalness={0.16}
                      depthWrite
                    />
                  </mesh>
                  <Html
                    center
                    distanceFactor={18}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    <div
                      style={{
                        color,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                        textAlign: 'center',
                        textShadow: '0 0 10px rgba(0,0,0,0.85)',
                      }}
                    >
                      {dyad.label}
                      {isHovered && (
                        <span
                          style={{
                            display: 'block',
                            marginTop: 2,
                            fontSize: '0.56rem',
                            fontWeight: 500,
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
        )}
      </group>
    </group>
  );
}

export const HIERARCHY_DEFAULT_FRONT_BASIC_ID: BasicEmotionId = HIERARCHY_SLOT_BASIC_ID;
