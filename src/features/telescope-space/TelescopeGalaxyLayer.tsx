import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BasicEmotionId } from '../../data/emotions';
import { DYAD_EMOTIONS, getBasicEmotion, isBasicEmotionId } from '../../data/emotions';
import { blendHex } from '../../utils/emotionColor';
import {
  TELESCOPE_BASIC_SPHERE_RADIUS,
  TELESCOPE_DYAD_SPHERE_RADIUS,
  TELESCOPE_DETAIL_NODES,
  TELESCOPE_GALAXY_NODES,
  type TelescopeNodePosition,
  type TelescopeZoomPhase,
} from './constants';
import { getRelatedFocusNodeIds } from './focusCameraView';
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

/** 詳細視点で非関連の合成感情は非表示 */
const UNRELATED_DYAD_OPACITY = 0;
/** 詳細視点で、選択以外の基本感情の薄さ */
const OTHER_BASIC_OPACITY = 0.28;

function EmotionStar({
  node,
  radius,
  color,
  opacity,
  emissiveBoost = 0.35,
  focused = false,
}: {
  node: TelescopeNodePosition;
  radius: number;
  color: string;
  opacity: number;
  emissiveBoost?: number;
  focused?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const orbitLabelRef = useRef<THREE.Group>(null);
  const pulse = useRef(Math.random() * Math.PI * 2);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const t = state.clock.elapsedTime;
    const scale = 1 + Math.sin(t * 1.1 + pulse.current) * 0.04;
    group.scale.setScalar(scale);
    if (orbitLabelRef.current) {
      orbitLabelRef.current.rotation.z = -(t * (Math.PI * 2)) / 28;
    }
  });

  if (opacity < 0.02) {
    return null;
  }

  const trackR = radius * 1.72;
  const trackHalfWidth = radius * 0.014;
  const labelFont = Math.max(radius * 0.48, 0.055);

  return (
    <group ref={groupRef} position={node.position}>
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

      {focused && (
        <group>
          <mesh>
            <ringGeometry
              args={[trackR - trackHalfWidth, trackR + trackHalfWidth, 64]}
            />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.88}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <ringGeometry
              args={[trackR - trackHalfWidth * 4, trackR + trackHalfWidth * 4, 64]}
            />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.14}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
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
        </group>
      )}
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

interface TelescopeGalaxyLayerProps {
  zoomPhase: TelescopeZoomPhase;
  detailVisibility: number;
  /** 3段階目の中心感情（ロック）— 配置は変えず、強調と検知対象に使う */
  focusBasicId: BasicEmotionId | null;
  onViewFocus?: (focus: TelescopeViewFocus) => void;
}

export function TelescopeGalaxyLayer({
  zoomPhase,
  detailVisibility,
  focusBasicId,
  onViewFocus,
}: TelescopeGalaxyLayerProps) {
  const detailColors = useDetailColors();
  const projected = useRef(new THREE.Vector3());
  const lastKey = useRef('');
  const onFocusRef = useRef(onViewFocus);
  onFocusRef.current = onViewFocus;
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const relatedIds = useMemo(
    () => (focusBasicId ? getRelatedFocusNodeIds(focusBasicId) : null),
    [focusBasicId],
  );

  const inFocusView =
    Boolean(focusBasicId) &&
    (zoomPhase === 'zooming-in' ||
      zoomPhase === 'detail' ||
      zoomPhase === 'zooming-out');

  useFrame(({ camera }) => {
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

    for (const node of TELESCOPE_GALAXY_NODES) {
      if (inFocusView) {
        const isSelected = focusBasicId === node.id;
        consider(node, node.color, isSelected ? 1 : OTHER_BASIC_OPACITY);
      } else {
        consider(node, node.color, 1);
      }
    }

    const includeDyadsAsTargets =
      inFocusView || zoomPhase === 'zooming-in' || zoomPhase === 'detail';
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
    if (insideHits.length > 0) {
      insideHits.sort((a, b) => a.dist - b.dist);
      const nearestHit = insideHits[0];
      nearest = {
        id: nearestHit.id,
        label: nearestHit.label,
        color: nearestHit.color,
        angle: nearestHit.angle,
      };
    }

    outsideHits.sort((a, b) => a.dist - b.dist);
    const nearestId = nearest?.id ?? null;
    const nearby: TelescopeNearbyEmotionGlow[] = outsideHits
      .filter((hit) => hit.id !== nearestId)
      .slice(0, MAX_RIM_GLOWS)
      .map((hit) => {
        const overshoot = hit.dist - HOLE_EDGE_NDC;
        const weight = Math.max(0.2, Math.min(1, 1 / (1 + overshoot * 1.1)));
        return {
          id: hit.id,
          color: hit.color,
          angle: hit.angle,
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
      .join(',')}:f${focusBasicId ?? ''}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      setFocusedId(nearest?.id ?? null);
      report({ nearest, nearby });
    }
  });

  return (
    <group>
      {TELESCOPE_GALAXY_NODES.map((node) => {
        const isSelected = focusBasicId === node.id;
        const related = !relatedIds || relatedIds.has(node.id);
        let opacity = 1;
        if (inFocusView) {
          opacity = isSelected ? 1 : OTHER_BASIC_OPACITY;
        }
        return (
          <EmotionStar
            key={node.id}
            node={node}
            radius={TELESCOPE_BASIC_SPHERE_RADIUS}
            color={node.color}
            opacity={opacity}
            emissiveBoost={isSelected ? 0.7 : related && inFocusView ? 0.4 : 0.55}
            focused={focusedId === node.id}
          />
        );
      })}
      {TELESCOPE_DETAIL_NODES.map((node) => {
        const related = !relatedIds || relatedIds.has(node.id);
        let opacity = detailVisibility;
        if (inFocusView) {
          opacity = related ? 1 : UNRELATED_DYAD_OPACITY;
        }
        return (
          <EmotionStar
            key={node.id}
            node={node}
            radius={TELESCOPE_DYAD_SPHERE_RADIUS}
            color={detailColors.get(node.id) ?? node.color}
            opacity={opacity}
            emissiveBoost={related && inFocusView ? 0.55 : 0.4}
            focused={inFocusView && focusedId === node.id}
          />
        );
      })}
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
