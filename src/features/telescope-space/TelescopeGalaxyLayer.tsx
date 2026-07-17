import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BasicEmotionId } from '../../data/emotions';
import {
  DYAD_EMOTIONS,
  findDyadByComponents,
  getBasicEmotion,
  isBasicEmotionId,
} from '../../data/emotions';
import type { UserPlotRow } from '../../types/userPlot';
import { blendHex } from '../../utils/emotionColor';
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
import { TelescopeWordPlotLayer } from './TelescopeWordPlotLayer';
import type {
  TelescopeNearestEmotion,
  TelescopeNearbyEmotionGlow,
  TelescopeViewFocus,
} from './telescopeFocus';

export type { TelescopeNearestEmotion, TelescopeNearbyEmotionGlow, TelescopeViewFocus };

/** NDC でののぞき穴縁（正方形キャンバス内接円 ≈ 1） */
const HOLE_EDGE_NDC = 0.92;
/** 穴の外インジケータの最大距離 */
const OUTSIDE_MAX_NDC = 3.5;
/** ふち光は近い外側感情を複数出してよい */
const MAX_RIM_GLOWS = 8;
const REACT_FOCUS_INTERVAL_SECONDS = 1 / 24;
const LAYER2_BASIC_FLOOR_RADIUS = TELESCOPE_BASIC_SPHERE_RADIUS;
const LAYER2_DYAD_FLOOR_RADIUS = TELESCOPE_DYAD_SPHERE_RADIUS * 1.15;
const LAYER2_FLOOR_MARKER_Z = -0.14;
const LAYER2_BAR_FOCUS_RADIUS_NDC = 0.3;
const _barProjectedStart = new THREE.Vector3();
const _barProjectedEnd = new THREE.Vector3();

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
      orbitLabelRef.current.rotation.z = -(t * (Math.PI * 2)) / 28;
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
        const ax = _barProjectedStart.x;
        const ay = _barProjectedStart.y;
        const dx = _barProjectedEnd.x - ax;
        const dy = _barProjectedEnd.y - ay;
        const lengthSq = dx * dx + dy * dy;
        const t =
          lengthSq > 1e-8
            ? THREE.MathUtils.clamp(-(ax * dx + ay * dy) / lengthSq, 0, 1)
            : 0;
        const distance = Math.hypot(ax + dx * t, ay + dy * t);
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
}: {
  node: TelescopeNodePosition;
  color: string;
}) {
  const orbitRef = useRef<THREE.Group>(null);
  const trackRadius = TELESCOPE_DYAD_SPHERE_RADIUS * 1.9;
  const initialPhase = useMemo(
    () => seededRandom(`label:${node.id}`)() * Math.PI * 2,
    [node.id],
  );

  useFrame(({ clock }) => {
    if (orbitRef.current) {
      orbitRef.current.rotation.z =
        initialPhase - (clock.elapsedTime * Math.PI * 2) / 28;
    }
  });

  return (
    <group position={node.position}>
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
        <group ref={orbitRef}>
          <Text
            position={[trackRadius, 0, 0]}
            rotation={[0, 0, -Math.PI / 2]}
            fontSize={0.065}
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

interface TelescopeGalaxyLayerProps {
  zoomPhase: TelescopeZoomPhase;
  detailVisibility: number;
  /** Layer2 シーン（関連感情の強調表示）が有効か */
  layer2SceneActive?: boolean;
  /** 3段階目の中心感情（ロック）— 配置は変えず、強調と検知対象に使う */
  focusBasicId: BasicEmotionId | null;
  wordPlots: readonly UserPlotRow[];
  onViewFocus?: (focus: TelescopeViewFocus) => void;
}

export function TelescopeGalaxyLayer({
  zoomPhase,
  detailVisibility,
  layer2SceneActive = false,
  focusBasicId,
  wordPlots,
  onViewFocus,
}: TelescopeGalaxyLayerProps) {
  const detailColors = useDetailColors();
  const projected = useRef(new THREE.Vector3());
  const lastKey = useRef('');
  const lastFocusCheckAt = useRef(-Infinity);
  const onFocusRef = useRef(onViewFocus);
  onFocusRef.current = onViewFocus;
  const focusedBarPartnerRef = useRef<BasicEmotionId | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const relatedIds = useMemo(
    () => (focusBasicId ? getRelatedFocusNodeIds(focusBasicId) : null),
    [focusBasicId],
  );

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
      zoomPhase === 'zooming-out';

    if (!inView) {
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
      const dist = Math.hypot(nx, ny);
      const hit: Hit = {
        id: node.id,
        label: node.label,
        color,
        angle: Math.atan2(ny, nx),
        dist,
        nx,
        ny,
      };
      if (dist < HOLE_EDGE_NDC) {
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
    if (inFocusView && focusBasicId) {
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
            angle: Math.atan2(projected.current.y, projected.current.x),
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
    const directionCandidates = [
      ...insideHits.slice(nearest ? 1 : 0),
      ...outsideHits,
    ].sort((a, b) => a.dist - b.dist);
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
      <BasicEmotionOrbits
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
            visible={zoomPhase === 'detail'}
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
                emissiveBoost={related ? 0.55 : 0.4}
                focused={focusedId === node.id}
                pointCloud
                pointCount={52}
              />
            );
          })
        : null}
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
