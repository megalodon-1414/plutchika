import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { UserPlotRow } from '../../types/userPlot';
import { isPurePlot } from '../../utils/emotionPlotBridge';
import { plotColorFromRow } from '../../utils/plotFromUserPlot';
import {
  getTelescopeRegionPlotPosition,
  TELESCOPE_EXPLORATION_VIEW,
} from './layer4Exploration';
import type { TelescopeRegionDefinition } from './layer3Region';

const PLOT_RADIUS = 0.028;
const WAVE_COUNT = 2;
const WAVE_DURATION = 4.2;

function ExplorationPlot({
  plot,
  region,
  selectedPlotId,
  selectedPlot,
  onSelect,
}: {
  plot: UserPlotRow;
  region: TelescopeRegionDefinition;
  selectedPlotId: string;
  selectedPlot: UserPlotRow | null;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const hitRef = useRef<THREE.Mesh>(null);
  const wavesRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const nearbyRef = useRef(false);
  const color = useMemo(() => plotColorFromRow(plot), [plot]);
  const isSelected = plot.word_id === selectedPlotId;

  useFrame(({ camera, clock }) => {
    const group = groupRef.current;
    const core = coreRef.current;
    if (!group || !core) {
      return;
    }
    const time = clock.elapsedTime;
    const [x, y] = getTelescopeRegionPlotPosition(region, plot, time);
    group.position.set(x, y, 0.04);

    let isNearby = isSelected;
    if (!isSelected && selectedPlot) {
      const [sx, sy] = getTelescopeRegionPlotPosition(
        region,
        selectedPlot,
        time,
      );
      isNearby =
        Math.hypot(x - sx, y - sy) <= TELESCOPE_EXPLORATION_VIEW.nearbyRadius;
    }
    nearbyRef.current = isNearby;

    const material = core.material as THREE.MeshBasicMaterial;
    if (isSelected) {
      material.opacity = 1;
      group.scale.setScalar(1);
    } else if (isNearby) {
      material.opacity = 0.92;
      group.scale.setScalar(1);
    } else {
      material.opacity = TELESCOPE_EXPLORATION_VIEW.distantOpacity;
      group.scale.setScalar(TELESCOPE_EXPLORATION_VIEW.distantScale);
    }

    if (hitRef.current) {
      hitRef.current.visible = isNearby || isSelected;
    }

    const waves = wavesRef.current;
    if (waves) {
      waves.visible = isSelected;
      waves.quaternion.copy(camera.quaternion);
      for (let index = 0; index < waves.children.length; index++) {
        const wave = waves.children[index] as THREE.Mesh;
        const phase =
          (time / WAVE_DURATION + index / WAVE_COUNT) % 1;
        wave.scale.setScalar(1 + phase * 2.2);
        (wave.material as THREE.MeshBasicMaterial).opacity =
          (1 - phase) * (1 - phase) * 0.55;
      }
    }

    if (labelRef.current) {
      labelRef.current.style.opacity = isNearby && !isSelected ? '0.92' : '0';
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (isSelected || !nearbyRef.current) {
      return;
    }
    event.stopPropagation();
    onSelect(plot.word_id);
  };

  return (
    <group ref={groupRef}>
      <mesh
        ref={hitRef}
        onClick={handleClick}
        onPointerOver={(event) => {
          if (!isSelected && nearbyRef.current) {
            event.stopPropagation();
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'grab';
        }}
      >
        <sphereGeometry args={[PLOT_RADIUS * 1.45, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={coreRef}>
        <sphereGeometry args={[PLOT_RADIUS, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={1}
          toneMapped={false}
        />
      </mesh>
      {isSelected ? (
        <group ref={wavesRef}>
          {Array.from({ length: WAVE_COUNT }, (_, index) => (
            <mesh key={index}>
              <ringGeometry
                args={[PLOT_RADIUS * 0.9, PLOT_RADIUS * 1.05, 40]}
              />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      ) : null}
      {plot.wordType === 'adjective' || isPurePlot(plot) ? (
        <Html
          center
          style={{ pointerEvents: 'none', transform: 'translateY(-18px)' }}
        >
          <div
            ref={labelRef}
            className="font-momochidori font-momochidori--medium"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'upright',
              whiteSpace: 'nowrap',
              fontSize: 15,
              letterSpacing: '0.1em',
              color,
              opacity: 0,
              textShadow: '0 0 6px rgba(0,0,0,0.55)',
            }}
          >
            {plot.word_id}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

interface Layer4ExplorationLayerProps {
  region: TelescopeRegionDefinition;
  plots: readonly UserPlotRow[];
  selectedPlotId: string;
  onSelectPlot: (id: string) => void;
}

/**
 * レイヤー4: バー領域内の感情点を渡り歩く探索シーン。
 * 近傍点のみクリック可。遠方点は薄く小さく表示する。
 */
export function Layer4ExplorationLayer({
  region,
  plots,
  selectedPlotId,
  onSelectPlot,
}: Layer4ExplorationLayerProps) {
  const selectedPlot = useMemo(
    () => plots.find((plot) => plot.word_id === selectedPlotId) ?? null,
    [plots, selectedPlotId],
  );

  return (
    <group>
      {plots.map((plot) => (
        <ExplorationPlot
          key={plot.word_id}
          plot={plot}
          region={region}
          selectedPlotId={selectedPlotId}
          selectedPlot={selectedPlot}
          onSelect={onSelectPlot}
        />
      ))}
    </group>
  );
}
