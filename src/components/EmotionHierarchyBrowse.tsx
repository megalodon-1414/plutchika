import { useEffect, useMemo, useRef, useState, type MutableRefObject, type Ref } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getBasicEmotion,
  getEmotionById,
  type BasicEmotionId,
  type EmotionId,
} from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { getPlotKey } from '../utils/plotIdentity';
import { plotColorFromRow } from '../utils/plotFromUserPlot';
import {
  HIERARCHY_BASIC_RING_RADIUS,
  HIERARCHY_BASIC_SPHERE_RADIUS,
  HIERARCHY_BASIC_Y,
  HIERARCHY_CHILD_SPHERE_RADIUS,
  HIERARCHY_CONFIRMED_AXIS_HEIGHT,
  HIERARCHY_CONFIRMED_BASIC_SCALE,
  HIERARCHY_CONFIRMED_DYAD_SCALE,
  HIERARCHY_CONFIRMED_MOVE_LERP,
  HIERARCHY_DYAD_DESCEND_LERP,
  HIERARCHY_DYAD_UNFOLD_LERP,
  HIERARCHY_DYAD_UNFOLD_SPINS,
  HIERARCHY_FRONT_LOCAL_ANGLE,
  HIERARCHY_FRONT_SPHERE_SCALE,
  HIERARCHY_IDLE_SPHERE_SCALE,
  HIERARCHY_SLOT_BASIC_ID,
  HIERARCHY_SPIN_LERP,
  HIERARCHY_WHEEL_TILT_X,
  HIERARCHY_WHEEL_TILT_Z,
  HIERARCHY_WORD_SPHERE_RADIUS,
  getConfirmedBasicAxisLocal,
  getConfirmedChildRingPositions,
  getConfirmedDyadAxisLocal,
  getHierarchyBasicCenters,
  getHierarchySpinForAngle,
  getHierarchySpinForBasic,
  getHierarchyWordRingPositions,
  hierarchyDepthFactor,
  shortestAngleDelta,
} from '../utils/emotionHierarchyLayout';

interface EmotionHierarchyBrowseProps {
  frontBasicId: BasicEmotionId;
  confirmedBasicId?: BasicEmotionId | null;
  frontDyadId?: EmotionId | null;
  confirmedDyadId?: EmotionId | null;
  plots?: UserPlotRow[];
  onFrontBasicChange?: (id: BasicEmotionId) => void;
  onFrontDyadChange?: (id: EmotionId) => void;
  onFrontWordChange?: (key: string | null) => void;
}

function OrbitHintRing({
  radius,
  y,
  color,
  opacity,
  materialRef,
}: {
  radius: number;
  y: number;
  color: string;
  opacity: number;
  materialRef?: MutableRefObject<THREE.LineBasicMaterial | null>;
}) {
  const points = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
    return curve.getPoints(64).map((p) => new THREE.Vector3(p.x, y, p.y));
  }, [radius, y]);

  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </lineLoop>
  );
}

function EmotionCrystalShape({
  color,
  emissiveIntensity,
  matRef,
  interactive,
  onSelect,
  onHover,
}: {
  color: string;
  emissiveIntensity: number;
  matRef?: MutableRefObject<THREE.MeshStandardMaterial | null>;
  interactive?: boolean;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
}) {
  const spinRef = useRef<THREE.Group>(null);
  const lineMatRef = useRef<THREE.LineBasicMaterial>(null);
  // detail 2: 面の多い多面体（ワイヤーフレームの骨格）
  const geometry = useMemo(
    () => new THREE.IcosahedronGeometry(HIERARCHY_BASIC_SPHERE_RADIUS, 2),
    [],
  );
  const wire = useMemo(() => new THREE.WireframeGeometry(geometry), [geometry]);

  useFrame((_, delta) => {
    if (spinRef.current) {
      spinRef.current.rotation.y += delta * 0.32;
      spinRef.current.rotation.x += delta * 0.11;
    }
    if (lineMatRef.current) {
      lineMatRef.current.opacity = THREE.MathUtils.clamp(
        0.55 + emissiveIntensity * 0.35,
        0.55,
        0.95,
      );
    }
  });

  return (
    <group ref={spinRef}>
      {/* 半透明の体積＋クリック判定 */}
      <mesh
        geometry={geometry}
        onClick={(event) => {
          if (!interactive) {
            return;
          }
          event.stopPropagation();
          onSelect?.();
        }}
        onPointerOver={(event) => {
          if (!interactive) {
            return;
          }
          event.stopPropagation();
          onHover?.(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (!interactive) {
            return;
          }
          onHover?.(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={0.18}
          roughness={0.28}
          metalness={0.35}
          flatShading
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 線で構成された骨格 */}
      <lineSegments geometry={wire} raycast={() => null}>
        <lineBasicMaterial
          ref={lineMatRef}
          color={color}
          transparent
          opacity={0.78}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={wire} scale={1.02} raycast={() => null}>
        <lineBasicMaterial
          color="#f7fbff"
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </lineSegments>
    </group>
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

  useFrame(() => {
    const depth = hierarchyDepthFactor(angleRad, spinYRef.current);
    if (matRef.current) {
      matRef.current.opacity = isFront ? 0.26 : THREE.MathUtils.lerp(0.12, 0.2, depth);
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
    <group position={[position.x, position.y, position.z]} scale={scale}>
      <EmotionCrystalShape
        color={color}
        emissiveIntensity={0.28}
        matRef={matRef}
        interactive={interactive}
        onSelect={() => onSelect(id)}
        onHover={(hovered) => onHover(hovered ? id : null)}
      />
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

function RingItemSphere({
  groupRef,
  position,
  color,
  label,
  sublabel,
  angleRad,
  spinYRef,
  isFront,
  isHovered,
  baseRadius,
  interactive = true,
  labelVisible = true,
  /** true のとき球体サイズは常に idle（グループ側で拡大を足す） */
  lockIdleSize = false,
  onSelect,
  onHover,
}: {
  groupRef?: Ref<THREE.Group>;
  position: { x: number; y: number; z: number };
  color: string;
  label: string;
  sublabel?: string;
  angleRad: number;
  spinYRef: MutableRefObject<number>;
  isFront: boolean;
  isHovered: boolean;
  baseRadius: number;
  interactive?: boolean;
  labelVisible?: boolean;
  lockIdleSize?: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const sizeScale = lockIdleSize
    ? HIERARCHY_IDLE_SPHERE_SCALE
    : (isFront ? HIERARCHY_FRONT_SPHERE_SCALE : HIERARCHY_IDLE_SPHERE_SCALE);
  const scale = sizeScale * (isHovered && !isFront ? 1.1 : 1);
  const radius = baseRadius * scale;

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
      const show = labelVisible && (isFront || depth > 0.15);
      labelRef.current.style.opacity = String(
        show ? (isFront ? 1 : THREE.MathUtils.lerp(0.55, 0.92, depth)) : 0,
      );
      labelRef.current.style.fontSize = isFront ? '0.9rem' : '0.66rem';
    }
  });

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]}>
      <mesh
        onClick={(event) => {
          if (!interactive) {
            return;
          }
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={(event) => {
          if (!interactive) {
            return;
          }
          event.stopPropagation();
          onHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (!interactive) {
            return;
          }
          onHover(false);
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
            opacity: 0,
          }}
        >
          {label}
          {sublabel && (isFront || isHovered) && (
            <span
              style={{
                display: 'block',
                marginTop: 2,
                fontSize: isFront ? '0.56rem' : '0.5rem',
                fontWeight: 500,
                color: 'rgba(230,236,244,0.88)',
              }}
            >
              {sublabel}
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

function AxisEmotionBadge({
  color,
  label,
  groupRef,
  polyhedron = false,
}: {
  color: string;
  label: string;
  groupRef: MutableRefObject<THREE.Group | null>;
  polyhedron?: boolean;
}) {
  return (
    <group ref={groupRef}>
      {polyhedron ? (
        <EmotionCrystalShape color={color} emissiveIntensity={0.82} />
      ) : (
        <mesh>
          <sphereGeometry args={[HIERARCHY_BASIC_SPHERE_RADIUS, 28, 28]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.82}
            roughness={0.36}
            metalness={0.18}
          />
        </mesh>
      )}
      <Html
        center
        distanceFactor={18}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          style={{
            color,
            fontSize: '0.82rem',
            fontWeight: 750,
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
            textShadow: '0 0 10px rgba(0,0,0,0.85)',
            textAlign: 'center',
            transform: 'translateY(1.35rem)',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

function blendHex(a: string, b: string): string {
  const parse = (hex: string) => {
    const value = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex((ar + br) / 2)}${toHex((ag + bg) / 2)}${toHex((ab + bb) / 2)}`;
}

export function EmotionHierarchyBrowse({
  frontBasicId,
  confirmedBasicId = null,
  frontDyadId = null,
  confirmedDyadId = null,
  plots = [],
  onFrontBasicChange,
  onFrontDyadChange,
  onFrontWordChange,
}: EmotionHierarchyBrowseProps) {
  const basics = useMemo(() => getHierarchyBasicCenters(), []);
  const spinGroupRef = useRef<THREE.Group>(null);
  const childSpinGroupRef = useRef<THREE.Group>(null);
  const wordSpinGroupRef = useRef<THREE.Group>(null);
  const confirmedBasicGroupRef = useRef<THREE.Group>(null);
  const confirmedDyadGroupRef = useRef<THREE.Group>(null);
  const childRingGroupRef = useRef<THREE.Group>(null);
  const wordRingGroupRef = useRef<THREE.Group>(null);
  const axisStemRef = useRef<THREE.Mesh>(null);
  const seedGroupRef = useRef<THREE.Group>(null);
  const seedMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const dyadSphereRefs = useRef<Array<THREE.Group | null>>([]);
  const orbitHintMatRef = useRef<THREE.LineBasicMaterial>(null);
  const spinCurrentRef = useRef(getHierarchySpinForBasic(frontBasicId));
  const spinTargetRef = useRef(getHierarchySpinForBasic(frontBasicId));
  const childSpinCurrentRef = useRef(0);
  const childSpinTargetRef = useRef(0);
  const wordSpinCurrentRef = useRef(0);
  const wordSpinTargetRef = useRef(0);
  const confirmProgressRef = useRef(0);
  const dyadConfirmProgressRef = useRef(0);
  const dyadDescendProgressRef = useRef(0);
  const dyadUnfoldProgressRef = useRef(0);
  const dyadSizeEmphasisRef = useRef(0);
  const dyadIntroPlayedRef = useRef(false);
  const [dyadRingReady, setDyadRingReady] = useState(false);
  const [hoveredBasicId, setHoveredBasicId] = useState<BasicEmotionId | null>(null);
  const [hoveredDyadId, setHoveredDyadId] = useState<string | null>(null);
  const [hoveredWordKey, setHoveredWordKey] = useState<string | null>(null);
  const [frontWordKey, setFrontWordKey] = useState<string | null>(null);

  const slotLocal = useMemo(
    () => ({
      x: HIERARCHY_BASIC_RING_RADIUS * Math.cos(HIERARCHY_FRONT_LOCAL_ANGLE),
      y: HIERARCHY_BASIC_Y,
      z: HIERARCHY_BASIC_RING_RADIUS * Math.sin(HIERARCHY_FRONT_LOCAL_ANGLE),
    }),
    [],
  );
  const axisLocal = useMemo(() => getConfirmedBasicAxisLocal(), []);
  const dyadAxisLocal = useMemo(() => getConfirmedDyadAxisLocal(), []);

  const confirmedBasic = confirmedBasicId ? getBasicEmotion(confirmedBasicId) : null;
  const childNodes = useMemo(
    () => (confirmedBasicId ? getConfirmedChildRingPositions(confirmedBasicId) : []),
    [confirmedBasicId],
  );
  const activeFrontDyadId = frontDyadId ?? childNodes[0]?.dyad.id ?? null;
  const confirmedDyadEmotion = confirmedDyadId ? getEmotionById(confirmedDyadId) : null;
  const confirmedDyadColor = useMemo(() => {
    if (!confirmedDyadEmotion || !('components' in confirmedDyadEmotion)) {
      return '#9eb6c9';
    }
    const [a, b] = confirmedDyadEmotion.components;
    return blendHex(getBasicEmotion(a).color, getBasicEmotion(b).color);
  }, [confirmedDyadEmotion]);

  const wordPlots = useMemo(
    () => (confirmedDyadId ? plots.filter((plot) => plot.primaryId === confirmedDyadId) : []),
    [confirmedDyadId, plots],
  );
  const wordNodes = useMemo(() => {
    const slots = getHierarchyWordRingPositions(wordPlots.length);
    return wordPlots.map((plot, index) => ({
      plot,
      key: getPlotKey(plot),
      color: plotColorFromRow(plot),
      angleRad: slots[index]?.angleRad ?? 0,
      position: slots[index]?.position ?? { x: 0, y: 0, z: 0 },
    }));
  }, [wordPlots]);

  const onFrontDyadChangeRef = useRef(onFrontDyadChange);
  onFrontDyadChangeRef.current = onFrontDyadChange;
  const onFrontWordChangeRef = useRef(onFrontWordChange);
  onFrontWordChangeRef.current = onFrontWordChange;

  useEffect(() => {
    onFrontWordChangeRef.current?.(frontWordKey);
  }, [frontWordKey]);

  useEffect(() => {
    spinTargetRef.current = getHierarchySpinForBasic(frontBasicId);
  }, [frontBasicId]);

  // 合成感情ステージ入場時だけスピンを初期化（毎レンダーで current を潰さない）
  useEffect(() => {
    if (!confirmedBasicId || childNodes.length === 0 || confirmedDyadId) {
      if (!confirmedBasicId) {
        childSpinCurrentRef.current = 0;
        childSpinTargetRef.current = 0;
        if (childSpinGroupRef.current) {
          childSpinGroupRef.current.rotation.y = 0;
        }
      }
      return;
    }

    const existing = frontDyadId
      ? childNodes.find((node) => node.dyad.id === frontDyadId)
      : undefined;
    const preferred = existing ?? childNodes[0];
    if (!existing) {
      onFrontDyadChangeRef.current?.(preferred.dyad.id);
    }
    const spin = getHierarchySpinForAngle(preferred.angleRad);
    childSpinCurrentRef.current = spin;
    childSpinTargetRef.current = spin;
    if (childSpinGroupRef.current) {
      childSpinGroupRef.current.rotation.y = spin;
    }
    // frontDyadId はクリック時に target だけ更新。入場・復帰時の初期化専用。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedBasicId, confirmedDyadId, childNodes]);

  useEffect(() => {
    if (!confirmedDyadId || wordNodes.length === 0) {
      if (!confirmedDyadId) {
        setFrontWordKey(null);
        wordSpinCurrentRef.current = 0;
        wordSpinTargetRef.current = 0;
        if (wordSpinGroupRef.current) {
          wordSpinGroupRef.current.rotation.y = 0;
        }
      }
      return;
    }

    const existing = frontWordKey
      ? wordNodes.find((node) => node.key === frontWordKey)
      : undefined;
    const preferred = existing ?? wordNodes[0];
    if (!existing) {
      setFrontWordKey(preferred.key);
    }
    const spin = getHierarchySpinForAngle(preferred.angleRad);
    wordSpinCurrentRef.current = spin;
    wordSpinTargetRef.current = spin;
    if (wordSpinGroupRef.current) {
      wordSpinGroupRef.current.rotation.y = spin;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedDyadId, wordNodes.length]);

  useEffect(() => {
    if (!confirmedBasicId) {
      confirmProgressRef.current = 0;
      dyadConfirmProgressRef.current = 0;
      dyadDescendProgressRef.current = 0;
      dyadUnfoldProgressRef.current = 0;
      dyadSizeEmphasisRef.current = 0;
      dyadIntroPlayedRef.current = false;
      setDyadRingReady(false);
      if (childRingGroupRef.current) {
        childRingGroupRef.current.visible = false;
      }
      if (wordRingGroupRef.current) {
        wordRingGroupRef.current.visible = false;
        wordRingGroupRef.current.scale.setScalar(0.001);
      }
      if (axisStemRef.current) {
        axisStemRef.current.visible = false;
      }
      if (seedGroupRef.current) {
        seedGroupRef.current.visible = false;
      }
      return;
    }
    confirmProgressRef.current = 0;
    dyadDescendProgressRef.current = dyadIntroPlayedRef.current ? 1 : 0;
    dyadUnfoldProgressRef.current = dyadIntroPlayedRef.current ? 1 : 0;
    dyadSizeEmphasisRef.current = dyadIntroPlayedRef.current ? 1 : 0;
    setDyadRingReady(dyadIntroPlayedRef.current);
    if (confirmedBasicGroupRef.current) {
      confirmedBasicGroupRef.current.position.set(slotLocal.x, slotLocal.y, slotLocal.z);
      confirmedBasicGroupRef.current.scale.setScalar(HIERARCHY_FRONT_SPHERE_SCALE);
    }
  }, [confirmedBasicId, slotLocal.x, slotLocal.y, slotLocal.z]);

  useEffect(() => {
    if (!confirmedDyadId) {
      dyadConfirmProgressRef.current = 0;
      if (wordRingGroupRef.current) {
        wordRingGroupRef.current.visible = false;
        wordRingGroupRef.current.scale.setScalar(0.001);
      }
      // 単語ステージから戻ったら導入は再生せず完成形へ
      if (confirmedBasicId && dyadIntroPlayedRef.current) {
        dyadDescendProgressRef.current = 1;
        dyadUnfoldProgressRef.current = 1;
        dyadSizeEmphasisRef.current = 1;
        setDyadRingReady(true);
      }
      return;
    }
    dyadConfirmProgressRef.current = 0;
    if (confirmedDyadGroupRef.current) {
      confirmedDyadGroupRef.current.position.set(slotLocal.x, slotLocal.y, slotLocal.z);
      confirmedDyadGroupRef.current.scale.setScalar(HIERARCHY_FRONT_SPHERE_SCALE);
    }
  }, [confirmedDyadId, confirmedBasicId, slotLocal.x, slotLocal.y, slotLocal.z]);

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

    const moveBlend = 1 - Math.exp(-HIERARCHY_CONFIRMED_MOVE_LERP * delta);
    const targetProgress = confirmedBasicId ? 1 : 0;
    confirmProgressRef.current += (targetProgress - confirmProgressRef.current) * moveBlend;
    const t = confirmProgressRef.current;
    const ease = t * t * (3 - 2 * t);

    if (confirmedBasicGroupRef.current) {
      confirmedBasicGroupRef.current.position.set(
        THREE.MathUtils.lerp(slotLocal.x, axisLocal.x, ease),
        THREE.MathUtils.lerp(slotLocal.y, axisLocal.y, ease),
        THREE.MathUtils.lerp(slotLocal.z, axisLocal.z, ease),
      );
      confirmedBasicGroupRef.current.scale.setScalar(
        THREE.MathUtils.lerp(HIERARCHY_FRONT_SPHERE_SCALE, HIERARCHY_CONFIRMED_BASIC_SCALE, ease),
      );
    }

    // 主感情の軸への移動と同時に、種球が主感情からほどけてリング平面へ下降
    if (confirmedBasicId && !confirmedDyadId) {
      const descendBlend = 1 - Math.exp(-HIERARCHY_DYAD_DESCEND_LERP * delta);
      dyadDescendProgressRef.current += (1 - dyadDescendProgressRef.current) * descendBlend;

      const descend = dyadDescendProgressRef.current;
      const descendEase = descend * descend * (3 - 2 * descend);
      const canUnfold = descend > 0.92 || dyadIntroPlayedRef.current;
      if (canUnfold) {
        const unfoldBlend = 1 - Math.exp(-HIERARCHY_DYAD_UNFOLD_LERP * delta);
        dyadUnfoldProgressRef.current += (1 - dyadUnfoldProgressRef.current) * unfoldBlend;
      }

      const unfold = dyadUnfoldProgressRef.current;
      const unfoldEase = unfold * unfold * (3 - 2 * unfold);
      const n = Math.max(childNodes.length, 1);

      // 移動中の主感情位置から軸中心・リング平面へ同時に降りる
      const basicX = THREE.MathUtils.lerp(slotLocal.x, axisLocal.x, ease);
      const basicY = THREE.MathUtils.lerp(slotLocal.y, axisLocal.y, ease);
      const basicZ = THREE.MathUtils.lerp(slotLocal.z, axisLocal.z, ease);
      if (seedGroupRef.current) {
        const seedVisible = (descend > 0.01 || ease > 0.02) && unfold < 0.2;
        seedGroupRef.current.visible = seedVisible;
        seedGroupRef.current.position.set(
          THREE.MathUtils.lerp(basicX, 0, descendEase),
          THREE.MathUtils.lerp(basicY, HIERARCHY_BASIC_Y, descendEase),
          THREE.MathUtils.lerp(basicZ, 0, descendEase),
        );
        const seedScale = THREE.MathUtils.lerp(0.35, 1, Math.min(1, Math.max(ease, descendEase) * 1.4));
        seedGroupRef.current.scale.setScalar(
          seedScale * (1 - Math.max(0, unfoldEase - 0.05) / 0.15),
        );
        if (seedMatRef.current) {
          seedMatRef.current.opacity = seedVisible ? 1 - Math.min(1, unfoldEase / 0.2) : 0;
        }
      }

      // 軸まわり回転しながら半径を広げ、枚数を増やす
      const spinOffset = (1 - unfoldEase) * HIERARCHY_DYAD_UNFOLD_SPINS * Math.PI * 2;
      if (childSpinGroupRef.current) {
        if (unfold < 0.995) {
          childSpinCurrentRef.current = childSpinTargetRef.current + spinOffset;
          childSpinGroupRef.current.rotation.y = childSpinCurrentRef.current;
        } else {
          const deltaAngle = shortestAngleDelta(childSpinCurrentRef.current, childSpinTargetRef.current);
          const blend = 1 - Math.exp(-HIERARCHY_SPIN_LERP * delta);
          childSpinCurrentRef.current += deltaAngle * blend;
          childSpinGroupRef.current.rotation.y = childSpinCurrentRef.current;
          if (Math.abs(deltaAngle) < 0.012) {
            childSpinCurrentRef.current = childSpinTargetRef.current;
            childSpinGroupRef.current.rotation.y = childSpinCurrentRef.current;
          }
          if (!dyadIntroPlayedRef.current && unfold > 0.995) {
            dyadIntroPlayedRef.current = true;
            setDyadRingReady(true);
          }
        }
      }

      const sizeEmphasis = unfoldEase;
      dyadSizeEmphasisRef.current = sizeEmphasis;
      const frontBoost = HIERARCHY_FRONT_SPHERE_SCALE / HIERARCHY_IDLE_SPHERE_SCALE;

      childNodes.forEach((node, index) => {
        const sphere = dyadSphereRefs.current[index];
        if (!sphere) {
          return;
        }
        // 重なりから順番にほどけていく出現
        const appearStart = index / n;
        const appearSpan = Math.max(0.35, 1 - appearStart * 0.45);
        const appear = THREE.MathUtils.clamp((unfoldEase - appearStart * 0.55) / appearSpan, 0, 1);
        const appearEase = appear * appear * (3 - 2 * appear);
        const radius = HIERARCHY_BASIC_RING_RADIUS * appearEase * unfoldEase;
        sphere.visible = descend > 0.5 && appearEase > 0.02;
        sphere.position.set(
          node.position.x * (radius / HIERARCHY_BASIC_RING_RADIUS),
          HIERARCHY_BASIC_Y,
          node.position.z * (radius / HIERARCHY_BASIC_RING_RADIUS),
        );
        const unfoldScale = THREE.MathUtils.lerp(0.55, 1, appearEase);
        const isFront = node.dyad.id === activeFrontDyadId;
        const accent = isFront
          ? THREE.MathUtils.lerp(1, frontBoost, sizeEmphasis)
          : 1;
        sphere.scale.setScalar(unfoldScale * accent);
      });

      if (childRingGroupRef.current) {
        childRingGroupRef.current.visible = descend > 0.45 || unfold > 0.01;
      }
      if (orbitHintMatRef.current) {
        orbitHintMatRef.current.opacity = 0.4 * unfoldEase;
      }
    }

    const wordSpinGroup = wordSpinGroupRef.current;
    if (wordSpinGroup && confirmedDyadId) {
      const deltaAngle = shortestAngleDelta(wordSpinCurrentRef.current, wordSpinTargetRef.current);
      const blend = 1 - Math.exp(-HIERARCHY_SPIN_LERP * delta);
      wordSpinCurrentRef.current += deltaAngle * blend;
      wordSpinGroup.rotation.y = wordSpinCurrentRef.current;
      if (Math.abs(deltaAngle) < 0.012) {
        wordSpinCurrentRef.current = wordSpinTargetRef.current;
        wordSpinGroup.rotation.y = wordSpinCurrentRef.current;
      }
    }

    const dyadTargetProgress = confirmedDyadId ? 1 : 0;
    dyadConfirmProgressRef.current += (dyadTargetProgress - dyadConfirmProgressRef.current) * moveBlend;
    const dt = dyadConfirmProgressRef.current;
    const dyadEase = dt * dt * (3 - 2 * dt);

    if (confirmedDyadGroupRef.current) {
      confirmedDyadGroupRef.current.position.set(
        THREE.MathUtils.lerp(slotLocal.x, dyadAxisLocal.x, dyadEase),
        THREE.MathUtils.lerp(slotLocal.y, dyadAxisLocal.y, dyadEase),
        THREE.MathUtils.lerp(slotLocal.z, dyadAxisLocal.z, dyadEase),
      );
      confirmedDyadGroupRef.current.scale.setScalar(
        THREE.MathUtils.lerp(HIERARCHY_FRONT_SPHERE_SCALE, HIERARCHY_CONFIRMED_DYAD_SCALE, dyadEase),
      );
    }

    const wordReveal = confirmedDyadId && dt > 0.4 ? Math.min(1, (dt - 0.4) / 0.6) : 0;
    if (wordRingGroupRef.current) {
      wordRingGroupRef.current.visible = wordReveal > 0.01;
      wordRingGroupRef.current.scale.setScalar(Math.max(0.001, wordReveal));
    }

    if (axisStemRef.current) {
      const descend = dyadDescendProgressRef.current;
      const unfold = dyadUnfoldProgressRef.current;
      const stemVisible =
        (Boolean(confirmedBasicId) && (ease > 0.5 || descend > 0.01))
        || (Boolean(confirmedDyadId) && dt > 0.01);
      axisStemRef.current.visible = stemVisible;
      const mat = axisStemRef.current.material;
      if (!Array.isArray(mat) && 'opacity' in mat) {
        const opacityBase = confirmedDyadId ? 0.4 : 0.35;
        (mat as THREE.MeshBasicMaterial).opacity =
          opacityBase * Math.max(ease, descend, unfold, confirmedDyadId ? Math.max(dt, wordReveal) : 0);
      }
    }
  });

  const isConfirmed = Boolean(confirmedBasicId);
  const isDyadConfirmed = Boolean(confirmedDyadId);

  const handleSelectDyad = (id: EmotionId) => {
    if (!dyadRingReady) {
      return;
    }
    const node = childNodes.find((item) => item.dyad.id === id);
    if (!node) {
      return;
    }
    childSpinTargetRef.current = getHierarchySpinForAngle(node.angleRad);
    onFrontDyadChange?.(id);
  };

  const handleSelectWord = (key: string, angleRad: number) => {
    setFrontWordKey(key);
    wordSpinTargetRef.current = getHierarchySpinForAngle(angleRad);
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
          <AxisEmotionBadge
            groupRef={confirmedBasicGroupRef}
            color={confirmedBasic.color}
            label={confirmedBasic.label}
            polyhedron
          />

          {isDyadConfirmed && confirmedDyadEmotion && (
            <AxisEmotionBadge
              groupRef={confirmedDyadGroupRef}
              color={confirmedDyadColor}
              label={confirmedDyadEmotion.label}
            />
          )}

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

          {!isDyadConfirmed && (
            <>
              {/* 主感情上で生成され、軸に沿って下降する種球 */}
              <group ref={seedGroupRef} visible={false}>
                <mesh>
                  <sphereGeometry args={[HIERARCHY_CHILD_SPHERE_RADIUS, 24, 24]} />
                  <meshStandardMaterial
                    ref={seedMatRef}
                    color={confirmedBasic.color}
                    emissive={confirmedBasic.color}
                    emissiveIntensity={0.7}
                    transparent
                    opacity={1}
                    roughness={0.4}
                    metalness={0.18}
                  />
                </mesh>
              </group>

              <group ref={childRingGroupRef} visible={false}>
                <OrbitHintRing
                  radius={HIERARCHY_BASIC_RING_RADIUS}
                  y={HIERARCHY_BASIC_Y}
                  color={confirmedBasic.color}
                  opacity={0}
                  materialRef={orbitHintMatRef}
                />

                <group ref={childSpinGroupRef}>
                  {childNodes.map(({ dyad, color, angleRad }, index) => {
                    const [a, b] = dyad.components;
                    const composition = `${getBasicEmotion(a).label}＋${getBasicEmotion(b).label}`;

                    return (
                      <RingItemSphere
                        key={dyad.id}
                        groupRef={(node) => {
                          dyadSphereRefs.current[index] = node;
                        }}
                        position={{ x: 0, y: HIERARCHY_BASIC_Y, z: 0 }}
                        color={color}
                        label={dyad.label}
                        sublabel={composition}
                        angleRad={angleRad}
                        spinYRef={childSpinCurrentRef}
                        isFront={dyadRingReady && dyad.id === activeFrontDyadId}
                        isHovered={dyadRingReady && hoveredDyadId === dyad.id}
                        baseRadius={HIERARCHY_CHILD_SPHERE_RADIUS}
                        interactive={dyadRingReady}
                        labelVisible={dyadRingReady}
                        lockIdleSize
                        onSelect={() => handleSelectDyad(dyad.id)}
                        onHover={(hovered) => setHoveredDyadId(hovered ? dyad.id : null)}
                      />
                    );
                  })}
                </group>
              </group>
            </>
          )}

          {isDyadConfirmed && (
            <group ref={wordRingGroupRef} visible={false} scale={[0.001, 0.001, 0.001]}>
              <OrbitHintRing
                radius={HIERARCHY_BASIC_RING_RADIUS}
                y={HIERARCHY_BASIC_Y}
                color={confirmedDyadColor}
                opacity={0.4}
              />

              <group ref={wordSpinGroupRef}>
                {wordNodes.map(({ plot, key, color, angleRad, position }) => (
                  <RingItemSphere
                    key={key}
                    position={position}
                    color={color}
                    label={plot.word_id}
                    sublabel={plot.ruby || plot.meaning}
                    angleRad={angleRad}
                    spinYRef={wordSpinCurrentRef}
                    isFront={key === frontWordKey}
                    isHovered={hoveredWordKey === key}
                    baseRadius={HIERARCHY_WORD_SPHERE_RADIUS}
                    onSelect={() => handleSelectWord(key, angleRad)}
                    onHover={(hovered) => setHoveredWordKey(hovered ? key : null)}
                  />
                ))}
              </group>
            </group>
          )}
        </group>
      )}
    </group>
  );
}

export const HIERARCHY_DEFAULT_FRONT_BASIC_ID: BasicEmotionId = HIERARCHY_SLOT_BASIC_ID;
