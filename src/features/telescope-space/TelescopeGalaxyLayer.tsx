import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BasicEmotionId } from '../../data/emotions';
import {
  DYAD_EMOTIONS,
  getBasicEmotion,
  isBasicEmotionId,
} from '../../data/emotions';
import { blendHex } from '../../utils/emotionColor';
import {
  TELESCOPE_BASIC_SPHERE_RADIUS,
  TELESCOPE_DYAD_SPHERE_RADIUS,
  TELESCOPE_DETAIL_NODES,
  TELESCOPE_GALAXY_NODES,
  type TelescopeNodePosition,
  type TelescopeZoomPhase,
} from './constants';
import { getRelatedFocusNodeIds, getDyadPartnerBasicIds } from './focusCameraView';
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
const EDGE_DISTORT_INNER_NDC = 0.26;
const EDGE_DISTORT_OUTER_NDC = HOLE_EDGE_NDC * 0.995;

/** 詳細視点で非関連の合成感情は非表示 */
const UNRELATED_DYAD_OPACITY = 0;
/** 詳細視点で、選択以外の基本感情の薄さ */
const OTHER_BASIC_OPACITY = 0.28;

const _projected = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();
const _cameraUp = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _radial = new THREE.Vector3();

/**
 * EmotionStar と同じ縁歪みを加えた、見た目上の中心ワールド座標を求める。
 */
function getEmotionStarVisualCenter(
  layoutPosition: [number, number, number],
  radius: number,
  camera: THREE.Camera,
  out: THREE.Vector3,
): THREE.Vector3 {
  out.set(layoutPosition[0], layoutPosition[1], layoutPosition[2]);
  _projected.copy(out).project(camera);
  const dist = Math.hypot(_projected.x, _projected.y);
  const edgeBand = THREE.MathUtils.clamp(
    (dist - EDGE_DISTORT_INNER_NDC) / (EDGE_DISTORT_OUTER_NDC - EDGE_DISTORT_INNER_NDC),
    0,
    1,
  );
  if (edgeBand <= 0.001 || dist <= 1e-6) {
    return out;
  }

  const tangentX = -_projected.y / dist;
  const tangentY = _projected.x / dist;
  const radialX = _projected.x / dist;
  const radialY = _projected.y / dist;
  _cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  _cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  _tangent
    .copy(_cameraRight)
    .multiplyScalar(tangentX)
    .addScaledVector(_cameraUp, tangentY)
    .normalize();
  _radial
    .copy(_cameraRight)
    .multiplyScalar(radialX)
    .addScaledVector(_cameraUp, radialY)
    .normalize();

  const bend = Math.pow(edgeBand, 1.18);
  out.addScaledVector(_tangent, (0.34 + radius * 0.48) * bend);
  out.addScaledVector(_radial, -(0.08 + radius * 0.2) * bend);
  return out;
}

function EmotionStar({
  node,
  radius,
  color,
  opacity,
  emissiveBoost = 0.35,
  focused = false,
  /** 指定時は2基本感情の見た目中心を結ぶ線上（t）に固定し、縁歪みしない */
  pinBetweenBasics = null,
  pinT = 0.5,
}: {
  node: TelescopeNodePosition;
  radius: number;
  color: string;
  opacity: number;
  emissiveBoost?: number;
  focused?: boolean;
  pinBetweenBasics?: [BasicEmotionId, BasicEmotionId] | null;
  pinT?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const orbitLabelRef = useRef<THREE.Group>(null);
  const projectedRef = useRef(new THREE.Vector3());
  const cameraRightRef = useRef(new THREE.Vector3());
  const cameraUpRef = useRef(new THREE.Vector3());
  const tangentWorldRef = useRef(new THREE.Vector3());
  const radialWorldRef = useRef(new THREE.Vector3());
  const pinA = useRef(new THREE.Vector3());
  const pinB = useRef(new THREE.Vector3());
  const pulse = useRef(Math.random() * Math.PI * 2);

  const pinNodes = useMemo(() => {
    if (!pinBetweenBasics) {
      return null;
    }
    const a = TELESCOPE_GALAXY_NODES.find((n) => n.id === pinBetweenBasics[0]);
    const b = TELESCOPE_GALAXY_NODES.find((n) => n.id === pinBetweenBasics[1]);
    if (!a || !b) {
      return null;
    }
    return { a, b };
  }, [pinBetweenBasics]);

  useFrame((state) => {
    const group = groupRef.current;
    const visual = visualRef.current;
    if (!group || !visual) {
      return;
    }
    const t = state.clock.elapsedTime;
    const scale = 1 + Math.sin(t * 1.1 + pulse.current) * 0.04;
    group.scale.setScalar(scale);
    if (orbitLabelRef.current) {
      orbitLabelRef.current.rotation.z = -(t * (Math.PI * 2)) / 28;
    }

    // 関連線上に固定：両端の見た目中心の補間位置へ
    if (pinNodes) {
      getEmotionStarVisualCenter(
        pinNodes.a.position,
        TELESCOPE_BASIC_SPHERE_RADIUS,
        state.camera,
        pinA.current,
      );
      getEmotionStarVisualCenter(
        pinNodes.b.position,
        TELESCOPE_BASIC_SPHERE_RADIUS,
        state.camera,
        pinB.current,
      );
      group.position.lerpVectors(pinA.current, pinB.current, pinT);
      visual.position.set(0, 0, 0);
      visual.scale.setScalar(1);
      return;
    }

    projectedRef.current.set(node.position[0], node.position[1], node.position[2]).project(state.camera);
    const dist = Math.hypot(projectedRef.current.x, projectedRef.current.y);
    const edgeBand = THREE.MathUtils.clamp(
      (dist - EDGE_DISTORT_INNER_NDC) / (EDGE_DISTORT_OUTER_NDC - EDGE_DISTORT_INNER_NDC),
      0,
      1,
    );
    if (edgeBand <= 0.001 || dist <= 1e-6) {
      visual.position.set(0, 0, 0);
      visual.scale.setScalar(1);
      return;
    }

    const tangentX = -projectedRef.current.y / dist;
    const tangentY = projectedRef.current.x / dist;
    const radialX = projectedRef.current.x / dist;
    const radialY = projectedRef.current.y / dist;
    cameraRightRef.current.setFromMatrixColumn(state.camera.matrixWorld, 0).normalize();
    cameraUpRef.current.setFromMatrixColumn(state.camera.matrixWorld, 1).normalize();
    tangentWorldRef.current
      .copy(cameraRightRef.current)
      .multiplyScalar(tangentX)
      .addScaledVector(cameraUpRef.current, tangentY)
      .normalize();
    radialWorldRef.current
      .copy(cameraRightRef.current)
      .multiplyScalar(radialX)
      .addScaledVector(cameraUpRef.current, radialY)
      .normalize();

    const bend = Math.pow(edgeBand, 1.18);
    const tangentShift = (0.34 + radius * 0.48) * bend;
    const radialShift = -(0.08 + radius * 0.2) * bend;
    visual.position.copy(tangentWorldRef.current).multiplyScalar(tangentShift);
    visual.position.addScaledVector(radialWorldRef.current, radialShift);
    visual.scale.set(
      1 + bend * 0.42,
      1 - bend * 0.28,
      1,
    );
  });

  if (opacity < 0.02) {
    return null;
  }

  const trackR = radius * 1.72;
  const trackHalfWidth = radius * 0.014;
  const labelFont = Math.max(radius * 0.48, 0.055);

  return (
    <group ref={groupRef} position={node.position}>
      <group ref={visualRef}>
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
 * Layer02: 選択基本感情から、合成感情がある相手の基本感情の星の中心へ細い線を伸ばす。
 * 終点は EmotionStar と同じ縁歪みを反映した見た目の中心。球による遮蔽は有効。
 */
function RelatedEmotionLinks({
  focusBasicId,
  visible,
}: {
  focusBasicId: BasicEmotionId;
  visible: boolean;
}) {
  const fromCenter = useRef(new THREE.Vector3());
  const toCenter = useRef(new THREE.Vector3());

  const targets = useMemo(() => {
    const partnerIds = new Set(getDyadPartnerBasicIds(focusBasicId));
    return TELESCOPE_GALAXY_NODES.filter((n) => partnerIds.has(n.id as BasicEmotionId));
  }, [focusBasicId]);

  const fromNode = useMemo(
    () => TELESCOPE_GALAXY_NODES.find((n) => n.id === focusBasicId) ?? null,
    [focusBasicId],
  );

  const line = useMemo(() => {
    if (!fromNode || targets.length === 0) {
      return null;
    }

    const positions = new Float32Array(targets.length * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: fromNode.color,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const object = new THREE.LineSegments(geometry, material);
    object.renderOrder = 1;
    return object;
  }, [fromNode, targets]);

  useEffect(
    () => () => {
      if (!line) {
        return;
      }
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );

  useFrame((state) => {
    if (!line || !fromNode) {
      return;
    }
    line.visible = visible;
    if (!visible) {
      return;
    }

    getEmotionStarVisualCenter(
      fromNode.position,
      TELESCOPE_BASIC_SPHERE_RADIUS,
      state.camera,
      fromCenter.current,
    );

    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < targets.length; i++) {
      getEmotionStarVisualCenter(
        targets[i].position,
        TELESCOPE_BASIC_SPHERE_RADIUS,
        state.camera,
        toCenter.current,
      );
      attr.setXYZ(i * 2, fromCenter.current.x, fromCenter.current.y, fromCenter.current.z);
      attr.setXYZ(
        i * 2 + 1,
        toCenter.current.x,
        toCenter.current.y,
        toCenter.current.z,
      );
    }
    attr.needsUpdate = true;
    line.geometry.computeBoundingSphere();

    const mat = line.material as THREE.LineBasicMaterial;
    mat.opacity = 0.32 + Math.sin(state.clock.elapsedTime * 1.8) * 0.06;
  });

  if (!line) {
    return null;
  }

  return <primitive object={line} />;
}

interface TelescopeGalaxyLayerProps {
  zoomPhase: TelescopeZoomPhase;
  detailVisibility: number;
  /** Layer2 シーン（関連感情の強調表示）が有効か */
  layer2SceneActive?: boolean;
  /** 3段階目の中心感情（ロック）— 配置は変えず、強調と検知対象に使う */
  focusBasicId: BasicEmotionId | null;
  onViewFocus?: (focus: TelescopeViewFocus) => void;
}

export function TelescopeGalaxyLayer({
  zoomPhase,
  detailVisibility,
  layer2SceneActive = false,
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
    layer2SceneActive &&
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
      {inFocusView && focusBasicId ? (
        <RelatedEmotionLinks focusBasicId={focusBasicId} visible={inFocusView} />
      ) : null}
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
        const dyad = DYAD_EMOTIONS.find((d) => d.id === node.id);
        const pinBetweenBasics =
          inFocusView && related && dyad
            ? ([dyad.components[0], dyad.components[1]] as [BasicEmotionId, BasicEmotionId])
            : null;
        return (
          <EmotionStar
            key={node.id}
            node={node}
            radius={TELESCOPE_DYAD_SPHERE_RADIUS}
            color={detailColors.get(node.id) ?? node.color}
            opacity={opacity}
            emissiveBoost={related && inFocusView ? 0.55 : 0.4}
            focused={inFocusView && focusedId === node.id}
            pinBetweenBasics={pinBetweenBasics}
            pinT={0.5}
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
