import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { UserPlotRow } from '../types/userPlot';
import { getPrimaryEmotionColor, rowToEmotionParams } from '../utils/emotionPlotBridge';
import { getEmotionCenter } from '../utils/emotionSpaceLayout';
import { getAtmosphericAppearance, getPlotPointAppearance } from '../utils/plotAtmosphere';
import {
  isPureEmotionPlot,
  plotColorFromRow,
  plotPositionFromRow,
  type PlotOrbitOverride,
} from '../utils/plotFromUserPlot';
import { getPlotKey } from '../utils/plotIdentity';
import { SELECTED_PLOT_SCALE } from '../utils/plotSelectionStyle';
import { getPlotLabelStyle, getPlotLabelTypography, FLOW_LABEL_DURATION_MS, getFlowLabelFadeFactor, type PlotLabelDisplayMode } from '../utils/plotLabelStyle';
import { OrbitTrail } from './OrbitTrail';

const VISIBILITY_LERP_SPEED = 6;
const VISIBILITY_INTERACTION_THRESHOLD = 0.08;
const EXPLORATION_DISTANT_VISIBILITY = 0.38;
const EXPLORATION_DISTANT_SCALE = 0.42;
const PLOT_CORE_RADIUS = 0.032;
/** 見た目の球より少しだけ大きいクリック判定 */
const PLOT_HIT_RADIUS = 0.042;
/** 波動は球の中心付近から発生して外へ広がる（細い二重線） */
const SELECTED_WAVE_START_RADIUS = PLOT_CORE_RADIUS * 0.12;
const SELECTED_WAVE_END_RADIUS = PLOT_CORE_RADIUS * 1.55;
const SELECTED_WAVE_TUBE = PLOT_CORE_RADIUS * 0.0055;
/** 二重線の内側と外側の半径差 */
const SELECTED_WAVE_DOUBLE_GAP = PLOT_CORE_RADIUS * 0.04;
const SELECTED_WAVE_COUNT = 2;
const SELECTED_WAVE_DURATION = 4.6;

interface WordPlotProps {
  plot: UserPlotRow;
  isSelected: boolean;
  isNearbyVisible: boolean;
  explorationMode?: boolean;
  flowLabelExpiresAt?: Readonly<Record<string, number>>;
  flowLabelNow?: number;
  plotLabelDisplayMode?: PlotLabelDisplayMode;
  orbitOverride?: PlotOrbitOverride;
  orbitTimeScale?: number;
  /** true のときクリック判定を無効化（ワープ進入ヒットと競合しないようにする） */
  suppressPointerHit?: boolean;
  onHoverChange?: (wordId: string | null) => void;
  onSelect: (wordId: string) => void;
}

export function WordPlot({
  plot,
  isSelected,
  isNearbyVisible,
  explorationMode = false,
  flowLabelExpiresAt,
  flowLabelNow = 0,
  plotLabelDisplayMode = 'flow',
  orbitOverride,
  orbitTimeScale = 1,
  suppressPointerHit = false,
  onHoverChange,
  onSelect,
}: WordPlotProps) {
  const { size, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const hitMeshRef = useRef<THREE.Mesh>(null);
  const selectedWavesRef = useRef<THREE.Group>(null);
  const primaryLightRef = useRef<THREE.PointLight>(null);
  const secondaryLightRef = useRef<THREE.PointLight>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const worldPosition = useRef(new THREE.Vector3());
  const primaryLightPosition = useRef(new THREE.Vector3());
  const secondaryLightPosition = useRef(new THREE.Vector3());
  const primaryCenterPosition = useRef(new THREE.Vector3());
  const secondaryCenterPosition = useRef(new THREE.Vector3());
  const dynamicColor = useRef(new THREE.Color());
  const dynamicEmissive = useRef(new THREE.Color());
  const fadedColor = useRef(new THREE.Color());
  const labelFadedColor = useRef(new THREE.Color());
  const visibility = useRef(isNearbyVisible ? 1 : 0);
  const isOrbiting = isPureEmotionPlot(plot);

  const selectedScale = explorationMode && isSelected ? 1 : SELECTED_PLOT_SCALE;
  const flowExpiresAt = flowLabelExpiresAt?.[getPlotKey(plot)];
  const isFlowLabelActive = flowExpiresAt !== undefined && flowExpiresAt > flowLabelNow;
  const showLabel = !explorationMode
    || (plotLabelDisplayMode === 'nearby' && isNearbyVisible && !isSelected)
    || (plotLabelDisplayMode === 'flow' && !isSelected && isFlowLabelActive);
  const isDistantExplorationPlot = explorationMode && !isNearbyVisible && !isSelected;
  const isSelectable = (!explorationMode || isNearbyVisible || isSelected) && !suppressPointerHit;
  const showSelectedRing = explorationMode && isSelected;

  const labelStyle = useMemo(
    () => getPlotLabelStyle(size.width, size.height, isSelected, selectedScale),
    [size.width, size.height, isSelected, selectedScale],
  );
  const labelTypography = useMemo(
    () => getPlotLabelTypography(plot, isSelected),
    [plot, isSelected],
  );
  const staticPosition = useMemo(() => plotPositionFromRow(plot, 0, orbitOverride), [plot, orbitOverride]);
  const color = useMemo(() => plotColorFromRow(plot), [plot]);
  const emotionParams = useMemo(() => rowToEmotionParams(plot), [plot]);
  const primaryColor = useMemo(() => {
    const parsed = new THREE.Color();
    parsed.setStyle(getPrimaryEmotionColor(emotionParams.primaryId));
    return parsed;
  }, [emotionParams.primaryId]);
  const secondaryColor = useMemo(() => {
    const parsed = new THREE.Color();
    parsed.setStyle(getPrimaryEmotionColor(emotionParams.secondaryId));
    return parsed;
  }, [emotionParams.secondaryId]);
  const primaryCenter = useMemo(() => getEmotionCenter(emotionParams.primaryId), [emotionParams.primaryId]);
  const secondaryCenter = useMemo(() => getEmotionCenter(emotionParams.secondaryId), [emotionParams.secondaryId]);
  const baseColor = useMemo(() => {
    const parsed = new THREE.Color();
    parsed.setStyle(color);
    return parsed;
  }, [color]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;

    const orbitTime = state.clock.elapsedTime * orbitTimeScale;
    const [x, y, z] = isOrbiting || orbitOverride
      ? plotPositionFromRow(plot, orbitTime, orbitOverride)
      : staticPosition;
    group.position.set(x, y, z);

    const targetVisibility = isNearbyVisible || isSelected
      ? 1
      : explorationMode
        ? EXPLORATION_DISTANT_VISIBILITY
        : 0;
    const t = 1 - Math.exp(-VISIBILITY_LERP_SPEED * delta);
    visibility.current = THREE.MathUtils.lerp(visibility.current, targetVisibility, t);

    const visibilityFactor = visibility.current;
    const isRendered = visibilityFactor > 0.01;
    mesh.visible = isRendered;
    if (hitMeshRef.current) {
      hitMeshRef.current.visible = isRendered && isSelectable;
    }

    if (!isRendered) {
      if (labelRef.current) {
        labelRef.current.style.opacity = '0';
      }
      if (selectedWavesRef.current) {
        selectedWavesRef.current.visible = false;
      }
      return;
    }

    mesh.getWorldPosition(worldPosition.current);
    const distance = camera.position.distanceTo(worldPosition.current);
    const appearance = getPlotPointAppearance(distance, baseColor, isSelected, fadedColor.current);
    const labelAppearance = getAtmosphericAppearance(
      distance,
      baseColor,
      isSelected,
      labelFadedColor.current,
    );
    const coreMaterial = mesh.material as THREE.MeshStandardMaterial;
    const finalOpacity = appearance.opacity * visibilityFactor;
    const plotScale = isSelected ? selectedScale : isDistantExplorationPlot ? EXPLORATION_DISTANT_SCALE : 1;

    coreMaterial.opacity = finalOpacity;
    coreMaterial.transparent = true;
    coreMaterial.color.copy(appearance.color);
    coreMaterial.emissive.copy(appearance.color);
    coreMaterial.emissiveIntensity = appearance.emissiveIntensity;

    if (explorationMode && isSelected && !isOrbiting) {
      const pulse = (Math.sin(state.clock.elapsedTime * 1.35) + 1) / 2;
      dynamicColor.current.copy(primaryColor).lerp(secondaryColor, pulse * 0.42);
      dynamicEmissive.current.copy(appearance.color).lerp(dynamicColor.current, 0.55);
      coreMaterial.color.copy(appearance.color).lerp(dynamicColor.current, 0.38);
      coreMaterial.emissive.copy(dynamicEmissive.current);
      coreMaterial.emissiveIntensity = appearance.emissiveIntensity + 0.45 + pulse * 0.25;

      primaryCenterPosition.current.set(primaryCenter.x, primaryCenter.y, primaryCenter.z);
      primaryLightPosition.current.copy(primaryCenterPosition.current).sub(group.position).normalize().multiplyScalar(0.38);

      secondaryCenterPosition.current.set(secondaryCenter.x, secondaryCenter.y, secondaryCenter.z);
      secondaryLightPosition.current.copy(secondaryCenterPosition.current).sub(group.position).normalize().multiplyScalar(0.32);

      if (primaryLightRef.current) {
        primaryLightRef.current.position.copy(primaryLightPosition.current);
        primaryLightRef.current.color.copy(primaryColor);
        primaryLightRef.current.intensity = 1.1 + pulse * 0.35;
      }
      if (secondaryLightRef.current) {
        secondaryLightRef.current.position.copy(secondaryLightPosition.current);
        secondaryLightRef.current.color.copy(secondaryColor);
        secondaryLightRef.current.intensity = emotionParams.isPure ? 0 : 0.62 + (1 - pulse) * 0.2;
      }
    }
    mesh.scale.setScalar(plotScale);
    if (hitMeshRef.current) {
      hitMeshRef.current.scale.setScalar(plotScale);
    }

    const waves = selectedWavesRef.current;
    if (waves) {
      waves.visible = showSelectedRing && isRendered;
      waves.quaternion.copy(camera.quaternion);
      const expandRatio = SELECTED_WAVE_END_RADIUS / SELECTED_WAVE_START_RADIUS;
      for (let i = 0; i < waves.children.length; i += 1) {
        const wavePair = waves.children[i] as THREE.Group;
        const phase = (state.clock.elapsedTime / SELECTED_WAVE_DURATION + i / SELECTED_WAVE_COUNT) % 1;
        const radiusScale = plotScale * (1 + phase * (expandRatio - 1));
        wavePair.scale.setScalar(radiusScale);
        const opacity = (1 - phase) * (1 - phase) * visibilityFactor;
        wavePair.visible = showSelectedRing && isRendered;
        for (const child of wavePair.children) {
          const line = child as THREE.Mesh;
          const material = line.material as THREE.MeshBasicMaterial;
          material.opacity = opacity;
        }
      }
    }

    if (labelRef.current) {
      if (!showLabel) {
        labelRef.current.style.opacity = '0';
      } else {
        const flowFadeFactor = plotLabelDisplayMode === 'flow' && !isSelected && explorationMode && flowExpiresAt
          ? getFlowLabelFadeFactor(flowExpiresAt, Date.now(), FLOW_LABEL_DURATION_MS)
          : 1;
        const labelOpacity = labelAppearance.opacity * visibilityFactor * flowFadeFactor;
        const shadowStrength = 0.15 + labelAppearance.opacity * 0.85;

        labelRef.current.style.opacity = String(labelOpacity);
        labelRef.current.style.color = labelAppearance.color.getStyle();
        labelRef.current.style.textShadow = `0 0 ${8 * shadowStrength}px rgba(0,0,0,${0.9 * shadowStrength})`;
      }
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!isSelectable || visibility.current < VISIBILITY_INTERACTION_THRESHOLD) {
      return;
    }

    event.stopPropagation();
    onSelect(getPlotKey(plot));
  };

  return (
    <>
      {(isOrbiting && (!explorationMode || isSelected)) || (explorationMode && orbitOverride) ? (
        <OrbitTrail
          plot={plot}
          color={color}
          isSelected={isSelected}
          isNearbyVisible={isNearbyVisible}
          particleTrail={explorationMode && (isSelected || Boolean(orbitOverride))}
          selectedParticleTrail={explorationMode && isSelected && isOrbiting}
          subtleParticleTrail={Boolean(orbitOverride)}
          orbitOverride={orbitOverride}
          orbitTimeScale={orbitTimeScale}
        />
      ) : null}
      <group ref={groupRef} position={staticPosition}>
        {explorationMode && isSelected && !isOrbiting && (
          <>
            <pointLight ref={primaryLightRef} distance={1.4} decay={2} />
            {!emotionParams.isPure && <pointLight ref={secondaryLightRef} distance={1.1} decay={2} />}
          </>
        )}
        <mesh ref={meshRef}>
          <sphereGeometry args={[PLOT_CORE_RADIUS, 12, 12]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.05}
            transparent
            opacity={1}
            roughness={0.2}
            metalness={0}
            toneMapped={false}
          />
        </mesh>
        <mesh
          ref={hitMeshRef}
          visible={isSelectable}
          onClick={handleClick}
          onPointerOver={(event) => {
            if (!isSelectable || visibility.current < VISIBILITY_INTERACTION_THRESHOLD) {
              return;
            }

            event.stopPropagation();
            document.body.style.cursor = 'pointer';
            onHoverChange?.(getPlotKey(plot));
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
            onHoverChange?.(null);
          }}
        >
          <sphereGeometry args={[PLOT_HIT_RADIUS, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {showSelectedRing && (
          <group ref={selectedWavesRef} renderOrder={2}>
            {Array.from({ length: SELECTED_WAVE_COUNT }, (_, index) => (
              <group key={`selected-wave-${index}`}>
                <mesh>
                  <torusGeometry args={[SELECTED_WAVE_START_RADIUS, SELECTED_WAVE_TUBE, 5, 64]} />
                  <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
                <mesh>
                  <torusGeometry
                    args={[SELECTED_WAVE_START_RADIUS + SELECTED_WAVE_DOUBLE_GAP, SELECTED_WAVE_TUBE, 5, 64]}
                  />
                  <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            ))}
          </group>
        )}

        {showLabel && (
          <Html center distanceFactor={labelStyle.distanceFactor} style={{ pointerEvents: 'none', userSelect: 'none' }}>
            <div
              ref={labelRef}
              style={{
                fontSize: labelStyle.fontSize,
                fontWeight: labelTypography.fontWeight,
                writingMode: 'vertical-rl',
                textOrientation: 'upright',
                fontFamily: 'var(--font-family-app)',
                transform: `translateY(calc(50% + ${labelStyle.screenOffsetY}px))`,
              }}
            >
              {plot.word_id}
            </div>
          </Html>
        )}
      </group>
    </>
  );
}
