import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getBasicEmotion, type BasicEmotionId } from '../data/emotions';
import {
  HIERARCHY_BASIC_RING_RADIUS,
  HIERARCHY_BASIC_SPHERE_RADIUS,
  HIERARCHY_BASIC_Y,
  HIERARCHY_CHILD_SPHERE_RADIUS,
  HIERARCHY_CONFIRMED_AXIS_HEIGHT,
  HIERARCHY_CONFIRMED_BASIC_SCALE,
  HIERARCHY_CONFIRMED_MOVE_LERP,
  HIERARCHY_FRONT_LOCAL_ANGLE,
  HIERARCHY_FRONT_SPHERE_SCALE,
  HIERARCHY_IDLE_SPHERE_SCALE,
  HIERARCHY_SLOT_BASIC_ID,
  HIERARCHY_SPIN_LERP,
  HIERARCHY_WHEEL_TILT_X,
  HIERARCHY_WHEEL_TILT_Z,
  getConfirmedBasicAxisLocal,
  getConfirmedChildRingPositions,
  getHierarchyBasicCenters,
  getHierarchySpinForAngle,
  getHierarchySpinForBasic,
  hierarchyDepthFactor,
  shortestAngleDelta,
} from '../utils/emotionHierarchyLayout';

interface EmotionHierarchyBrowseProps {
  frontBasicId: BasicEmotionId;
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

function BasicEmotionSphere({
  id,
  position,
  color,
  label,
  angleRad,
  spinYRef,
  isFront,
  isHovered,
  interactive,
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
  isHovered: boolean;
  interactive: boolean;
  onSelect: (id: BasicEmotionId) => void;
  onHover: (id: BasicEmotionId | null) => void;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const scale =
    (isFront ? HIERARCHY_FRONT_SPHERE_SCALE : HIERARCHY_IDLE_SPHERE_SCALE)
    * (isHovered && !isFront ? 1.12 : 1);
  const radius = HIERARCHY_BASIC_SPHERE_RADIUS * scale;

  useFrame(() => {
    const depth = hierarchyDepthFactor(angleRad, spinYRef.current);
    if (matRef.current) {
      matRef.current.opacity = 1;
      matRef.current.emissiveIntensity = isFront
        ? 0.78
        : isHovered
          ? 0.5
          : THREE.MathUtils.lerp(0.1, 0.28, depth);
    }
    if (labelRef.current) {
      labelRef.current.style.opacity = String(
        isFront ? 1 : THREE.MathUtils.lerp(0.55, 0.92, depth),
      );
      labelRef.current.style.fontSize = isFront ? '0.95rem' : '0.62rem';
    }
  });

  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh
        onClick={(event) => {
          if (!interactive) {
            return;
          }
          event.stopPropagation();
          onSelect(id);
        }}
        onPointerOver={(event) => {
          if (!interactive) {
            return;
          }
          event.stopPropagation();
          onHover(id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (!interactive) {
            return;
          }
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[radius, 28, 28]} />
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
      <Html
        center
        distanceFactor={isFront ? 16 : 24}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          ref={labelRef}
          style={{
            color,
            fontSize: isFront ? '0.95rem' : '0.62rem',
            fontWeight: isFront ? 750 : 650,
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
    </group>
  );
}

function DyadEmotionSphere({
  id,
  position,
  color,
  label,
  composition,
  angleRad,
  spinYRef,
  isFront,
  isHovered,
  onSelect,
  onHover,
}: {
  id: string;
  position: { x: number; y: number; z: number };
  color: string;
  label: string;
  composition: string;
  angleRad: number;
  spinYRef: MutableRefObject<number>;
  isFront: boolean;
  isHovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const scale =
    (isFront ? HIERARCHY_FRONT_SPHERE_SCALE : HIERARCHY_IDLE_SPHERE_SCALE)
    * (isHovered && !isFront ? 1.1 : 1);
  const radius = HIERARCHY_CHILD_SPHERE_RADIUS * scale;

  useFrame(() => {
    const depth = hierarchyDepthFactor(angleRad, spinYRef.current);
    if (matRef.current) {
      matRef.current.emissiveIntensity = isFront
        ? 0.78
        : isHovered
          ? 0.55
          : THREE.MathUtils.lerp(0.18, 0.34, depth);
    }
    if (labelRef.current) {
      labelRef.current.style.opacity = String(
        isFront ? 1 : THREE.MathUtils.lerp(0.55, 0.92, depth),
      );
      labelRef.current.style.fontSize = isFront ? '0.9rem' : '0.66rem';
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
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          roughness={0.42}
          metalness={0.16}
        />
      </mesh>
      <Html
        center
        distanceFactor={isFront ? 15 : 20}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          ref={labelRef}
          style={{
            color,
            fontSize: isFront ? '0.9rem' : '0.66rem',
            fontWeight: isFront ? 750 : 650,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            textShadow: '0 0 10px rgba(0,0,0,0.85)',
            transform: 'translateY(1.35rem)',
          }}
        >
          {label}
          {(isFront || isHovered) && (
            <span
              style={{
                display: 'block',
                marginTop: 2,
                fontSize: isFront ? '0.56rem' : '0.5rem',
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
}

export function EmotionHierarchyBrowse({
  frontBasicId,
  confirmedBasicId = null,
  onFrontBasicChange,
}: EmotionHierarchyBrowseProps) {
  const basics = useMemo(() => getHierarchyBasicCenters(), []);
  const spinGroupRef = useRef<THREE.Group>(null);
  const childSpinGroupRef = useRef<THREE.Group>(null);
  const confirmedBasicGroupRef = useRef<THREE.Group>(null);
  const childRingGroupRef = useRef<THREE.Group>(null);
  const axisStemRef = useRef<THREE.Mesh>(null);
  const spinCurrentRef = useRef(getHierarchySpinForBasic(frontBasicId));
  const spinTargetRef = useRef(getHierarchySpinForBasic(frontBasicId));
  const childSpinCurrentRef = useRef(0);
  const childSpinTargetRef = useRef(0);
  const confirmProgressRef = useRef(0);
  const [hoveredBasicId, setHoveredBasicId] = useState<BasicEmotionId | null>(null);
  const [hoveredDyadId, setHoveredDyadId] = useState<string | null>(null);
  const [frontDyadId, setFrontDyadId] = useState<string | null>(null);

  const slotLocal = useMemo(
    () => ({
      x: HIERARCHY_BASIC_RING_RADIUS * Math.cos(HIERARCHY_FRONT_LOCAL_ANGLE),
      y: HIERARCHY_BASIC_Y,
      z: HIERARCHY_BASIC_RING_RADIUS * Math.sin(HIERARCHY_FRONT_LOCAL_ANGLE),
    }),
    [],
  );
  const axisLocal = useMemo(() => getConfirmedBasicAxisLocal(), []);

  const confirmedBasic = confirmedBasicId ? getBasicEmotion(confirmedBasicId) : null;
  const childNodes = useMemo(
    () => (confirmedBasicId ? getConfirmedChildRingPositions(confirmedBasicId) : []),
    [confirmedBasicId],
  );

  useEffect(() => {
    spinTargetRef.current = getHierarchySpinForBasic(frontBasicId);
  }, [frontBasicId]);

  useEffect(() => {
    if (!confirmedBasicId || childNodes.length === 0) {
      setFrontDyadId(null);
      childSpinCurrentRef.current = 0;
      childSpinTargetRef.current = 0;
      if (childSpinGroupRef.current) {
        childSpinGroupRef.current.rotation.y = 0;
      }
      return;
    }

    const initial = childNodes[0];
    setFrontDyadId(initial.dyad.id);
    const spin = getHierarchySpinForAngle(initial.angleRad);
    childSpinCurrentRef.current = spin;
    childSpinTargetRef.current = spin;
    if (childSpinGroupRef.current) {
      childSpinGroupRef.current.rotation.y = spin;
    }
  }, [confirmedBasicId, childNodes]);

  useEffect(() => {
    if (!confirmedBasicId) {
      confirmProgressRef.current = 0;
      if (childRingGroupRef.current) {
        childRingGroupRef.current.visible = false;
        childRingGroupRef.current.scale.setScalar(0.001);
      }
      if (axisStemRef.current) {
        axisStemRef.current.visible = false;
      }
      return;
    }
    confirmProgressRef.current = 0;
    if (confirmedBasicGroupRef.current) {
      confirmedBasicGroupRef.current.position.set(slotLocal.x, slotLocal.y, slotLocal.z);
      confirmedBasicGroupRef.current.scale.setScalar(HIERARCHY_FRONT_SPHERE_SCALE);
    }
  }, [confirmedBasicId, slotLocal.x, slotLocal.y, slotLocal.z]);

  useFrame((_, delta) => {
    const spinGroup = spinGroupRef.current;
    if (spinGroup && !confirmedBasicId) {
      const deltaAngle = shortestAngleDelta(spinCurrentRef.current, spinTargetRef.current);
      const blend = 1 - Math.exp(-HIERARCHY_SPIN_LERP * delta);
      spinCurrentRef.current += deltaAngle * blend;
      spinGroup.rotation.y = spinCurrentRef.current;
      if (Math.abs(deltaAngle) < 0.012) {
        spinCurrentRef.current = spinTargetRef.current;
        spinGroup.rotation.y = spinCurrentRef.current;
      }
    }

    const childSpinGroup = childSpinGroupRef.current;
    if (childSpinGroup && confirmedBasicId) {
      const deltaAngle = shortestAngleDelta(childSpinCurrentRef.current, childSpinTargetRef.current);
      const blend = 1 - Math.exp(-HIERARCHY_SPIN_LERP * delta);
      childSpinCurrentRef.current += deltaAngle * blend;
      childSpinGroup.rotation.y = childSpinCurrentRef.current;
      if (Math.abs(deltaAngle) < 0.012) {
        childSpinCurrentRef.current = childSpinTargetRef.current;
        childSpinGroup.rotation.y = childSpinCurrentRef.current;
      }
    }

    const targetProgress = confirmedBasicId ? 1 : 0;
    const moveBlend = 1 - Math.exp(-HIERARCHY_CONFIRMED_MOVE_LERP * delta);
    confirmProgressRef.current += (targetProgress - confirmProgressRef.current) * moveBlend;

    const t = confirmProgressRef.current;
    const ease = t * t * (3 - 2 * t);
    if (confirmedBasicGroupRef.current) {
      confirmedBasicGroupRef.current.position.set(
        THREE.MathUtils.lerp(slotLocal.x, axisLocal.x, ease),
        THREE.MathUtils.lerp(slotLocal.y, axisLocal.y, ease),
        THREE.MathUtils.lerp(slotLocal.z, axisLocal.z, ease),
      );
      const scale = THREE.MathUtils.lerp(
        HIERARCHY_FRONT_SPHERE_SCALE,
        HIERARCHY_CONFIRMED_BASIC_SCALE,
        ease,
      );
      confirmedBasicGroupRef.current.scale.setScalar(scale);
    }

    const nextReveal = confirmedBasicId && t > 0.4 ? Math.min(1, (t - 0.4) / 0.6) : 0;
    if (childRingGroupRef.current) {
      childRingGroupRef.current.visible = nextReveal > 0.01;
      childRingGroupRef.current.scale.setScalar(Math.max(0.001, nextReveal));
    }
    if (axisStemRef.current) {
      axisStemRef.current.visible = nextReveal > 0.01;
      const mat = axisStemRef.current.material;
      if (!Array.isArray(mat) && 'opacity' in mat) {
        (mat as THREE.MeshBasicMaterial).opacity = 0.35 * nextReveal;
      }
    }
  });

  const isConfirmed = Boolean(confirmedBasicId);

  const handleSelectDyad = (id: string) => {
    const node = childNodes.find((item) => item.dyad.id === id);
    if (!node) {
      return;
    }
    setFrontDyadId(id);
    childSpinTargetRef.current = getHierarchySpinForAngle(node.angleRad);
  };

  return (
    <group>
      {!isConfirmed && (
        <group rotation={[HIERARCHY_WHEEL_TILT_X, 0, HIERARCHY_WHEEL_TILT_Z]}>
          <OrbitHintRing
            radius={HIERARCHY_BASIC_RING_RADIUS}
            y={HIERARCHY_BASIC_Y}
            color="#9eb6c9"
            opacity={0.28}
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
                isHovered={id === hoveredBasicId}
                interactive
                onSelect={(nextId) => onFrontBasicChange?.(nextId)}
                onHover={(nextId) => setHoveredBasicId(nextId)}
              />
            ))}
          </group>
        </group>
      )}

      {confirmedBasic && isConfirmed && (
        <group rotation={[HIERARCHY_WHEEL_TILT_X, 0, HIERARCHY_WHEEL_TILT_Z]}>
          <group ref={confirmedBasicGroupRef}>
            <mesh>
              <sphereGeometry args={[HIERARCHY_BASIC_SPHERE_RADIUS, 28, 28]} />
              <meshStandardMaterial
                color={confirmedBasic.color}
                emissive={confirmedBasic.color}
                emissiveIntensity={0.82}
                roughness={0.36}
                metalness={0.18}
              />
            </mesh>
            <Html
              center
              distanceFactor={18}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              <div
                style={{
                  color: confirmedBasic.color,
                  fontSize: '0.82rem',
                  fontWeight: 750,
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 10px rgba(0,0,0,0.85)',
                  textAlign: 'center',
                  transform: 'translateY(1.35rem)',
                }}
              >
                {confirmedBasic.label}
              </div>
            </Html>
          </group>

          <mesh
            ref={axisStemRef}
            visible={false}
            position={[0, HIERARCHY_CONFIRMED_AXIS_HEIGHT / 2, 0]}
          >
            <cylinderGeometry args={[0.02, 0.02, HIERARCHY_CONFIRMED_AXIS_HEIGHT, 8]} />
            <meshBasicMaterial
              color={confirmedBasic.color}
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </mesh>

          <group ref={childRingGroupRef} visible={false} scale={[0.001, 0.001, 0.001]}>
            <OrbitHintRing
              radius={HIERARCHY_BASIC_RING_RADIUS}
              y={HIERARCHY_BASIC_Y}
              color={confirmedBasic.color}
              opacity={0.4}
            />

            <group ref={childSpinGroupRef}>
              {childNodes.map(({ dyad, position, color, angleRad }) => {
                const [a, b] = dyad.components;
                const composition = `${getBasicEmotion(a).label}＋${getBasicEmotion(b).label}`;

                return (
                  <DyadEmotionSphere
                    key={dyad.id}
                    id={dyad.id}
                    position={position}
                    color={color}
                    label={dyad.label}
                    composition={composition}
                    angleRad={angleRad}
                    spinYRef={childSpinCurrentRef}
                    isFront={dyad.id === frontDyadId}
                    isHovered={hoveredDyadId === dyad.id}
                    onSelect={handleSelectDyad}
                    onHover={setHoveredDyadId}
                  />
                );
              })}
            </group>
          </group>
        </group>
      )}
    </group>
  );
}

export const HIERARCHY_DEFAULT_FRONT_BASIC_ID: BasicEmotionId = HIERARCHY_SLOT_BASIC_ID;
