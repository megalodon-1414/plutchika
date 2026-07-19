import { Billboard, Html, Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import * as THREE from 'three';
import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import {
  DYAD_EMOTIONS,
  findDyadByComponents,
  getBasicEmotion,
  getEmotionById,
  isBasicEmotionId,
} from '../../data/emotions';
import type { UserPlotRow } from '../../types/userPlot';
import { blendHex } from '../../utils/emotionColor';
import { isPurePlot } from '../../utils/emotionPlotBridge';
import { plotColorFromRow } from '../../utils/plotFromUserPlot';
import { getTelescopePlotPosition } from './telescopePlotLayout';
import {
  TELESCOPE_BASIC_SPHERE_RADIUS,
  TELESCOPE_DYAD_SPHERE_RADIUS,
  TELESCOPE_DETAIL_NODES,
  TELESCOPE_GALAXY_RADIUS,
  TELESCOPE_GALAXY_NODES,
  type TelescopeNodePosition,
  type TelescopeZoomPhase,
} from './constants';
import { getRelatedFocusNodeIds, getDyadPartnerBasicIds } from './focusCameraView';
import {
  ndcAngleFromAim,
  ndcDistanceSqToAim,
  ndcDistanceToAim,
  ndcDistanceToSegment,
} from './telescopeAim';
import {
  getTelescopeRegionDefinition,
  telescopeRegionToUnifiedSpace,
  TELESCOPE_REGION_VIEW,
  type TelescopeRegionDefinition,
} from './layer3Region';
import {
  getLayer3SegmentLayout,
  getLayer3SegmentMetrics,
  groupPlotsByLayer3Segment,
  LAYER3_BAR_HIGHLIGHT_RADIUS_NDC,
  LAYER3_BAR_MID_SEGMENTS_PER_SIDE,
  LAYER3_BAR_SEGMENT_GAP,
} from './layer3Segments';
import { Layer4ExplorationLayer } from './Layer4ExplorationLayer';
import { TelescopeWordPlotLayer } from './TelescopeWordPlotLayer';
import type {
  TelescopeNearestEmotion,
  TelescopeNearbyEmotionGlow,
  TelescopeViewFocus,
} from './telescopeFocus';

export type { TelescopeNearestEmotion, TelescopeNearbyEmotionGlow, TelescopeViewFocus };

/** NDC でののぞき穴縁（正方形キャンバス内接円 ≈ 1） */
const HOLE_EDGE_NDC = 0.92;
/** 照準まわりの感情検知半径（NDC）。穴縁より狭くして精度を上げる */
const DETECT_RADIUS_NDC = 0.72;
/** 穴の外インジケータの最大距離 */
const OUTSIDE_MAX_NDC = 3.5;
/** ふち光は近い外側感情を複数出してよい */
const MAX_RIM_GLOWS = 8;
const REACT_FOCUS_INTERVAL_SECONDS = 1 / 24;
const LAYER2_BASIC_FLOOR_RADIUS = TELESCOPE_BASIC_SPHERE_RADIUS;
const LAYER2_DYAD_FLOOR_RADIUS = TELESCOPE_DYAD_SPHERE_RADIUS * 1.15;
const LAYER2_FLOOR_MARKER_Z = -0.14;
const LAYER2_BAR_FOCUS_RADIUS_NDC = 0.3;
/** Layer2 回転ラベルの一周秒数（小さいほど速い） */
const LAYER2_LABEL_ORBIT_PERIOD_S = 18;
/** カメラ中央がこの NDC 半径内ならラベルを「選択中」とみなす */
const LAYER2_LABEL_SELECT_RADIUS_NDC = 0.22;
const _barProjectedStart = new THREE.Vector3();
const _barProjectedEnd = new THREE.Vector3();
const _labelProjected = new THREE.Vector3();

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function EmotionPointCloud({
  nodeId,
  radius,
  color,
  opacity,
  pointCount,
}: {
  nodeId: string;
  radius: number;
  color: string;
  opacity: number;
  pointCount: number;
}) {
  const geometryData = useMemo(() => {
    const count = pointCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const random = seededRandom(nodeId);
    const baseColor = new THREE.Color(color);
    const spread = radius * 2.15;

    for (let i = 0; i < count; i++) {
      const distance = i === 0 ? 0 : spread * Math.pow(random(), 0.72);
      const azimuth = random() * Math.PI * 2;
      const cosPolar = random() * 2 - 1;
      const sinPolar = Math.sqrt(1 - cosPolar * cosPolar);
      positions[i * 3] = distance * sinPolar * Math.cos(azimuth);
      positions[i * 3 + 1] = distance * sinPolar * Math.sin(azimuth);
      positions[i * 3 + 2] = distance * cosPolar;

      const pointColor = baseColor.clone().lerp(
        new THREE.Color('#ffffff'),
        0.12 + random() * 0.32,
      );
      colors[i * 3] = pointColor.r;
      colors[i * 3 + 1] = pointColor.g;
      colors[i * 3 + 2] = pointColor.b;
    }

    return { positions, colors };
  }, [nodeId, radius, color, pointCount]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[geometryData.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[geometryData.colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={radius * 0.17}
        vertexColors
        transparent
        opacity={opacity}
        depthWrite={false}
        sizeAttenuation
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

const _orbitPosition = new THREE.Vector3();
const _orbitMatrix = new THREE.Matrix4();
const ORBITERS_PER_EMOTION = 3;
const ORBIT_TRAIL_PARTICLES = 16;

function setEmotionOrbitPosition(
  node: TelescopeNodePosition,
  nodeIndex: number,
  orbiterIndex: number,
  angle: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const radius = 0.32 + orbiterIndex * 0.105 + (nodeIndex % 2) * 0.025;
  // 全軌道面を共通方向の周囲に収め、法線方向のばらつきを45度未満にする。
  const tilt =
    0.52 + (((nodeIndex * 3 + orbiterIndex) % 5) - 2) * 0.045;
  const orientation =
    0.35 + (((nodeIndex * 2 + orbiterIndex) % 7) - 3) * 0.08;
  const localX = Math.cos(angle) * radius;
  const localY = Math.sin(angle) * radius * Math.cos(tilt);
  const localZ = Math.sin(angle) * radius * Math.sin(tilt);
  const cosOrientation = Math.cos(orientation);
  const sinOrientation = Math.sin(orientation);

  return out.set(
    node.position[0] + localX * cosOrientation - localY * sinOrientation,
    node.position[1] + localX * sinOrientation + localY * cosOrientation,
    node.position[2] + localZ,
  );
}

/** レイヤー1: 8感情同士（対立ペア以外）を結ぶ細く薄い白線 */
const BASIC_WEB_LINE_OPACITY = 0.09;
const BASIC_WEB_LINE_Z = -0.1;

function BasicEmotionWebLines({ visible }: { visible: boolean }) {
  const geometry = useMemo(() => {
    const positionById = new Map(
      TELESCOPE_GALAXY_NODES.map((node) => [node.id, node.position]),
    );
    const positions: number[] = [];
    // 24合成感情＝対立以外の全ペア。その成分同士を結ぶ。
    for (const dyad of DYAD_EMOTIONS) {
      const a = positionById.get(dyad.components[0]);
      const b = positionById.get(dyad.components[1]);
      if (!a || !b) {
        continue;
      }
      positions.push(
        a[0],
        a[1],
        BASIC_WEB_LINE_Z,
        b[0],
        b[1],
        BASIC_WEB_LINE_Z,
      );
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return result;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments
      geometry={geometry}
      visible={visible}
      frustumCulled={false}
      renderOrder={-1}
    >
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={BASIC_WEB_LINE_OPACITY}
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function BasicEmotionOrbits({ visible }: { visible: boolean }) {
  const orbitersRef = useRef<THREE.InstancedMesh>(null);
  const trailRef = useRef<THREE.Points>(null);

  const trailData = useMemo(() => {
    const orbiterCount =
      TELESCOPE_GALAXY_NODES.length * ORBITERS_PER_EMOTION;
    const count = orbiterCount * ORBIT_TRAIL_PARTICLES;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    TELESCOPE_GALAXY_NODES.forEach((node, nodeIndex) => {
      const baseColor = new THREE.Color(node.color).lerp(
        new THREE.Color('#ffffff'),
        0.2,
      );
      for (
        let orbiterIndex = 0;
        orbiterIndex < ORBITERS_PER_EMOTION;
        orbiterIndex++
      ) {
        const instanceIndex =
          nodeIndex * ORBITERS_PER_EMOTION + orbiterIndex;
        for (
          let trailIndex = 0;
          trailIndex < ORBIT_TRAIL_PARTICLES;
          trailIndex++
        ) {
          const index =
            instanceIndex * ORBIT_TRAIL_PARTICLES + trailIndex;
          const fade = Math.pow(
            1 - trailIndex / ORBIT_TRAIL_PARTICLES,
            1.45,
          );
          colors[index * 3] = baseColor.r * fade;
          colors[index * 3 + 1] = baseColor.g * fade;
          colors[index * 3 + 2] = baseColor.b * fade;
        }
      }
    });

    return { positions, colors };
  }, []);

  useEffect(() => {
    const mesh = orbitersRef.current;
    if (!mesh) {
      return;
    }
    TELESCOPE_GALAXY_NODES.forEach((node, nodeIndex) => {
      for (
        let orbiterIndex = 0;
        orbiterIndex < ORBITERS_PER_EMOTION;
        orbiterIndex++
      ) {
        const instanceIndex =
          nodeIndex * ORBITERS_PER_EMOTION + orbiterIndex;
        mesh.setColorAt(
          instanceIndex,
          new THREE.Color(node.color).lerp(new THREE.Color('#ffffff'), 0.22),
        );
      }
    });
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, []);

  useFrame(({ clock }) => {
    const mesh = orbitersRef.current;
    const trail = trailRef.current;
    if (!mesh || !trail || !visible) {
      return;
    }
    const elapsed = clock.elapsedTime;
    TELESCOPE_GALAXY_NODES.forEach((node, nodeIndex) => {
      for (
        let orbiterIndex = 0;
        orbiterIndex < ORBITERS_PER_EMOTION;
        orbiterIndex++
      ) {
        const instanceIndex =
          nodeIndex * ORBITERS_PER_EMOTION + orbiterIndex;
        const speed =
          0.38 + (nodeIndex % 4) * 0.025 + orbiterIndex * 0.035;
        const phaseSeed =
          Math.sin((instanceIndex + 1) * 12.9898) * 43758.5453;
        const phase =
          (phaseSeed - Math.floor(phaseSeed)) * Math.PI * 2;
        const currentAngle = elapsed * speed + phase;
        setEmotionOrbitPosition(
          node,
          nodeIndex,
          orbiterIndex,
          currentAngle,
          _orbitPosition,
        );
        _orbitMatrix.makeTranslation(
          _orbitPosition.x,
          _orbitPosition.y,
          _orbitPosition.z,
        );
        mesh.setMatrixAt(instanceIndex, _orbitMatrix);

        for (
          let trailIndex = 0;
          trailIndex < ORBIT_TRAIL_PARTICLES;
          trailIndex++
        ) {
          const particleIndex =
            instanceIndex * ORBIT_TRAIL_PARTICLES + trailIndex;
          const trailAngle = currentAngle - trailIndex * 0.052;
          setEmotionOrbitPosition(
            node,
            nodeIndex,
            orbiterIndex,
            trailAngle,
            _orbitPosition,
          );
          trailData.positions[particleIndex * 3] = _orbitPosition.x;
          trailData.positions[particleIndex * 3 + 1] = _orbitPosition.y;
          trailData.positions[particleIndex * 3 + 2] = _orbitPosition.z;
        }
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    const positionAttribute = trail.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    positionAttribute.needsUpdate = true;
  });

  return (
    <group visible={visible}>
      <points ref={trailRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[trailData.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[trailData.colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.027}
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          sizeAttenuation
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <instancedMesh
        ref={orbitersRef}
        args={[
          undefined,
          undefined,
          TELESCOPE_GALAXY_NODES.length * ORBITERS_PER_EMOTION,
        ]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial
          vertexColors
          toneMapped={false}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

function EmotionStar({
  node,
  radius,
  color,
  opacity,
  emissiveBoost = 0.35,
  focused = false,
  pointCloud = false,
  pointCount = 112,
}: {
  node: TelescopeNodePosition;
  radius: number;
  color: string;
  opacity: number;
  emissiveBoost?: number;
  focused?: boolean;
  pointCloud?: boolean;
  pointCount?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const orbitLabelRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const t = state.clock.elapsedTime;
    if (orbitLabelRef.current) {
      orbitLabelRef.current.rotation.z =
        -(t * (Math.PI * 2)) / LAYER2_LABEL_ORBIT_PERIOD_S;
    }
  });

  if (opacity < 0.02) {
    return null;
  }

  const trackR = radius * 1.72;
  const labelFont = Math.max(radius * 0.48, 0.055);

  return (
    <group ref={groupRef} position={node.position}>
      <group>
        {pointCloud ? (
          <EmotionPointCloud
            nodeId={node.id}
            radius={radius}
            color={color}
            opacity={opacity}
            pointCount={pointCount}
          />
        ) : (
          <>
            <mesh>
              <sphereGeometry args={[radius, 20, 20]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={emissiveBoost}
                roughness={0.35}
                metalness={0}
                toneMapped={false}
                transparent
                opacity={opacity}
                depthWrite={opacity > 0.85}
              />
            </mesh>
            <mesh>
              <sphereGeometry args={[radius * 2.4, 16, 16]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity * 0.12}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </>
        )}

        {focused && (
          <group ref={orbitLabelRef}>
            <Text
              position={[trackR, 0, 0.03]}
              rotation={[0, 0, -Math.PI / 2]}
              fontSize={labelFont}
              color={color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0}
              fillOpacity={0.95}
              letterSpacing={0.06}
            >
              {node.label}
            </Text>
          </group>
        )}
      </group>
    </group>
  );
}

function useDetailColors() {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const dyad of DYAD_EMOTIONS) {
      const [a, b] = dyad.components;
      map.set(
        dyad.id,
        blendHex(getBasicEmotion(a).color, getBasicEmotion(b).color, 0.5),
      );
    }
    return map;
  }, []);
}

/**
 * Layer02: プロット面より下で、選択感情と対立以外の基本感情を結ぶ。
 * バーの両端をそれぞれの感情色にし、GPU補間でグラデーションを作る。
 */
function RelatedEmotionBars({
  focusBasicId,
  visible,
  onFocusedPartnerChange,
}: {
  focusBasicId: BasicEmotionId;
  visible: boolean;
  onFocusedPartnerChange?: (partnerId: BasicEmotionId | null) => void;
}) {
  const progressRef = useRef(0);
  const meshRefs = useRef(new Map<string, THREE.Mesh>());
  const lastFocusedPartnerRef = useRef<BasicEmotionId | null | undefined>(
    undefined,
  );
  const onFocusedPartnerChangeRef = useRef(onFocusedPartnerChange);
  onFocusedPartnerChangeRef.current = onFocusedPartnerChange;
  const targets = useMemo(() => {
    const partnerIds = new Set(getDyadPartnerBasicIds(focusBasicId));
    return TELESCOPE_GALAXY_NODES.filter((n) => partnerIds.has(n.id as BasicEmotionId));
  }, [focusBasicId]);

  const fromNode = useMemo(
    () => TELESCOPE_GALAXY_NODES.find((n) => n.id === focusBasicId) ?? null,
    [focusBasicId],
  );

  const bars = useMemo(() => {
    if (!fromNode || targets.length === 0) {
      return [];
    }

    const fromColor = new THREE.Color(fromNode.color);
    const barZ = -0.16;
    const halfWidth = 0.062;

    return targets.map((target) => {
      const dx = target.position[0] - fromNode.position[0];
      const dy = target.position[1] - fromNode.position[1];
      const length = Math.hypot(dx, dy) || 1;
      const circleGap = 0.07;
      const startInset = Math.min(
        LAYER2_BASIC_FLOOR_RADIUS + circleGap,
        length * 0.22,
      );
      const endInset = Math.min(
        LAYER2_BASIC_FLOOR_RADIUS + circleGap,
        length * 0.22,
      );
      const barLength = Math.max(
        halfWidth * 2.2,
        length - startInset - endInset,
      );
      const directionX = dx / length;
      const directionY = dy / length;
      const targetColor = new THREE.Color(target.color);
      const shape = new THREE.Shape();
      shape.moveTo(halfWidth, -halfWidth);
      shape.lineTo(barLength - halfWidth, -halfWidth);
      shape.absarc(
        barLength - halfWidth,
        0,
        halfWidth,
        -Math.PI / 2,
        Math.PI / 2,
        false,
      );
      shape.lineTo(halfWidth, halfWidth);
      shape.absarc(
        halfWidth,
        0,
        halfWidth,
        Math.PI / 2,
        (Math.PI * 3) / 2,
        false,
      );
      shape.closePath();

      const geometry = new THREE.ShapeGeometry(shape, 16);
      const positionAttribute = geometry.getAttribute('position');
      const colors = new Float32Array(positionAttribute.count * 3);
      for (let index = 0; index < positionAttribute.count; index++) {
        const t = THREE.MathUtils.clamp(
          positionAttribute.getX(index) / barLength,
          0,
          1,
        );
        const color = fromColor.clone().lerp(targetColor, t);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const startPosition: [number, number, number] = [
        fromNode.position[0] + directionX * startInset,
        fromNode.position[1] + directionY * startInset,
        barZ,
      ];
      return {
        id: target.id,
        geometry,
        position: startPosition,
        startPosition,
        endPosition: [
          startPosition[0] + directionX * barLength,
          startPosition[1] + directionY * barLength,
          barZ,
        ] as [number, number, number],
        rotationZ: Math.atan2(dy, dx),
      };
    });
  }, [fromNode, targets]);

  useEffect(
    () => () => {
      for (const bar of bars) {
        bar.geometry.dispose();
      }
    },
    [bars],
  );

  useFrame(({ camera }, delta) => {
    if (!visible) {
      progressRef.current = 0;
    } else {
      progressRef.current = Math.min(
        1,
        progressRef.current + delta / 0.9,
      );
    }

    let focusedBarId: string | null = null;
    let focusedDistance = LAYER2_BAR_FOCUS_RADIUS_NDC;
    if (visible) {
      for (const bar of bars) {
        _barProjectedStart.set(...bar.startPosition).project(camera);
        _barProjectedEnd.set(...bar.endPosition).project(camera);
        if (
          _barProjectedStart.z < -1 ||
          _barProjectedStart.z > 1 ||
          _barProjectedEnd.z < -1 ||
          _barProjectedEnd.z > 1
        ) {
          continue;
        }
        const { distance } = ndcDistanceToSegment(
          _barProjectedStart.x,
          _barProjectedStart.y,
          _barProjectedEnd.x,
          _barProjectedEnd.y,
        );
        if (distance < focusedDistance) {
          focusedDistance = distance;
          focusedBarId = bar.id;
        }
      }
    }

    const focusedPartner = (focusedBarId as BasicEmotionId | null) ?? null;
    if (lastFocusedPartnerRef.current !== focusedPartner) {
      lastFocusedPartnerRef.current = focusedPartner;
      onFocusedPartnerChangeRef.current?.(focusedPartner);
    }

    bars.forEach((bar, index) => {
      const mesh = meshRefs.current.get(bar.id);
      if (!mesh) {
        return;
      }
      const delay = index * 0.045;
      const localProgress = THREE.MathUtils.clamp(
        (progressRef.current - delay) / (1 - delay),
        0,
        1,
      );
      const eased = 1 - Math.pow(1 - localProgress, 3);
      const highlighted = bar.id === focusedBarId;
      const baseScaleY = 0.72 + eased * 0.28;
      const targetScaleY = baseScaleY * (highlighted ? 1.55 : 1);
      mesh.visible = eased > 0.001;
      mesh.scale.x = Math.max(0.001, eased);
      mesh.scale.y = THREE.MathUtils.damp(
        mesh.scale.y,
        targetScaleY,
        9,
        delta,
      );
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.damp(
        material.opacity,
        (highlighted ? 0.68 : 0.28) * eased,
        9,
        delta,
      );
      mesh.renderOrder = highlighted ? 2 : 0;
    });
  });

  if (bars.length === 0) {
    return null;
  }

  return (
    <group renderOrder={0}>
      {bars.map((bar) => (
        <mesh
          key={bar.id}
          ref={(mesh) => {
            if (mesh) {
              meshRefs.current.set(bar.id, mesh);
            } else {
              meshRefs.current.delete(bar.id);
            }
          }}
          geometry={bar.geometry}
          position={bar.position}
          rotation={[0, 0, bar.rotationZ]}
          scale={[0.001, 0.72, 1]}
          visible={false}
          frustumCulled={false}
          renderOrder={0}
        >
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0}
            depthWrite={false}
            depthTest
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Layer2EmotionFloorMarkers({
  focusBasicId,
  visible,
}: {
  focusBasicId: BasicEmotionId;
  visible: boolean;
}) {
  const progressRef = useRef(0);
  const markerRefs = useRef(new Map<string, THREE.Group>());
  const detailColors = useDetailColors();
  const nodes = useMemo(() => {
    const relatedIds = getRelatedFocusNodeIds(focusBasicId);
    return [
      ...TELESCOPE_GALAXY_NODES,
      ...TELESCOPE_DETAIL_NODES.filter((node) => relatedIds.has(node.id)),
    ];
  }, [focusBasicId]);
  const selectedNode = useMemo(
    () =>
      TELESCOPE_GALAXY_NODES.find((node) => node.id === focusBasicId) ??
      TELESCOPE_GALAXY_NODES[0],
    [focusBasicId],
  );

  useFrame((_, delta) => {
    if (!visible) {
      progressRef.current = 0;
    } else {
      progressRef.current = Math.min(
        1,
        progressRef.current + delta / 1.05,
      );
    }

    nodes.forEach((node, index) => {
      const marker = markerRefs.current.get(node.id);
      if (!marker) {
        return;
      }
      const delay = index * 0.022;
      const localProgress = THREE.MathUtils.clamp(
        (progressRef.current - delay) / (1 - delay),
        0,
        1,
      );
      const eased = localProgress * localProgress * (3 - 2 * localProgress);
      marker.visible = eased > 0.001;
      marker.position.set(
        THREE.MathUtils.lerp(
          selectedNode.position[0],
          node.position[0],
          eased,
        ),
        THREE.MathUtils.lerp(
          selectedNode.position[1],
          node.position[1],
          eased,
        ),
        LAYER2_FLOOR_MARKER_Z,
      );
      marker.scale.setScalar(0.2 + eased * 0.8);

      const isBasic = node.kind === 'basic';
      const fill = marker.children[0] as THREE.Mesh;
      const ring = marker.children[1] as THREE.Mesh;
      (fill.material as THREE.MeshBasicMaterial).opacity =
        (isBasic ? 0.2 : 0.16) * eased;
      (ring.material as THREE.MeshBasicMaterial).opacity =
        (isBasic ? 0.4 : 0.32) * eased;
    });
  });

  return (
    <group renderOrder={0}>
      {nodes.map((node) => {
        const isBasic = node.kind === 'basic';
        const radius = isBasic
          ? LAYER2_BASIC_FLOOR_RADIUS
          : LAYER2_DYAD_FLOOR_RADIUS;
        const color = isBasic
          ? node.color
          : detailColors.get(node.id) ?? node.color;
        return (
          <group
            key={`floor-marker-${node.id}`}
            ref={(group) => {
              if (group) {
                markerRefs.current.set(node.id, group);
              } else {
                markerRefs.current.delete(node.id);
              }
            }}
            position={[
              selectedNode.position[0],
              selectedNode.position[1],
              LAYER2_FLOOR_MARKER_Z,
            ]}
            scale={0.2}
            visible={false}
          >
            <mesh renderOrder={0}>
              <circleGeometry args={[radius, 48]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0}
                depthWrite={false}
                depthTest
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, 0, 0.002]} renderOrder={0}>
              <ringGeometry args={[radius * 0.84, radius, 48]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0}
                depthWrite={false}
                depthTest
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** プルチック環の花弁背景 — ここを触って調整する */
const PETAL_BACKDROP = {
  /** 花弁面の Z（各種床要素より奥） */
  z: -0.3,
  /** 花弁の根本半径 */
  inner: 0.2,
  /** 花弁の先端半径（環半径比） */
  outerScale: 1.28,
  /** 花弁の幅（1 = 8等分セクターいっぱい） */
  widthRatio: 0.68,
  /** 塗りの不透明度（加算合成） */
  fillOpacity: 0.085,
  /** 輪郭線の不透明度（加算合成） */
  strokeOpacity: 0.16,
  /** 検知中の感情の花弁の塗り不透明度 */
  fillHighlightOpacity: 0.2,
  /** 検知中の感情の花弁の輪郭不透明度 */
  strokeHighlightOpacity: 0.34,
  /** ハイライトのフェード速さ（damp係数） */
  highlightDamp: 6,
  /** 意匠全体の縮尺 */
  scale: 0.8,
} as const;

/**
 * 全レイヤー共通の背景意匠。8基本感情の方向に、感情色の花弁を
 * プルチックの環のように敷く。加算合成＋長手グラデーションで控えめに光らせる。
 * highlightId の花弁はやや明るくハイライトする（検知中の感情）。
 */
function PlutchikPetalBackdrop({
  highlightRef,
}: {
  /** 検知中の基本感情 ID（毎フレーム更新される ref） */
  highlightRef?: { readonly current: string | null };
}) {
  const fillMaterials = useRef(new Map<string, THREE.MeshBasicMaterial>());
  const strokeMaterials = useRef(new Map<string, THREE.LineBasicMaterial>());

  useFrame((_, delta) => {
    const highlightId = highlightRef?.current ?? null;
    for (const node of TELESCOPE_GALAXY_NODES) {
      const highlighted = node.id === highlightId;
      const fill = fillMaterials.current.get(node.id);
      if (fill) {
        fill.opacity = THREE.MathUtils.damp(
          fill.opacity,
          highlighted
            ? PETAL_BACKDROP.fillHighlightOpacity
            : PETAL_BACKDROP.fillOpacity,
          PETAL_BACKDROP.highlightDamp,
          delta,
        );
      }
      const stroke = strokeMaterials.current.get(node.id);
      if (stroke) {
        stroke.opacity = THREE.MathUtils.damp(
          stroke.opacity,
          highlighted
            ? PETAL_BACKDROP.strokeHighlightOpacity
            : PETAL_BACKDROP.strokeOpacity,
          PETAL_BACKDROP.highlightDamp,
          delta,
        );
      }
    }
  });
  const { fillGeometry, strokeGeometry } = useMemo(() => {
    const inner = PETAL_BACKDROP.inner;
    const outer = TELESCOPE_GALAXY_RADIUS * PETAL_BACKDROP.outerScale;
    const mid = (inner + outer) * 0.5;
    const halfWidth =
      Math.tan(Math.PI / 8) * mid * PETAL_BACKDROP.widthRatio;

    const shape = new THREE.Shape();
    shape.moveTo(inner, 0);
    shape.quadraticCurveTo(mid, halfWidth, outer, 0);
    shape.quadraticCurveTo(mid, -halfWidth, inner, 0);
    shape.closePath();

    const fill = new THREE.ShapeGeometry(shape, 28);
    // 長手方向のグラデーション（中腹が最も明るく、根本と先端で消える）。
    // 白のグラデーションを頂点色に焼き、材質色（感情色）と乗算して共有する。
    const positionAttribute = fill.getAttribute('position');
    const colors = new Float32Array(positionAttribute.count * 3);
    for (let index = 0; index < positionAttribute.count; index++) {
      const t = THREE.MathUtils.clamp(
        (positionAttribute.getX(index) - inner) / (outer - inner),
        0,
        1,
      );
      const intensity = Math.sin(Math.PI * t) ** 1.4;
      colors[index * 3] = intensity;
      colors[index * 3 + 1] = intensity;
      colors[index * 3 + 2] = intensity;
    }
    fill.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const stroke = new THREE.BufferGeometry().setFromPoints(
      shape.getPoints(40),
    );
    return { fillGeometry: fill, strokeGeometry: stroke };
  }, []);

  useEffect(
    () => () => {
      fillGeometry.dispose();
      strokeGeometry.dispose();
    },
    [fillGeometry, strokeGeometry],
  );

  return (
    <group
      renderOrder={-2}
      scale={[PETAL_BACKDROP.scale, PETAL_BACKDROP.scale, 1]}
    >
      {TELESCOPE_GALAXY_NODES.map((node) => {
        const angle = Math.atan2(node.position[1], node.position[0]);
        return (
          <group
            key={`petal-${node.id}`}
            position={[0, 0, PETAL_BACKDROP.z]}
            rotation={[0, 0, angle]}
          >
            <mesh geometry={fillGeometry} frustumCulled={false}>
              <meshBasicMaterial
                ref={(material) => {
                  if (material) {
                    fillMaterials.current.set(node.id, material);
                  } else {
                    fillMaterials.current.delete(node.id);
                  }
                }}
                color={node.color}
                vertexColors
                transparent
                opacity={PETAL_BACKDROP.fillOpacity}
                depthWrite={false}
                depthTest
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
            <lineLoop geometry={strokeGeometry} frustumCulled={false}>
              <lineBasicMaterial
                ref={(material) => {
                  if (material) {
                    strokeMaterials.current.set(node.id, material);
                  } else {
                    strokeMaterials.current.delete(node.id);
                  }
                }}
                color={node.color}
                transparent
                opacity={PETAL_BACKDROP.strokeOpacity}
                depthWrite={false}
                depthTest
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </lineLoop>
          </group>
        );
      })}
    </group>
  );
}

function Layer2RadialGrid() {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const gridRadius = TELESCOPE_GALAXY_RADIUS;
    const gridZ = -0.26;
    const spokeCount = 24;
    const ringCount = 7;
    const ringSegments = 96;

    for (let index = 0; index < spokeCount; index++) {
      const angle = (index / spokeCount) * Math.PI * 2;
      positions.push(
        0,
        0,
        gridZ,
        Math.cos(angle) * gridRadius,
        Math.sin(angle) * gridRadius,
        gridZ,
      );
    }

    for (let ring = 1; ring <= ringCount; ring++) {
      const radius = (gridRadius * ring) / ringCount;
      for (let segment = 0; segment < ringSegments; segment++) {
        const fromAngle = (segment / ringSegments) * Math.PI * 2;
        const toAngle = ((segment + 1) / ringSegments) * Math.PI * 2;
        positions.push(
          Math.cos(fromAngle) * radius,
          Math.sin(fromAngle) * radius,
          gridZ,
          Math.cos(toAngle) * radius,
          Math.sin(toAngle) * radius,
          gridZ,
        );
      }
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return result;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} frustumCulled={false} renderOrder={-1}>
      <lineBasicMaterial
        color="#9aa6c0"
        transparent
        opacity={0.12}
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function Layer2EmotionLabel({
  node,
  color,
  trackRadius = TELESCOPE_DYAD_SPHERE_RADIUS * 1.4,
  fontSize = 0.065,
  reveal,
  revealAlongT = 1,
}: {
  node: TelescopeNodePosition;
  color: string;
  trackRadius?: number;
  fontSize?: number;
  /** レイヤー3の入場スイープ。指定時は波面通過に合わせて成長して現れる */
  reveal?: { readonly current: number };
  revealAlongT?: number;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const centerDotRef = useRef<THREE.Mesh>(null);
  const centerDotRadius = trackRadius * 0.22;
  const initialPhase = useMemo(
    () => seededRandom(`label:${node.id}`)() * Math.PI * 2,
    [node.id],
  );
  const selectedBlend = useRef(0);

  useFrame(({ camera, clock }, delta) => {
    if (orbitRef.current) {
      orbitRef.current.rotation.z =
        initialPhase -
        (clock.elapsedTime * Math.PI * 2) / LAYER2_LABEL_ORBIT_PERIOD_S;
    }

    if (reveal && rootRef.current) {
      const factor = layer3RevealFactor(reveal.current, revealAlongT);
      const smooth = factor * factor * (3 - 2 * factor);
      rootRef.current.visible = factor > 0.001;
      rootRef.current.scale.setScalar(Math.max(0.0001, smooth));
    }

    _labelProjected.set(node.position[0], node.position[1], node.position[2]);
    _labelProjected.project(camera);
    const onScreen =
      _labelProjected.z >= -1 &&
      _labelProjected.z <= 1 &&
      ndcDistanceToAim(_labelProjected.x, _labelProjected.y) <=
        LAYER2_LABEL_SELECT_RADIUS_NDC;
    selectedBlend.current = THREE.MathUtils.damp(
      selectedBlend.current,
      onScreen ? 1 : 0,
      10,
      delta,
    );

    const dot = centerDotRef.current;
    if (dot) {
      const blend = selectedBlend.current;
      dot.visible = blend > 0.02;
      dot.scale.setScalar(0.65 + blend * 0.45);
      const material = dot.material as THREE.MeshBasicMaterial;
      material.opacity = 0.15 + blend * 0.8;
    }
  });

  return (
    <group
      ref={rootRef}
      position={node.position}
      visible={!reveal}
    >
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <mesh>
          <ringGeometry
            args={[trackRadius - 0.004, trackRadius + 0.004, 64]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.24}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={centerDotRef} visible={false}>
          <circleGeometry args={[centerDotRadius, 28]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <group ref={orbitRef}>
          <Text
            position={[trackRadius, 0, 0]}
            rotation={[0, 0, -Math.PI / 2]}
            fontSize={fontSize}
            color={color}
            anchorX="center"
            anchorY="middle"
            fillOpacity={0.92}
            letterSpacing={0.06}
          >
            {node.label}
          </Text>
        </group>
      </Billboard>
    </group>
  );
}

function Layer2RelatedEmotionLabels({
  focusBasicId,
}: {
  focusBasicId: BasicEmotionId;
}) {
  const labels = useMemo(() => {
    const relatedDyadIds = new Set(
      DYAD_EMOTIONS.filter((dyad) =>
        dyad.components.includes(focusBasicId),
      ).map((dyad) => dyad.id),
    );
    return TELESCOPE_DETAIL_NODES.filter((node) =>
      relatedDyadIds.has(node.id as `dyad-${number}`),
    );
  }, [focusBasicId]);
  const detailColors = useDetailColors();

  return (
    <group>
      {labels.map((node) => (
        <Layer2EmotionLabel
          key={node.id}
          node={node}
          color={detailColors.get(node.id) ?? node.color}
        />
      ))}
    </group>
  );
}

/**
 * レイヤー3: 帯を両端の感情球の外側へ延長する量（片側）。
 * 端の丸みの中心が感情ノードと一致し、円形セグメントが内接する値。
 */
const LAYER3_REGION_LENGTH_PAD = 0.34;
const LAYER3_PLOT_BASE_Z = 0.02;
const LAYER3_PLOT_RADIUS = 0.024;
const LAYER3_PLOT_LIFT = 0.2;
/** バー長手方向の持ち上げ範囲（狭くして選択位置付近だけ上げる） */
const LAYER3_PLOT_LIFT_ALONG = 0.28;
/** バー幅方向の持ち上げ範囲（幅方向に並んだ点はまとめて上がる） */
const LAYER3_PLOT_LIFT_PERP = TELESCOPE_REGION_VIEW.regionHalfWidth * 2.2;
const LAYER3_PLOT_LIFT_CURVE = 1.4;
const LAYER3_PLOT_CAPTURE_NDC = 0.3;
const LAYER3_PLOT_LIFT_SPEED = 8;
const LAYER3_BAR_HIGHLIGHT_SPEED = 9;
/** 公転する純粋感情プロットの軌跡パーティクル数と時間間隔 */
const LAYER3_TRAIL_COUNT = 10;
const LAYER3_TRAIL_STEP_S = 2.4;
/** パーティクルの持ち上げ追従速度（本体の 8 よりゆっくり） */
const LAYER3_TRAIL_LIFT_SPEED = 3.2;
/** 後方パーティクルほど追従が遅れる度合い */
const LAYER3_TRAIL_LIFT_LAG = 0.22;
/** イ形容詞ラベルの引き出し線の先端（バー方向＝画面右寄り＋Z上方） */
const LAYER3_LABEL_LEADER_ALONG = 0.14;
const LAYER3_LABEL_LEADER_UP = 0.36;
const LAYER3_LABEL_FADE_SPEED = 9;
/** プロット点の疑似影を落とす面の高さ（帯のすぐ上） */
const LAYER3_SHADOW_WORLD_Z = -0.07;
/** バーの全長（両端の延長込み） */
const LAYER3_STRIP_LENGTH =
  TELESCOPE_REGION_VIEW.spanLength + LAYER3_REGION_LENGTH_PAD * 2;
/** 入場演出: 手前（end）側の端から奥へ掃くようにフェードインする */
const LAYER3_REVEAL_DURATION_S = 1.3;
/** 出現の波面のやわらかさ（バー全長比） */
const LAYER3_REVEAL_SOFT = 0.35;
const _layer3PlotProjected = new THREE.Vector3();

/** 入場演出の進行度（0→1）。子コンポーネントは参照のみ */
type Layer3RevealRef = { readonly current: number };

/**
 * 入場演出の出現係数。end（手前・画面右）側の端から start 側へ
 * 波面が掃くように 0→1 へ立ち上がる。
 */
function layer3RevealFactor(revealT: number, alongT: number): number {
  const delay = 1 - alongT;
  const front = revealT * (1 + LAYER3_REVEAL_SOFT);
  return THREE.MathUtils.clamp((front - delay) / LAYER3_REVEAL_SOFT, 0, 1);
}

/** 統一空間の座標 → バー方向の正規化位置（0=start側の延長端、1=end側の延長端） */
function layer3AlongT(
  region: TelescopeRegionDefinition,
  x: number,
  y: number,
): number {
  const along =
    (x - region.start.position[0]) * region.direction[0] +
    (y - region.start.position[1]) * region.direction[1];
  return THREE.MathUtils.clamp(
    (along + LAYER3_REGION_LENGTH_PAD) / LAYER3_STRIP_LENGTH,
    0,
    1,
  );
}

interface Layer3LiftCenter {
  captured: boolean;
  x: number;
  y: number;
}

/** 検知中心を頂点とする丘（幅方向に広く、長手方向に狭い）の高さを返す */
function layer3LiftZ(
  x: number,
  y: number,
  center: Layer3LiftCenter,
  ux: number,
  uy: number,
): number {
  if (!center.captured) {
    return LAYER3_PLOT_BASE_Z;
  }
  const relX = x - center.x;
  const relY = y - center.y;
  const along = relX * ux + relY * uy;
  const perp = ux * relY - uy * relX;
  const elliptical = Math.hypot(
    along / LAYER3_PLOT_LIFT_ALONG,
    perp / LAYER3_PLOT_LIFT_PERP,
  );
  const proximity = THREE.MathUtils.clamp(1 - elliptical, 0, 1);
  const smoothProximity = proximity * proximity * (3 - 2 * proximity);
  return (
    LAYER3_PLOT_BASE_Z +
    LAYER3_PLOT_LIFT * Math.pow(smoothProximity, LAYER3_PLOT_LIFT_CURVE)
  );
}

let _layer3ShadowTexture: THREE.DataTexture | null = null;

/** 中心が濃く縁で消える放射グラデーションの影テクスチャ（共有・使い回し） */
function getLayer3ShadowTexture(): THREE.DataTexture {
  if (_layer3ShadowTexture) {
    return _layer3ShadowTexture;
  }
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const distance = Math.hypot(dx, dy) * 2;
      const alpha = Math.max(0, 1 - distance);
      const value = Math.round(alpha * alpha * 255);
      const offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  _layer3ShadowTexture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
  );
  _layer3ShadowTexture.needsUpdate = true;
  return _layer3ShadowTexture;
}

/**
 * イ形容詞プロットの引き出し線＋縦書きラベル。
 * 検知円に入ると引き出し線がフェードし、ラベルは下からフェードインする。
 */
function Layer3AdjectiveLeaderLabel({
  word,
  color,
  leaderEnd,
  shown,
}: {
  word: string;
  color: string;
  leaderEnd: [number, number, number];
  shown: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<ComponentRef<typeof Line>>(null);
  const fade = useRef(0);

  useFrame((_, delta) => {
    const target = shown ? 1 : 0;
    fade.current = THREE.MathUtils.lerp(
      fade.current,
      target,
      1 - Math.exp(-LAYER3_LABEL_FADE_SPEED * delta),
    );
    const group = groupRef.current;
    if (group) {
      group.visible = shown || fade.current > 0.02;
    }
    const line = lineRef.current;
    if (line) {
      (line.material as THREE.Material).opacity = fade.current * 0.85;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <Line
        ref={lineRef}
        points={[[0, 0, 0], leaderEnd]}
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0}
      />
      <Html position={leaderEnd} zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
        <div
          className="font-momochidori font-momochidori--medium"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            whiteSpace: 'nowrap',
            fontSize: 21,
            letterSpacing: '0.12em',
            color,
            opacity: shown ? 1 : 0,
            // ラベルの下端を引き出し線の先端に合わせる
            transform: shown
              ? 'translate(-50%, calc(-100% - 6px))'
              : 'translate(-50%, calc(-100% + 8px))',
            transition: 'opacity 320ms ease, transform 320ms ease',
          }}
        >
          {word}
        </div>
      </Html>
    </group>
  );
}

/** 公転する純粋感情プロットの後方に、過去位置をなぞる残像パーティクルを描く */
function Layer3PurePlotTrail({
  row,
  color,
  region,
  liftCenter,
  reveal,
}: {
  row: UserPlotRow;
  color: string;
  region: TelescopeRegionDefinition;
  liftCenter: { readonly current: Layer3LiftCenter };
  reveal: Layer3RevealRef;
}) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const liftedZ = useRef<number[]>([]);

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    const [ux, uy] = region.direction;
    for (let index = 0; index < LAYER3_TRAIL_COUNT; index++) {
      const mesh = meshRefs.current[index];
      if (!mesh) {
        continue;
      }
      const position = getTelescopePlotPosition(
        row,
        time - (index + 1) * LAYER3_TRAIL_STEP_S,
      );
      const [x, y] = telescopeRegionToUnifiedSpace(
        region,
        position[0],
        position[1],
      );
      // パーティクルも丘に乗って持ち上がる。本体よりゆっくり追従させ、
      // 後方ほど遅れて「ふわっ」と浮く。
      const targetZ = layer3LiftZ(x, y, liftCenter.current, ux, uy);
      const followSpeed =
        LAYER3_TRAIL_LIFT_SPEED / (1 + index * LAYER3_TRAIL_LIFT_LAG);
      const z = THREE.MathUtils.lerp(
        liftedZ.current[index] ?? LAYER3_PLOT_BASE_Z,
        targetZ,
        1 - Math.exp(-followSpeed * delta),
      );
      liftedZ.current[index] = z;
      mesh.position.set(x, y, z);

      const fade = 1 - index / LAYER3_TRAIL_COUNT;
      const revealFactor = layer3RevealFactor(
        reveal.current,
        layer3AlongT(region, x, y),
      );
      mesh.visible = revealFactor > 0.001;
      (mesh.material as THREE.MeshBasicMaterial).opacity =
        (0.06 + fade * 0.4) * revealFactor;
    }
  });

  return (
    <group>
      {Array.from({ length: LAYER3_TRAIL_COUNT }, (_, index) => {
        const fade = 1 - index / LAYER3_TRAIL_COUNT;
        return (
          <mesh
            key={index}
            ref={(mesh) => {
              meshRefs.current[index] = mesh;
            }}
          >
            <sphereGeometry
              args={[LAYER3_PLOT_RADIUS * (0.3 + fade * 0.4), 8, 8]}
            />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.06 + fade * 0.4}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * レイヤー3の単語プロット。水平面近くに置き、画面中央付近の
 * バー幅方向の一列をまとめて持ち上げる（長手方向は狭い丘）。
 * 純粋感情の点は感情球のまわりをゆっくり回転する。
 */
function Layer3RegionPlots({
  plots,
  region,
  reveal,
}: {
  plots: readonly { row: UserPlotRow; color: string }[];
  region: TelescopeRegionDefinition;
  reveal: Layer3RevealRef;
}) {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const shadowRefs = useRef<(THREE.Mesh | null)[]>([]);
  const liftedZ = useRef<number[]>([]);
  const liftCenter = useRef<Layer3LiftCenter>({ captured: false, x: 0, y: 0 });
  const shadowTexture = useMemo(getLayer3ShadowTexture, []);
  const [shownLabelIds, setShownLabelIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useFrame(({ camera, clock }, delta) => {
    const time = clock.elapsedTime;
    const [ux, uy] = region.direction;
    const positions = plots.map((plot) => {
      // 純粋感情のプロットは time で感情球のまわりを公転する
      const real = getTelescopePlotPosition(plot.row, time);
      return telescopeRegionToUnifiedSpace(region, real[0], real[1]);
    });

    let centeredIndex = -1;
    let centeredDistance = Infinity;
    const ndcDistances: number[] = [];
    positions.forEach((position, index) => {
      _layer3PlotProjected
        .set(position[0], position[1], LAYER3_PLOT_BASE_Z)
        .project(camera);
      if (_layer3PlotProjected.z < -1 || _layer3PlotProjected.z > 1) {
        ndcDistances[index] = Infinity;
        return;
      }
      const distance = ndcDistanceSqToAim(
        _layer3PlotProjected.x,
        _layer3PlotProjected.y,
      );
      ndcDistances[index] = distance;
      if (distance < centeredDistance) {
        centeredDistance = distance;
        centeredIndex = index;
      }
    });

    // 検知円内のイ形容詞プロットだけ引き出しラベルを表示する
    const nextShown = new Set<string>();
    plots.forEach((plot, index) => {
      if (
        plot.row.wordType === 'adjective' &&
        (ndcDistances[index] ?? Infinity) <= LAYER3_PLOT_CAPTURE_NDC ** 2
      ) {
        nextShown.add(plot.row.word_id);
      }
    });
    setShownLabelIds((previous) => {
      if (
        previous.size === nextShown.size &&
        [...nextShown].every((id) => previous.has(id))
      ) {
        return previous;
      }
      return nextShown;
    });

    const captured =
      centeredIndex >= 0 &&
      centeredDistance <= LAYER3_PLOT_CAPTURE_NDC ** 2;
    liftCenter.current.captured = captured;
    liftCenter.current.x = captured ? positions[centeredIndex][0] : 0;
    liftCenter.current.y = captured ? positions[centeredIndex][1] : 0;
    const blend = 1 - Math.exp(-LAYER3_PLOT_LIFT_SPEED * delta);

    positions.forEach((position, index) => {
      const group = groupRefs.current[index];
      if (!group) {
        return;
      }
      // バー基準の楕円の丘：長手方向は狭く、幅方向は帯全体が同じ丘に乗る
      const targetZ = layer3LiftZ(
        position[0],
        position[1],
        liftCenter.current,
        ux,
        uy,
      );
      const z = THREE.MathUtils.lerp(
        liftedZ.current[index] ?? LAYER3_PLOT_BASE_Z,
        targetZ,
        blend,
      );
      liftedZ.current[index] = z;
      group.position.set(position[0], position[1], z);

      // 入場スイープ：波面が通過するまで非表示、通過にあわせて成長させる
      const revealFactor = layer3RevealFactor(
        reveal.current,
        layer3AlongT(region, position[0], position[1]),
      );
      group.visible = revealFactor > 0.001;
      group.scale.setScalar(Math.max(0.0001, revealFactor));

      // 疑似影：グループの上昇分を打ち消して帯のすぐ上に留める。
      // 高く浮くほど影は広がって薄くなる。
      const shadow = shadowRefs.current[index];
      if (shadow) {
        const lift = THREE.MathUtils.clamp(
          (z - LAYER3_PLOT_BASE_Z) / LAYER3_PLOT_LIFT,
          0,
          1,
        );
        shadow.position.z = LAYER3_SHADOW_WORLD_Z - z;
        shadow.scale.setScalar(1 + lift * 0.7);
        (shadow.material as THREE.MeshBasicMaterial).opacity =
          0.4 * (1 - lift * 0.45) * revealFactor;
      }
    });
  });

  const leaderEnd: [number, number, number] = [
    region.direction[0] * LAYER3_LABEL_LEADER_ALONG,
    region.direction[1] * LAYER3_LABEL_LEADER_ALONG,
    LAYER3_LABEL_LEADER_UP,
  ];

  return (
    <group>
      {plots.map((plot, index) => (
        <group
          key={plot.row.word_id}
          ref={(group) => {
            groupRefs.current[index] = group;
          }}
          position={[0, 0, LAYER3_PLOT_BASE_Z]}
        >
          <mesh>
            <sphereGeometry args={[LAYER3_PLOT_RADIUS, 12, 12]} />
            <meshBasicMaterial color={plot.color} toneMapped={false} />
          </mesh>
          <mesh
            ref={(shadow) => {
              shadowRefs.current[index] = shadow;
            }}
            position={[0.018, -0.018, LAYER3_SHADOW_WORLD_Z - LAYER3_PLOT_BASE_Z]}
          >
            <circleGeometry args={[LAYER3_PLOT_RADIUS * 1.7, 20]} />
            <meshBasicMaterial
              color="#000000"
              alphaMap={shadowTexture}
              transparent
              opacity={0.4}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {plot.row.wordType === 'adjective' ? (
            <Layer3AdjectiveLeaderLabel
              word={plot.row.word_id}
              color={plot.color}
              leaderEnd={leaderEnd}
              shown={shownLabelIds.has(plot.row.word_id)}
            />
          ) : null}
        </group>
      ))}
      {plots
        .filter((plot) => isPurePlot(plot.row))
        .map((plot) => (
          <Layer3PurePlotTrail
            key={`trail-${plot.row.word_id}`}
            row={plot.row}
            color={plot.color}
            region={region}
            liftCenter={liftCenter}
            reveal={reveal}
          />
        ))}
    </group>
  );
}

/**
 * レイヤー3のバーの区画。両端の純粋感情ゾーンは円形セグメント1つずつに
 * まとめ、中央の混合領域は等間隔の矩形セグメントで区切る。
 * プロットを含む区画だけ、区画中心が画面中央へ近づいたときに発光させる。
 * 検知中の占有区画は segmentFocus へ報告する（レイヤー4入口）。
 */
function Layer3BarSegments({
  region,
  plots,
  width,
  startColor,
  endColor,
  reveal,
  segmentFocus,
}: {
  region: TelescopeRegionDefinition;
  plots: readonly { row: UserPlotRow; color: string }[];
  width: number;
  startColor: string;
  endColor: string;
  reveal: Layer3RevealRef;
  segmentFocus?: { current: TelescopeSegmentFocusState };
}) {
  const materialRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const dividerRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const highlightBlend = useRef<number[]>([]);
  const segments = useMemo(() => getLayer3SegmentLayout(width), [width]);
  const { dyadRadius, halfSpan, midHalf, segmentLength } =
    getLayer3SegmentMetrics(width);
  const segmentCount = segments.length;
  // 矩形ゾーンの区切り線（左右それぞれ両端含む境界位置）
  const dividerXs = useMemo(() => {
    const xs: number[] = [];
    for (let index = 0; index <= LAYER3_BAR_MID_SEGMENTS_PER_SIDE; index++) {
      xs.push(-midHalf + segmentLength * index);
      xs.push(dyadRadius + segmentLength * index);
    }
    return xs;
  }, [dyadRadius, midHalf, segmentLength]);

  useEffect(() => {
    if (!segmentFocus) {
      return;
    }
    segmentFocus.current.active = true;
    return () => {
      segmentFocus.current.active = false;
      segmentFocus.current.segmentIndex = null;
      segmentFocus.current.plotIds = [];
      segmentFocus.current.closeness = 0;
    };
  }, [segmentFocus]);

  useFrame(({ camera, clock }, delta) => {
    const bySegment = groupPlotsByLayer3Segment(
      region,
      plots.map((plot) => plot.row),
      clock.elapsedTime,
      width,
    );
    const occupied = new Array<boolean>(segmentCount).fill(false);
    for (const [index, ids] of bySegment) {
      if (ids.length > 0) {
        occupied[index] = true;
      }
    }

    const [ux, uy] = region.direction;
    let bestIndex: number | null = null;
    let bestCloseness = 0;

    for (let index = 0; index < segmentCount; index++) {
      const localX = segments[index].centerAlong;
      const worldX = region.midpoint[0] + ux * localX;
      const worldY = region.midpoint[1] + uy * localX;
      _layer3PlotProjected
        .set(worldX, worldY, LAYER3_PLOT_BASE_Z)
        .project(camera);
      const centerDistance = ndcDistanceToAim(
        _layer3PlotProjected.x,
        _layer3PlotProjected.y,
      );
      const onScreen =
        _layer3PlotProjected.z >= -1 && _layer3PlotProjected.z <= 1;
      const closeness = onScreen
        ? THREE.MathUtils.clamp(
            1 - centerDistance / LAYER3_BAR_HIGHLIGHT_RADIUS_NDC,
            0,
            1,
          )
        : 0;
      const target = occupied[index] ? closeness : 0;
      const blend = THREE.MathUtils.lerp(
        highlightBlend.current[index] ?? 0,
        target,
        1 - Math.exp(-LAYER3_BAR_HIGHLIGHT_SPEED * delta),
      );
      highlightBlend.current[index] = blend;

      if (occupied[index] && closeness > bestCloseness) {
        bestCloseness = closeness;
        bestIndex = index;
      }

      const revealFactor = layer3RevealFactor(
        reveal.current,
        localX / LAYER3_STRIP_LENGTH + 0.5,
      );
      const material = materialRefs.current[index];
      if (material) {
        material.opacity = blend * 0.62 * revealFactor;
      }
    }

    if (segmentFocus) {
      const shared = segmentFocus.current;
      shared.segmentIndex =
        bestIndex != null && bestCloseness > 0.05 ? bestIndex : null;
      shared.plotIds =
        shared.segmentIndex != null
          ? [...(bySegment.get(shared.segmentIndex) ?? [])]
          : [];
      shared.closeness = bestCloseness;
    }

    for (let index = 0; index < dividerXs.length; index++) {
      const divider = dividerRefs.current[index];
      if (divider) {
        divider.opacity =
          0.42 *
          layer3RevealFactor(
            reveal.current,
            dividerXs[index] / LAYER3_STRIP_LENGTH + 0.5,
          );
      }
    }
  });

  return (
    <group>
      {segments
        .filter((segment) => segment.kind !== 'mid')
        .map((segment) => (
          <mesh
            key={`circle-${segment.index}`}
            position={[segment.centerAlong, 0, 0.012]}
          >
            <circleGeometry
              args={[segment.pureRadius - LAYER3_BAR_SEGMENT_GAP * 0.5, 40]}
            />
            <meshBasicMaterial
              ref={(material) => {
                materialRefs.current[segment.index] = material;
              }}
              color={
                segment.kind === 'pure-start'
                  ? startColor
                  : segment.kind === 'pure-end'
                    ? endColor
                    : blendHex(startColor, endColor, 0.5)
              }
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
      {segments
        .filter((segment) => segment.kind === 'mid')
        .map((segment) => {
          const t = THREE.MathUtils.clamp(
            segment.centerAlong / (halfSpan * 2) + 0.5,
            0,
            1,
          );
          return (
            <mesh
              key={`highlight-${segment.index}`}
              position={[segment.centerAlong, 0, 0.012]}
            >
              <planeGeometry
                args={[
                  Math.max(0.01, segment.length - LAYER3_BAR_SEGMENT_GAP),
                  width * 0.96,
                ]}
              />
              <meshBasicMaterial
                ref={(material) => {
                  materialRefs.current[segment.index] = material;
                }}
                color={blendHex(startColor, endColor, t)}
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          );
        })}
      {dividerXs.map((x, index) => (
        <mesh key={`divider-${index}`} position={[x, 0, 0.014]}>
          <planeGeometry args={[LAYER3_BAR_SEGMENT_GAP, width * 0.94]} />
          <meshBasicMaterial
            ref={(material) => {
              dividerRefs.current[index] = material;
            }}
            color="#090b13"
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * レイヤー3の現在位置インジケータ用の共有状態。
 * Canvas 内のレポーターが毎フレーム書き込み、DOM 側の HUD が読み取る。
 */
export interface TelescopeRegionIndicatorState {
  /** レイヤー3表示中か（false なら HUD は非表示） */
  active: boolean;
  /** バーの画面上の傾き（ラジアン） */
  angle: number;
  /** 現在位置（0=start、1=end。progressMin〜progressMax の範囲） */
  progress: number;
  /** 入場演出の進行度（HUD のフェードに使う） */
  reveal: number;
  startColor: string;
  endColor: string;
  /** 中央（progress 0.5）にある24感情の色 */
  midColor: string;
}

export function createTelescopeRegionIndicatorState(): TelescopeRegionIndicatorState {
  return {
    active: false,
    angle: 0,
    progress: 0.5,
    reveal: 0,
    startColor: '#ffffff',
    endColor: '#ffffff',
    midColor: '#ffffff',
  };
}

/** レイヤー3で画面中央に捉えている区画（クリックでレイヤー4へ入る） */
export interface TelescopeSegmentFocusState {
  active: boolean;
  segmentIndex: number | null;
  plotIds: string[];
  closeness: number;
}

export function createTelescopeSegmentFocusState(): TelescopeSegmentFocusState {
  return {
    active: false,
    segmentIndex: null,
    plotIds: [],
    closeness: 0,
  };
}

/**
 * 画面固定 HUD の現在位置インジケータへ、バーの画面上の傾きと
 * 視線中央がバーと交わる位置（現在位置）を毎フレーム報告する。
 */
function Layer3IndicatorReporter({
  region,
  reveal,
  state,
}: {
  region: TelescopeRegionDefinition;
  reveal: Layer3RevealRef;
  state: { current: TelescopeRegionIndicatorState };
}) {
  const projStart = useMemo(() => new THREE.Vector3(), []);
  const projEnd = useMemo(() => new THREE.Vector3(), []);
  const viewDirection = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const shared = state.current;
    shared.active = true;
    shared.startColor = region.start.color;
    shared.endColor = region.end.color;
    shared.midColor = blendHex(region.start.color, region.end.color, 0.5);
    return () => {
      shared.active = false;
      shared.reveal = 0;
    };
  }, [state, region]);

  useFrame(({ camera, size }) => {
    // バーの両端を画面座標へ投影し、線の傾きをそろえる
    projStart.set(...region.start.position).project(camera);
    projEnd.set(...region.end.position).project(camera);
    const dxPx = (projEnd.x - projStart.x) * size.width * 0.5;
    const dyPx = -(projEnd.y - projStart.y) * size.height * 0.5;

    // カメラ視線（画面中央）がバー平面（z=0）と交わる点 = 現在位置。
    // 検知照準（カーソル）とは独立して、カメラのスクロール位置を示す。
    camera.getWorldDirection(viewDirection);
    let progress = state.current.progress;
    if (Math.abs(viewDirection.z) > 1e-5) {
      const k = -camera.position.z / viewDirection.z;
      const hitX = camera.position.x + viewDirection.x * k;
      const hitY = camera.position.y + viewDirection.y * k;
      const along =
        (hitX - region.start.position[0]) * region.direction[0] +
        (hitY - region.start.position[1]) * region.direction[1];
      progress = THREE.MathUtils.clamp(
        along / TELESCOPE_REGION_VIEW.spanLength,
        TELESCOPE_REGION_VIEW.progressMin,
        TELESCOPE_REGION_VIEW.progressMax,
      );
    }

    const shared = state.current;
    shared.angle = Math.atan2(dyPx, dxPx);
    shared.progress = progress;
    shared.reveal = reveal.current;
  });

  return null;
}

function Layer3EmotionRegion({
  selectedDyadId,
  focusBasicId,
  plots,
  leaving,
  indicator,
  segmentFocus,
  explorationPlotId,
  explorationSegmentIndex,
  onSelectExplorationPlot,
}: {
  selectedDyadId: EmotionId;
  focusBasicId: BasicEmotionId | null;
  plots: readonly UserPlotRow[];
  /** レイヤー2へ戻る最中はフェードアウト方向に演出を巻き戻す */
  leaving: boolean;
  /** 画面固定 HUD の現在位置インジケータと共有する状態 */
  indicator?: { current: TelescopeRegionIndicatorState };
  /** 中央検知区画の共有状態（レイヤー4入口） */
  segmentFocus?: { current: TelescopeSegmentFocusState };
  /** レイヤー4で選択中の感情点。指定時は探索シーンを描画 */
  explorationPlotId?: string | null;
  /** レイヤー4で選択中の区画 */
  explorationSegmentIndex?: number | null;
  onSelectExplorationPlot?: (id: string) => void;
}) {
  const region = useMemo(
    () => getTelescopeRegionDefinition(selectedDyadId, focusBasicId),
    [selectedDyadId, focusBasicId],
  );
  const reveal = useRef(0);
  const lastAppliedReveal = useRef(-1);

  // プライマリ感情で絞り込み、統一空間上で帯付近の点だけを残す。
  // 選択中の24感情＋両端の2基本感情のみ（他の24感情の点は位置が重なっても出さない）。
  const regionPlots = useMemo(() => {
    if (!region) {
      return [];
    }
    const allowedPrimary = new Set<string>([
      selectedDyadId,
      region.start.id,
      region.end.id,
    ]);
    const [sx, sy] = region.start.position;
    const [dirX, dirY] = region.direction;
    const result: { row: UserPlotRow; color: string }[] = [];
    plots.forEach((plot) => {
      if (!allowedPrimary.has(plot.primaryId)) {
        return;
      }
      const real = getTelescopePlotPosition(plot);
      const [x, y] = telescopeRegionToUnifiedSpace(region, real[0], real[1]);
      const relX = x - sx;
      const relY = y - sy;
      const along = relX * dirX + relY * dirY;
      const perp = dirX * relY - dirY * relX;
      if (
        along < -LAYER3_REGION_LENGTH_PAD ||
        along > TELESCOPE_REGION_VIEW.spanLength + LAYER3_REGION_LENGTH_PAD ||
        Math.abs(perp) > TELESCOPE_REGION_VIEW.regionHalfWidth
      ) {
        return;
      }
      result.push({ row: plot, color: plotColorFromRow(plot) });
    });
    return result;
  }, [plots, region, selectedDyadId]);

  const startColor = region?.start.color ?? '#ffffff';
  const endColor = region?.end.color ?? '#ffffff';
  const stripLength = LAYER3_STRIP_LENGTH;
  const width = TELESCOPE_REGION_VIEW.regionHalfWidth * 2;

  // 両端を丸めたスタジアム形状＋ start → end のグラデーション。
  // 頂点カラーは RGBA で持ち、A を入場演出のスイープに使う。
  const stripGeometry = useMemo(() => {
    const halfL = stripLength / 2;
    const halfW = width / 2;
    const radius = halfW;
    const shape = new THREE.Shape();
    shape.moveTo(-halfL + radius, -halfW);
    shape.lineTo(halfL - radius, -halfW);
    shape.absarc(halfL - radius, 0, radius, -Math.PI / 2, Math.PI / 2, false);
    shape.lineTo(-halfL + radius, halfW);
    shape.absarc(-halfL + radius, 0, radius, Math.PI / 2, (3 * Math.PI) / 2, false);

    const geometry = new THREE.ShapeGeometry(shape, 24);
    const positionAttribute = geometry.attributes.position;
    const colors = new Float32Array(positionAttribute.count * 4);
    const colorStart = new THREE.Color(startColor);
    const colorEnd = new THREE.Color(endColor);
    const mixed = new THREE.Color();
    for (let index = 0; index < positionAttribute.count; index++) {
      const t = THREE.MathUtils.clamp(
        positionAttribute.getX(index) / stripLength + 0.5,
        0,
        1,
      );
      mixed.copy(colorStart).lerp(colorEnd, t);
      colors[index * 4] = mixed.r;
      colors[index * 4 + 1] = mixed.g;
      colors[index * 4 + 2] = mixed.b;
      colors[index * 4 + 3] = 0;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    return geometry;
  }, [stripLength, width, startColor, endColor]);

  useEffect(() => () => stripGeometry.dispose(), [stripGeometry]);

  useFrame((_, delta) => {
    // 入場は end（手前）側から掃くように、退場は素早く全体を巻き戻す
    const step = delta / LAYER3_REVEAL_DURATION_S;
    const next = THREE.MathUtils.clamp(
      reveal.current + (leaving ? -step * 2.5 : step),
      0,
      1,
    );
    reveal.current = next;
    if (Math.abs(next - lastAppliedReveal.current) < 0.0005) {
      return;
    }
    lastAppliedReveal.current = next;
    const colorAttribute = stripGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute;
    const positionAttribute = stripGeometry.getAttribute('position');
    for (let index = 0; index < positionAttribute.count; index++) {
      const t = THREE.MathUtils.clamp(
        positionAttribute.getX(index) / stripLength + 0.5,
        0,
        1,
      );
      colorAttribute.setW(index, layer3RevealFactor(next, t));
    }
    colorAttribute.needsUpdate = true;
  });

  if (!region) {
    return null;
  }

  const dx = region.end.position[0] - region.start.position[0];
  const dy = region.end.position[1] - region.start.position[1];
  const rotation = Math.atan2(dy, dx);

  return (
    <group>
      <group
        position={[region.midpoint[0], region.midpoint[1], -0.08]}
        rotation={[0, 0, rotation]}
      >
        <mesh geometry={stripGeometry}>
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.2}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <Layer3BarSegments
          region={region}
          plots={regionPlots}
          width={width}
          startColor={startColor}
          endColor={endColor}
          reveal={reveal}
          segmentFocus={explorationPlotId ? undefined : segmentFocus}
        />
      </group>

      {!explorationPlotId
        ? [region.start, region.end].map((node) => (
            <Layer2EmotionLabel
              key={node.id}
              node={node}
              color={node.color}
              trackRadius={0.16}
              fontSize={0.07}
              reveal={reveal}
              revealAlongT={layer3AlongT(
                region,
                node.position[0],
                node.position[1],
              )}
            />
          ))
        : null}

      {!explorationPlotId ? (
        <Layer2EmotionLabel
          node={{
            id: region.id,
            label: region.label,
            color: blendHex(startColor, endColor, 0.5),
            position: region.midpoint,
            kind: 'dyad',
          }}
          color={blendHex(startColor, endColor, 0.5)}
          trackRadius={0.16}
          fontSize={0.07}
          reveal={reveal}
          revealAlongT={0.5}
        />
      ) : null}

      {explorationPlotId &&
      explorationSegmentIndex != null &&
      onSelectExplorationPlot ? (
        <Layer4ExplorationLayer
          region={region}
          plots={regionPlots.map((plot) => plot.row)}
          selectedSegmentIndex={explorationSegmentIndex}
          selectedPlotId={explorationPlotId}
          onSelectPlot={onSelectExplorationPlot}
        />
      ) : (
        <Layer3RegionPlots plots={regionPlots} region={region} reveal={reveal} />
      )}
      {indicator && !explorationPlotId ? (
        <Layer3IndicatorReporter
          region={region}
          reveal={reveal}
          state={indicator}
        />
      ) : null}
    </group>
  );
}

interface TelescopeGalaxyLayerProps {
  zoomPhase: TelescopeZoomPhase;
  detailVisibility: number;
  /** Layer2 シーン（関連感情の強調表示）が有効か */
  layer2SceneActive?: boolean;
  /** Layer2 へのカメラ到着済み（バー登場アニメーション開始トリガー） */
  layer2Arrived?: boolean;
  /** 3段階目の中心感情（ロック）— 配置は変えず、強調と検知対象に使う */
  focusBasicId: BasicEmotionId | null;
  selectedDyadId: EmotionId | null;
  wordPlots: readonly UserPlotRow[];
  onViewFocus?: (focus: TelescopeViewFocus) => void;
  /** レイヤー3の現在位置インジケータ（画面固定 HUD）との共有状態 */
  regionIndicator?: { current: TelescopeRegionIndicatorState };
  /** レイヤー3の中央検知区画（レイヤー4入口） */
  segmentFocus?: { current: TelescopeSegmentFocusState };
  /** レイヤー4で選択中の感情点 */
  explorationPlotId?: string | null;
  /** レイヤー4で選択中の区画 */
  explorationSegmentIndex?: number | null;
  onSelectExplorationPlot?: (id: string) => void;
}

export function TelescopeGalaxyLayer({
  zoomPhase,
  detailVisibility,
  layer2SceneActive = false,
  layer2Arrived = false,
  focusBasicId,
  selectedDyadId,
  wordPlots,
  onViewFocus,
  regionIndicator,
  segmentFocus,
  explorationPlotId = null,
  explorationSegmentIndex = null,
  onSelectExplorationPlot,
}: TelescopeGalaxyLayerProps) {
  const detailColors = useDetailColors();
  const projected = useRef(new THREE.Vector3());
  const lastKey = useRef('');
  const lastFocusCheckAt = useRef(-Infinity);
  const onFocusRef = useRef(onViewFocus);
  onFocusRef.current = onViewFocus;
  const focusedBarPartnerRef = useRef<BasicEmotionId | null>(null);
  /** 花弁ハイライト対象の基本感情（レイヤー1=検知中、レイヤー2=バー方向の相手） */
  const petalHighlightRef = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const relatedIds = useMemo(
    () => (focusBasicId ? getRelatedFocusNodeIds(focusBasicId) : null),
    [focusBasicId],
  );

  const inExplorationView =
    Boolean(selectedDyadId) &&
    Boolean(explorationPlotId) &&
    (zoomPhase === 'entering-exploration' ||
      zoomPhase === 'exploration' ||
      zoomPhase === 'leaving-exploration');
  const inRegionView =
    Boolean(selectedDyadId) &&
    (zoomPhase === 'entering-region' ||
      zoomPhase === 'region' ||
      zoomPhase === 'leaving-region' ||
      inExplorationView);
  const inFocusView =
    Boolean(focusBasicId) &&
    layer2SceneActive &&
    (zoomPhase === 'zooming-in' ||
      zoomPhase === 'detail' ||
      zoomPhase === 'zooming-out');

  useFrame(({ camera, clock }) => {
    const report = onFocusRef.current;
    if (!report) {
      return;
    }

    const inView =
      zoomPhase === 'wide' ||
      zoomPhase === 'zooming-in' ||
      zoomPhase === 'detail' ||
      zoomPhase === 'entering-region' ||
      zoomPhase === 'region' ||
      zoomPhase === 'leaving-region' ||
      zoomPhase === 'entering-exploration' ||
      zoomPhase === 'exploration' ||
      zoomPhase === 'leaving-exploration' ||
      zoomPhase === 'zooming-out';

    if (!inView) {
      petalHighlightRef.current = null;
      if (lastKey.current !== '') {
        lastKey.current = '';
        setFocusedId(null);
        report({ nearest: null, nearby: [] });
      }
      return;
    }

    if (
      clock.elapsedTime - lastFocusCheckAt.current <
      REACT_FOCUS_INTERVAL_SECONDS
    ) {
      return;
    }
    lastFocusCheckAt.current = clock.elapsedTime;

    type Hit = {
      id: string;
      label: string;
      color: string;
      angle: number;
      dist: number;
      nx: number;
      ny: number;
    };
    const insideHits: Hit[] = [];
    const outsideHits: Hit[] = [];

    const consider = (node: TelescopeNodePosition, color: string, minOpacity: number) => {
      if (minOpacity < 0.05) {
        return;
      }
      projected.current.set(node.position[0], node.position[1], node.position[2]);
      projected.current.project(camera);
      if (projected.current.z < -1 || projected.current.z > 1) {
        return;
      }
      const nx = projected.current.x;
      const ny = projected.current.y;
      const dist = ndcDistanceToAim(nx, ny);
      const hit: Hit = {
        id: node.id,
        label: node.label,
        color,
        angle: ndcAngleFromAim(nx, ny),
        dist,
        nx,
        ny,
      };
      if (dist < DETECT_RADIUS_NDC) {
        insideHits.push(hit);
      } else if (dist <= OUTSIDE_MAX_NDC) {
        outsideHits.push(hit);
      }
    };

    // Layer2では基本8感情を検知対象から外し、合成感情だけを検知する。
    if (!inFocusView) {
      for (const node of TELESCOPE_GALAXY_NODES) {
        consider(node, node.color, 1);
      }
    }

    const includeDyadsAsTargets =
      layer2SceneActive ||
      zoomPhase === 'zooming-in' ||
      zoomPhase === 'detail';
    if (includeDyadsAsTargets) {
      for (const node of TELESCOPE_DETAIL_NODES) {
        if (inFocusView && relatedIds && !relatedIds.has(node.id)) {
          continue;
        }
        const op = Math.max(detailVisibility, inFocusView ? 1 : 0);
        consider(node, detailColors.get(node.id) ?? node.color, op);
      }
    }

    let nearest: TelescopeNearestEmotion | null = null;
    if (inRegionView && selectedDyadId) {
      const emotion = getEmotionById(selectedDyadId);
      const node = TELESCOPE_DETAIL_NODES.find(
        (candidate) => candidate.id === selectedDyadId,
      );
      if (node) {
        nearest = {
          id: selectedDyadId,
          label: emotion.label,
          color: detailColors.get(selectedDyadId) ?? node.color,
          angle: 0,
          nx: 0,
          ny: 0,
        };
      }
    } else if (inFocusView && focusBasicId) {
      // Layer2: 画面中央のバー選択と検知ラベルを一致させる
      const partnerId = focusedBarPartnerRef.current;
      if (partnerId) {
        const dyad = findDyadByComponents(focusBasicId, partnerId);
        const dyadNode = dyad
          ? TELESCOPE_DETAIL_NODES.find((node) => node.id === dyad.id)
          : null;
        if (dyad && dyadNode) {
          projected.current.set(
            dyadNode.position[0],
            dyadNode.position[1],
            dyadNode.position[2],
          );
          projected.current.project(camera);
          nearest = {
            id: dyad.id,
            label: dyad.label,
            color: detailColors.get(dyad.id) ?? dyadNode.color,
            angle: ndcAngleFromAim(projected.current.x, projected.current.y),
            nx: projected.current.x,
            ny: projected.current.y,
          };
        }
      }
    } else if (insideHits.length > 0) {
      insideHits.sort((a, b) => a.dist - b.dist);
      const nearestHit = insideHits[0];
      nearest = {
        id: nearestHit.id,
        label: nearestHit.label,
        color: nearestHit.color,
        angle: nearestHit.angle,
        nx: nearestHit.nx,
        ny: nearestHit.ny,
      };
    }

    const nearestId = nearest?.id ?? null;
    const directionCandidates = (
      inRegionView
        ? []
        : [...insideHits.slice(nearest ? 1 : 0), ...outsideHits]
    ).sort((a, b) => a.dist - b.dist);
    const filteredCandidates = directionCandidates.filter((hit) => {
      if (hit.id === nearestId) {
        return false;
      }
      if (!inFocusView) {
        return true;
      }
      // Layer2では合成感情だけを方向ラベルにする
      return hit.id.startsWith('dyad-');
    });
    const nearby: TelescopeNearbyEmotionGlow[] = (
      inFocusView
        ? filteredCandidates
        : filteredCandidates.slice(0, MAX_RIM_GLOWS)
    ).map((hit) => {
        const overshoot = hit.dist - HOLE_EDGE_NDC;
        const weight =
          hit.dist < HOLE_EDGE_NDC
            ? Math.max(0.35, 1 - hit.dist / HOLE_EDGE_NDC)
            : Math.max(0.2, Math.min(1, 1 / (1 + overshoot * 1.1)));
        return {
          id: hit.id,
          color: hit.color,
          angle: hit.angle,
          nx: hit.nx,
          ny: hit.ny,
          weight,
          onScreen: Math.abs(hit.nx) <= 1.02 && Math.abs(hit.ny) <= 1.02,
        };
      });

    // レイヤー1は検知中の感情、レイヤー2はバー方向の相手の基本感情を花弁ハイライト
    petalHighlightRef.current = inFocusView
      ? focusedBarPartnerRef.current
      : (nearest?.id ?? null);

    if (!nearest && nearby.length === 0) {
      if (lastKey.current !== '') {
        lastKey.current = '';
        setFocusedId(null);
        report({ nearest: null, nearby: [] });
      }
      return;
    }

    const key = `${nearest?.id ?? ''}:${nearest?.angle.toFixed(2) ?? ''}:${nearby
      .map((n) => `${n.id}@${n.angle.toFixed(2)}`)
      .join(',')}:f${focusBasicId ?? ''}:b${focusedBarPartnerRef.current ?? ''}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      setFocusedId(nearest?.id ?? null);
      report({ nearest, nearby });
    }
  });

  return (
    <group>
      {!inRegionView ? (
        <PlutchikPetalBackdrop highlightRef={petalHighlightRef} />
      ) : null}
      {inRegionView && selectedDyadId ? (
        <Layer3EmotionRegion
          selectedDyadId={selectedDyadId}
          focusBasicId={focusBasicId}
          plots={wordPlots}
          leaving={zoomPhase === 'leaving-region'}
          indicator={regionIndicator}
          segmentFocus={segmentFocus}
          explorationPlotId={
            inExplorationView || zoomPhase === 'leaving-exploration'
              ? explorationPlotId
              : null
          }
          explorationSegmentIndex={explorationSegmentIndex}
          onSelectExplorationPlot={onSelectExplorationPlot}
        />
      ) : null}
      {!inRegionView ? (
        <>
      <BasicEmotionOrbits
        visible={
          zoomPhase === 'approaching' ||
          zoomPhase === 'wide' ||
          ((zoomPhase === 'zooming-in' || zoomPhase === 'zooming-out') &&
            !inFocusView)
        }
      />
      <BasicEmotionWebLines
        visible={
          zoomPhase === 'approaching' ||
          zoomPhase === 'wide' ||
          ((zoomPhase === 'zooming-in' || zoomPhase === 'zooming-out') &&
            !inFocusView)
        }
      />
      {inFocusView && focusBasicId ? (
        <>
          <Layer2RadialGrid />
          <Layer2EmotionFloorMarkers
            focusBasicId={focusBasicId}
            visible={zoomPhase === 'detail'}
          />
          <RelatedEmotionBars
            focusBasicId={focusBasicId}
            visible={zoomPhase === 'detail' || layer2Arrived}
            onFocusedPartnerChange={(partnerId) => {
              focusedBarPartnerRef.current = partnerId;
            }}
          />
          <Layer2RelatedEmotionLabels focusBasicId={focusBasicId} />
        </>
      ) : null}
      <TelescopeWordPlotLayer
        plots={wordPlots}
        opacity={detailVisibility}
        visible={inFocusView}
        focusBasicId={focusBasicId}
      />
      {inFocusView
        ? TELESCOPE_GALAXY_NODES.filter(
            (node) => node.id !== focusBasicId,
          ).map((node) => (
            <EmotionStar
              key={`layer2-basic-${node.id}`}
              node={node}
              radius={TELESCOPE_BASIC_SPHERE_RADIUS}
              color={node.color}
              opacity={0.42}
              emissiveBoost={0.35}
              pointCloud
              pointCount={84}
            />
          ))
        : null}
      {!inFocusView
        ? TELESCOPE_GALAXY_NODES.map((node) => {
            const isSelected = focusBasicId === node.id;
            const related = !relatedIds || relatedIds.has(node.id);
            return (
              <EmotionStar
                key={node.id}
                node={node}
                radius={TELESCOPE_BASIC_SPHERE_RADIUS}
                color={node.color}
                opacity={1}
                emissiveBoost={isSelected ? 0.7 : related ? 0.4 : 0.55}
                focused={focusedId === node.id}
                pointCloud
              />
            );
          })
        : null}
      {!inFocusView
        ? TELESCOPE_DETAIL_NODES.map((node) => {
            const related = !relatedIds || relatedIds.has(node.id);
            const opacity = detailVisibility;
            if (opacity < 0.02) {
              return null;
            }
            return (
              <EmotionStar
                key={node.id}
                node={node}
                radius={TELESCOPE_DYAD_SPHERE_RADIUS}
                color={detailColors.get(node.id) ?? node.color}
                opacity={opacity}
                emissiveBoost={related ? 0.7 : 0.5}
                focused={focusedId === node.id}
                pointCloud
                pointCount={52}
              />
            );
          })
        : null}
        </>
      ) : null}
    </group>
  );
}

export function resolveFocusBasicId(
  nearestId: string | null | undefined,
): BasicEmotionId | null {
  if (!nearestId) {
    return null;
  }
  if (isBasicEmotionId(nearestId as BasicEmotionId)) {
    return nearestId as BasicEmotionId;
  }
  return null;
}
