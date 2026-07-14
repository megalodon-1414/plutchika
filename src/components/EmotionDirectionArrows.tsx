import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import * as THREE from 'three';
import { getEmotionById, type EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { getPrimaryEmotionColor, rowToEmotionParams } from '../utils/emotionPlotBridge';
import { getEmotionCenter } from '../utils/emotionSpaceLayout';
import {
  plotPositionFromRow,
  type PlotOrbitOverride,
} from '../utils/plotFromUserPlot';
import { countSecondaryDirectionsInSystem } from '../utils/warpGateRules';

/** WordPlot の球半径と揃える */
const PLOT_SPHERE_RADIUS = 0.032;
/** 三角形を球の外周に置く距離（中心＝単語中心） */
const TRIANGLE_ORBIT_RADIUS = PLOT_SPHERE_RADIUS * 1.28;
/** 小さな三角形の高さ */
const TRIANGLE_HEIGHT = PLOT_SPHERE_RADIUS * 0.28;
const TRIANGLE_HALF_WIDTH = TRIANGLE_HEIGHT * 0.48;
/** クリックしやすいよう見た目より大きい判定 */
const TRIANGLE_HIT_SCALE = 7.5;
/** 三角形〜ラベルまでを覆う縦方向のヒット拡張 */
const TRIANGLE_HIT_LENGTH_SCALE = 2.8;
/** 三角形先端より外側のラベルすき間 */
const LABEL_CLEARANCE = TRIANGLE_HEIGHT * 0.7;
const LABEL_FONT_SIZE_PX = 4;
const LABEL_DISTANCE_FACTOR = 2;

interface DirectionSpec {
  emotionId: EmotionId;
  role: 'pure' | 'secondary';
  color: string;
  label: string;
}

interface EmotionDirectionArrowsProps {
  plot: UserPlotRow;
  plots: readonly UserPlotRow[];
  orbitOverride?: PlotOrbitOverride;
  orbitTimeScale?: number;
  /** 三角形クリックでその方向をカメラが向く */
  onLookDirection?: (direction: [number, number, number]) => void;
  /** カメラドラッグとクリックが競合しないようにする */
  interactionLockRef?: MutableRefObject<boolean>;
}

function buildDirectionSpecs(
  plot: UserPlotRow,
  plots: readonly UserPlotRow[],
): DirectionSpec[] {
  const params = rowToEmotionParams(plot);

  if (params.isPure) {
    const counts = countSecondaryDirectionsInSystem(plots, params.primaryId);
    return [...counts.keys()]
      .sort((a, b) => getEmotionById(a).label.localeCompare(getEmotionById(b).label, 'ja'))
      .map((emotionId) => ({
        emotionId,
        role: 'secondary' as const,
        color: getPrimaryEmotionColor(emotionId),
        label: getEmotionById(emotionId).label,
      }));
  }

  return [
    {
      emotionId: params.primaryId,
      role: 'pure',
      color: getPrimaryEmotionColor(params.primaryId),
      label: getEmotionById(params.primaryId).label,
    },
    {
      emotionId: params.secondaryId,
      role: 'secondary',
      color: getPrimaryEmotionColor(params.secondaryId),
      label: getEmotionById(params.secondaryId).label,
    },
  ];
}

function createTriangleGeometry(scale = 1, lengthScale = 1): THREE.BufferGeometry {
  const height = TRIANGLE_HEIGHT * scale * lengthScale;
  const halfWidth = TRIANGLE_HALF_WIDTH * scale;
  const tipY = height * 0.55;
  const baseY = -TRIANGLE_HEIGHT * scale * 0.45;
  const positions = new Float32Array([
    0, tipY, 0,
    -halfWidth, baseY, 0,
    halfWidth, baseY, 0,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function DirectionTriangle({
  color,
  label,
  directionRef,
  geometry,
  hitGeometry,
  onLookDirection,
  interactionLockRef,
}: {
  color: string;
  label: string;
  directionRef: MutableRefObject<THREE.Vector3>;
  geometry: THREE.BufferGeometry;
  hitGeometry: THREE.BufferGeometry;
  onLookDirection?: (direction: [number, number, number]) => void;
  interactionLockRef?: MutableRefObject<boolean>;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const axisX = useRef(new THREE.Vector3());
  const axisY = useRef(new THREE.Vector3());
  const axisZ = useRef(new THREE.Vector3());
  const toCamera = useRef(new THREE.Vector3());
  const worldPos = useRef(new THREE.Vector3());

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const dir = directionRef.current;
    if (dir.lengthSq() < 0.0001) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.copy(dir).multiplyScalar(TRIANGLE_ORBIT_RADIUS);

    axisY.current.copy(dir);
    group.getWorldPosition(worldPos.current);
    toCamera.current.copy(camera.position).sub(worldPos.current);
    axisX.current.crossVectors(axisY.current, toCamera.current);
    if (axisX.current.lengthSq() < 1e-8) {
      axisX.current.crossVectors(axisY.current, camera.up);
    }
    axisX.current.normalize();
    axisZ.current.crossVectors(axisX.current, axisY.current).normalize();
    mat.makeBasis(axisX.current, axisY.current, axisZ.current);
    quat.setFromRotationMatrix(mat);
    group.quaternion.copy(quat);
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (interactionLockRef) {
      interactionLockRef.current = true;
    }
  };

  const handlePointerUp = () => {
    if (interactionLockRef) {
      interactionLockRef.current = false;
    }
  };

  const triggerLook = () => {
    const dir = directionRef.current;
    if (dir.lengthSq() < 0.0001 || !onLookDirection) {
      return;
    }
    onLookDirection([dir.x, dir.y, dir.z]);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    triggerLook();
    document.body.style.cursor = 'pointer';
  };

  const handleLabelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    if (interactionLockRef) {
      interactionLockRef.current = true;
    }
  };

  const handleLabelClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    triggerLook();
    if (interactionLockRef) {
      interactionLockRef.current = false;
    }
  };

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        geometry={hitGeometry}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
          if (interactionLockRef) {
            interactionLockRef.current = false;
          }
        }}
        onClick={handleClick}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Html
        position={[0, TRIANGLE_HEIGHT * 0.55 + LABEL_CLEARANCE, 0]}
        distanceFactor={LABEL_DISTANCE_FACTOR}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
          transform: 'translate(-50%, -100%)',
          cursor: 'pointer',
        }}
      >
        <div
          onPointerDown={handleLabelPointerDown}
          onPointerUp={handlePointerUp}
          onClick={handleLabelClick}
          style={{
            color,
            fontSize: `${LABEL_FONT_SIZE_PX}px`,
            fontWeight: 600,
            fontFamily: 'var(--font-family-app)',
            whiteSpace: 'nowrap',
            lineHeight: 1,
            textShadow: '0 0 4px rgba(0,0,0,0.9)',
            opacity: 0.92,
            padding: '6px 8px',
            cursor: 'pointer',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

/**
 * 選択中の単語の中心を原点に、球の周囲へ感情方向の小さな三角形を配置する。
 * - 混合: 純感情（主）方向と副感情方向
 * - 純: 星系内で移動可能な副感情方向
 */
export function EmotionDirectionArrows({
  plot,
  plots,
  orbitOverride,
  orbitTimeScale = 1,
  onLookDirection,
  interactionLockRef,
}: EmotionDirectionArrowsProps) {
  const rootRef = useRef<THREE.Group>(null);
  const plotPos = useRef(new THREE.Vector3());
  const toward = useRef(new THREE.Vector3());
  const specs = useMemo(() => buildDirectionSpecs(plot, plots), [plot, plots]);
  const directionRefs = useMemo(
    () => specs.map(() => ({ current: new THREE.Vector3() })),
    [specs],
  );
  const triangleGeometry = useMemo(() => createTriangleGeometry(1), []);
  const hitGeometry = useMemo(
    () => createTriangleGeometry(TRIANGLE_HIT_SCALE, TRIANGLE_HIT_LENGTH_SCALE),
    [],
  );

  useFrame((state) => {
    const root = rootRef.current;
    if (!root || specs.length === 0) return;

    plotPos.current.set(
      ...plotPositionFromRow(plot, state.clock.elapsedTime * orbitTimeScale, orbitOverride),
    );
    root.position.copy(plotPos.current);

    specs.forEach((spec, index) => {
      const center = getEmotionCenter(spec.emotionId);
      toward.current.set(center.x, center.y, center.z).sub(plotPos.current);
      if (toward.current.lengthSq() < 1e-8) {
        directionRefs[index].current.set(0, 0, 0);
        return;
      }
      toward.current.normalize();
      directionRefs[index].current.copy(toward.current);
    });
  });

  if (specs.length === 0) {
    return null;
  }

  return (
    <group ref={rootRef}>
      {specs.map((spec, index) => (
        <DirectionTriangle
          key={`${spec.role}:${spec.emotionId}`}
          color={spec.color}
          label={spec.label}
          directionRef={directionRefs[index]}
          geometry={triangleGeometry}
          hitGeometry={hitGeometry}
          onLookDirection={onLookDirection}
          interactionLockRef={interactionLockRef}
        />
      ))}
    </group>
  );
}
