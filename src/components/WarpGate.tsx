import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { getEmotionCenter } from '../utils/emotionSpaceLayout';
import { plotPositionFromRow, type PlotOrbitOverride } from '../utils/plotFromUserPlot';

const ACTIVE_GATE_DISTANCE_FROM_SOURCE = 0.12;
const PASSIVE_GATE_DISTANCE_FROM_SOURCE = 0.08;
const ACTIVE_GATE_LENGTH = 0.14;
const PASSIVE_GATE_LENGTH = 0.08;
const ACTIVE_GATE_RADIUS = 0.22;
const PASSIVE_GATE_RADIUS = 0.112;
const ACTIVE_GATE_RING_COUNT = 8;
const PASSIVE_GATE_RING_COUNT = 4;
const ACTIVE_GATE_RADIAL_COUNT = 18;
const PASSIVE_GATE_RADIAL_COUNT = 10;
/** 選択語付近の進入ヒット（ゲート本体より手前で確実に掴める） */
const APPROACH_HIT_RADIUS = 0.09;
const APPROACH_HIT_OFFSET = 0.055;

interface WarpGateProps {
  targetEmotionId: EmotionId;
  /** プロット追従ゲート用。星系端ゲートでは省略し sourceOverride を使う */
  plot?: UserPlotRow;
  orbitOverride?: PlotOrbitOverride;
  sourceOverride?: [number, number, number];
  /** true のとき source をそのままゲート位置にし、中心方向へ向ける（星系端用） */
  anchorAtSource?: boolean;
  /** 進入クリック用。遠方ゲートの手前で星に遮られないよう、選択語付近に置く */
  approachHitPlot?: UserPlotRow | null;
  approachHitOrbitOverride?: PlotOrbitOverride;
  color: string;
  hoverLabel: string;
  active?: boolean;
  onWarp?: () => void;
  onHoverLabelChange?: (label: string | null) => void;
  onHoverScreenPosition?: (point: { x: number; y: number; visible: boolean } | null) => void;
}

function createWormholeGridPositions(radius: number, length: number, ringCount: number, radialCount: number): Float32Array {
  const segments: number[] = [];

  for (let ring = 0; ring < ringCount; ring += 1) {
    const t = ring / Math.max(1, ringCount - 1);
    const z = t * length;
    const curvedTaper = 0.22 + 0.78 * Math.pow(1 - t, 1.85);
    const ringRadius = radius * curvedTaper;

    for (let i = 0; i < radialCount; i += 1) {
      const angleA = (i / radialCount) * Math.PI * 2;
      const angleB = ((i + 1) / radialCount) * Math.PI * 2;
      segments.push(
        Math.cos(angleA) * ringRadius,
        Math.sin(angleA) * ringRadius,
        z,
        Math.cos(angleB) * ringRadius,
        Math.sin(angleB) * ringRadius,
        z,
      );
    }
  }

  for (let i = 0; i < radialCount; i += 1) {
    const angle = (i / radialCount) * Math.PI * 2;
    for (let ring = 0; ring < ringCount - 1; ring += 1) {
      const tA = ring / Math.max(1, ringCount - 1);
      const tB = (ring + 1) / Math.max(1, ringCount - 1);
      const zA = tA * length;
      const zB = tB * length;
      const radiusA = radius * (0.22 + 0.78 * Math.pow(1 - tA, 1.85));
      const radiusB = radius * (0.22 + 0.78 * Math.pow(1 - tB, 1.85));
      segments.push(
        Math.cos(angle) * radiusA,
        Math.sin(angle) * radiusA,
        zA,
        Math.cos(angle) * radiusB,
        Math.sin(angle) * radiusB,
        zB,
      );
    }
  }

  return new Float32Array(segments);
}

export function WarpGate({
  targetEmotionId,
  plot,
  orbitOverride,
  sourceOverride,
  anchorAtSource = false,
  approachHitPlot = null,
  approachHitOrbitOverride,
  color,
  hoverLabel,
  active = false,
  onWarp,
  onHoverLabelChange,
  onHoverScreenPosition,
}: WarpGateProps) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const approachHitRef = useRef<THREE.Mesh>(null);
  const isHovered = useRef(false);
  const sizeProgress = useRef(active ? 1 : 0);
  const source = useRef(new THREE.Vector3());
  const approachPos = useRef(new THREE.Vector3());
  const approachDir = useRef(new THREE.Vector3());
  const target = useMemo(() => {
    const center = getEmotionCenter(targetEmotionId);
    return new THREE.Vector3(center.x, center.y, center.z);
  }, [targetEmotionId]);
  const direction = useRef(new THREE.Vector3());
  const gatePosition = useRef(new THREE.Vector3());
  const exitPosition = useRef(new THREE.Vector3());
  const projected = useRef(new THREE.Vector3());
  const baseQuaternion = useRef(new THREE.Quaternion());
  const spinQuaternion = useRef(new THREE.Quaternion());
  const localForward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const lineColor = useMemo(() => new THREE.Color(color), [color]);
  const radius = active ? ACTIVE_GATE_RADIUS : PASSIVE_GATE_RADIUS;
  const length = active ? ACTIVE_GATE_LENGTH : PASSIVE_GATE_LENGTH;
  const gridPositions = useMemo(
    () =>
      createWormholeGridPositions(
        radius,
        length,
        active ? ACTIVE_GATE_RING_COUNT : PASSIVE_GATE_RING_COUNT,
        active ? ACTIVE_GATE_RADIAL_COUNT : PASSIVE_GATE_RADIAL_COUNT,
      ),
    [active, length, radius],
  );

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (sourceOverride) {
      source.current.set(...sourceOverride);
    } else if (plot) {
      source.current.set(...plotPositionFromRow(plot, state.clock.elapsedTime, orbitOverride));
    } else {
      return;
    }

    direction.current.copy(target).sub(source.current);
    if (direction.current.lengthSq() < 0.0001) {
      return;
    }

    direction.current.normalize();
    if (anchorAtSource) {
      gatePosition.current.copy(source.current);
    } else {
      gatePosition.current.copy(source.current).addScaledVector(
        direction.current,
        active ? ACTIVE_GATE_DISTANCE_FROM_SOURCE : PASSIVE_GATE_DISTANCE_FROM_SOURCE,
      );
    }
    baseQuaternion.current.setFromUnitVectors(localForward, direction.current);
    spinQuaternion.current.setFromAxisAngle(localForward, state.clock.elapsedTime * (active ? 0.55 : 0.18));
    sizeProgress.current = THREE.MathUtils.lerp(sizeProgress.current, active ? 1 : 0, 1 - Math.exp(-7 * delta));
    const animatedScale = THREE.MathUtils.lerp(0.55, 1, sizeProgress.current);

    group.position.copy(gatePosition.current);
    group.quaternion.copy(baseQuaternion.current).multiply(spinQuaternion.current);
    group.scale.setScalar(animatedScale * (1 + Math.sin(state.clock.elapsedTime * (active ? 2.1 : 1.2)) * 0.035));

    if (isHovered.current && active) {
      group.localToWorld(exitPosition.current.set(0, 0, length));
      projected.current.copy(exitPosition.current).project(camera);
      onHoverScreenPosition?.({
        x: (projected.current.x * 0.5 + 0.5) * size.width,
        y: (-projected.current.y * 0.5 + 0.5) * size.height,
        visible: projected.current.z >= -1 && projected.current.z <= 1,
      });
    }

    const approachHit = approachHitRef.current;
    if (approachHit && active && approachHitPlot) {
      approachPos.current.set(
        ...plotPositionFromRow(
          approachHitPlot,
          state.clock.elapsedTime,
          approachHitOrbitOverride,
        ),
      );
      approachDir.current.copy(gatePosition.current).sub(approachPos.current);
      if (approachDir.current.lengthSq() > 1e-8) {
        approachDir.current.normalize();
        approachPos.current.addScaledVector(approachDir.current, APPROACH_HIT_OFFSET);
      }
      approachHit.position.copy(approachPos.current);
      approachHit.visible = true;
    } else if (approachHit) {
      approachHit.visible = false;
    }
  });

  const bindWarpPointer = {
    onClick: (event: { stopPropagation: () => void }) => {
      if (!active) {
        return;
      }
      event.stopPropagation();
      onWarp?.();
    },
    onPointerOver: (event: { stopPropagation: () => void }) => {
      if (!active) {
        return;
      }
      event.stopPropagation();
      document.body.style.cursor = 'pointer';
      isHovered.current = true;
      onHoverLabelChange?.(hoverLabel);
    },
    onPointerOut: () => {
      document.body.style.cursor = 'auto';
      isHovered.current = false;
      onHoverLabelChange?.(null);
      onHoverScreenPosition?.(null);
    },
  };

  return (
    <>
    <group ref={groupRef}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[gridPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color={lineColor}
          transparent
          opacity={active ? 0.78 : 0.36}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <mesh position={[0, 0, length * 0.45]} {...bindWarpPointer}>
        {/* 見た目より大きい当たり判定（手前の星に遮られにくい） */}
        <sphereGeometry args={[Math.max(radius * 4.5, 0.28), 16, 16]} />
        <meshBasicMaterial
          color={lineColor}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, length]}>
        <circleGeometry args={[radius * (active ? 0.42 : 0.32), active ? 24 : 10]} />
        <meshBasicMaterial
          color={lineColor}
          transparent
          opacity={active ? 0.08 : 0.025}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
    {active ? (
      <mesh ref={approachHitRef} {...bindWarpPointer}>
        <sphereGeometry args={[APPROACH_HIT_RADIUS, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
    ) : null}
    </>
  );
}
