import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { UserPlotRow } from '../../types/userPlot';
import { plotColorFromRow } from '../../utils/plotFromUserPlot';
import { getLayer3SegmentWorldCenter } from './layer3Segments';
import {
  getTelescopeRegionPlotPosition,
  isTelescopeExplorationSelectablePlot,
  TELESCOPE_EXPLORATION_VIEW,
} from './layer4Exploration';
import type { TelescopeRegionDefinition } from './layer3Region';

const PLOT_RADIUS = 0.028;
const WAVE_COUNT = 2;
const WAVE_DURATION = 4.2;
/** 画面上でこれより近い点のラベルを同じ衝突クラスタとして扱う */
const LABEL_COLLISION_RADIUS_PX = 96;
/** 点から引き出し線の始点までの隙間（px） */
const LABEL_LEADER_GAP_PX = 10;
/** 引き出し線の基本長（px） */
const LABEL_LEADER_BASE_PX = 30;
/** 衝突時に段違いにする1段あたりの追加長（px） */
const LABEL_LEADER_STEP_PX = 56;
/** 段違いの上限（これ以上伸ばしても見切れやすい） */
const LABEL_MAX_LEVEL = 3;
/** 縦書きラベルの文字サイズ（px） */
const LABEL_FONT_SIZE_PX = 32;
/** 画面端との余白（px） */
const LABEL_VIEWPORT_MARGIN_PX = 28;

type LabelSide = 'up' | 'down';
type LabelPlacement = { level: number; side: LabelSide };
type LabelLevelsRef = { current: Map<string, LabelPlacement> };

function estimateVerticalLabelHeightPx(word: string): number {
  // writing-mode: vertical-rl + letter-spacing 0.1em の概算
  return Math.max(LABEL_FONT_SIZE_PX, word.length * LABEL_FONT_SIZE_PX * 1.1);
}

function labelStackExtentPx(level: number, word: string): number {
  const lineLength = LABEL_LEADER_BASE_PX + level * LABEL_LEADER_STEP_PX;
  return (
    LABEL_LEADER_GAP_PX +
    lineLength +
    6 +
    estimateVerticalLabelHeightPx(word)
  );
}

/**
 * 表示対象の点を画面座標へ投影して近接クラスタを作り、
 * クラスタ内での引き出し線の段数と上下方向を毎フレーム共有する。
 * 画面上部で見切れそうなときは下方向へ出す。選択中は常に段0。
 */
function ExplorationLabelLevelCoordinator({
  plots,
  region,
  segmentCenter,
  selectedPlotId,
  levels,
}: {
  plots: readonly UserPlotRow[];
  region: TelescopeRegionDefinition;
  segmentCenter: readonly [number, number];
  selectedPlotId: string;
  levels: LabelLevelsRef;
}) {
  const projected = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, clock, size }) => {
    const candidates: Array<{
      id: string;
      screenX: number;
      screenY: number;
    }> = [];
    const time = clock.elapsedTime;

    for (const plot of plots) {
      const [x, y] = getTelescopeRegionPlotPosition(region, plot, time);
      const isVisible =
        plot.word_id === selectedPlotId ||
        Math.hypot(x - segmentCenter[0], y - segmentCenter[1]) <=
          TELESCOPE_EXPLORATION_VIEW.nearbyRadius;
      if (!isVisible) {
        continue;
      }
      projected.set(x, y, 0.04).project(camera);
      candidates.push({
        id: plot.word_id,
        screenX: (projected.x * 0.5 + 0.5) * size.width,
        screenY: (0.5 - projected.y * 0.5) * size.height,
      });
    }

    const parent = candidates.map((_, index) => index);
    const root = (index: number): number => {
      let current = index;
      while (parent[current] !== current) {
        parent[current] = parent[parent[current]];
        current = parent[current];
      }
      return current;
    };
    const join = (a: number, b: number) => {
      const rootA = root(a);
      const rootB = root(b);
      if (rootA !== rootB) {
        parent[rootB] = rootA;
      }
    };

    for (let a = 0; a < candidates.length; a++) {
      for (let b = a + 1; b < candidates.length; b++) {
        const dx = candidates[a].screenX - candidates[b].screenX;
        const dy = candidates[a].screenY - candidates[b].screenY;
        if (Math.hypot(dx, dy) <= LABEL_COLLISION_RADIUS_PX) {
          join(a, b);
        }
      }
    }

    const clusters = new Map<number, typeof candidates>();
    candidates.forEach((candidate, index) => {
      const key = root(index);
      const cluster = clusters.get(key) ?? [];
      cluster.push(candidate);
      clusters.set(key, cluster);
    });

    const nextLevels = levels.current;
    nextLevels.clear();
    for (const cluster of clusters.values()) {
      // 選択中を先頭に固定し、他は画面上の並びで安定させて揺れを防ぐ。
      cluster.sort((a, b) => {
        if (a.id === selectedPlotId) return -1;
        if (b.id === selectedPlotId) return 1;
        return a.screenX - b.screenX || a.id.localeCompare(b.id, 'ja');
      });

      // 上下それぞれ独立に段を積み、上部で見切れる場合は下方向へ逃がす。
      let upLevel = 0;
      let downLevel = 0;
      for (const candidate of cluster) {
        const spaceAbove = candidate.screenY - LABEL_VIEWPORT_MARGIN_PX;
        const spaceBelow =
          size.height - candidate.screenY - LABEL_VIEWPORT_MARGIN_PX;
        const labelHeight = estimateVerticalLabelHeightPx(candidate.id);
        const maxLevelFor = (available: number) =>
          Math.max(
            0,
            Math.min(
              LABEL_MAX_LEVEL,
              Math.floor(
                (available -
                  LABEL_LEADER_GAP_PX -
                  LABEL_LEADER_BASE_PX -
                  6 -
                  labelHeight) /
                  LABEL_LEADER_STEP_PX,
              ),
            ),
          );
        const upMax = maxLevelFor(spaceAbove);
        const downMax = maxLevelFor(spaceBelow);
        const preferDown =
          spaceAbove < labelStackExtentPx(0, candidate.id) ||
          (spaceAbove < spaceBelow &&
            candidate.screenY < size.height * 0.42);

        const trySide = (
          side: LabelSide,
        ): LabelPlacement | null => {
          const level = side === 'up' ? upLevel : downLevel;
          const max = side === 'up' ? upMax : downMax;
          if (level > max) {
            return null;
          }
          if (side === 'up') {
            upLevel += 1;
          } else {
            downLevel += 1;
          }
          return { level, side };
        };

        const primary = preferDown ? 'down' : 'up';
        const secondary: LabelSide = primary === 'up' ? 'down' : 'up';
        const placement =
          trySide(primary) ??
          trySide(secondary) ??
          (() => {
            // どちらも満杯なら余白の多い側へ、段数は上限で打ち切る
            const side: LabelSide =
              spaceBelow >= spaceAbove ? 'down' : 'up';
            const level = Math.min(
              side === 'up' ? upLevel : downLevel,
              side === 'up' ? upMax : downMax,
            );
            if (side === 'up') {
              upLevel += 1;
            } else {
              downLevel += 1;
            }
            return { level, side };
          })();

        nextLevels.set(candidate.id, placement);
      }
    }
  }, -1);

  return null;
}

function ExplorationPlot({
  plot,
  region,
  segmentCenter,
  labelLevels,
  selectedPlotId,
  onSelect,
}: {
  plot: UserPlotRow;
  region: TelescopeRegionDefinition;
  /** 選択セグメント中心（統一空間） */
  segmentCenter: readonly [number, number];
  labelLevels: LabelLevelsRef;
  selectedPlotId: string;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const hitRef = useRef<THREE.Mesh>(null);
  const wavesRef = useRef<THREE.Group>(null);
  const leaderRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const nearbyRef = useRef(false);
  const nowPlacement = useRef<LabelPlacement>({ level: 0, side: 'up' });
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

    // 選択可否＝選択セグメント中心からの距離。感情空間ルール外の点は除外済み
    const isNearby =
      isSelected ||
      Math.hypot(x - segmentCenter[0], y - segmentCenter[1]) <=
        TELESCOPE_EXPLORATION_VIEW.nearbyRadius;
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

    const leader = leaderRef.current;
    const line = lineRef.current;
    const label = labelRef.current;
    if (leader && line && label) {
      const shown = isSelected || isNearby;
      leader.style.opacity = shown ? (isSelected ? '1' : '0.9') : '0';

      // 近接クラスタ内では引き出し線を段違いにし、上部では下方向へ出す
      const placement = labelLevels.current.get(plot.word_id) ?? {
        level: 0,
        side: 'up' as const,
      };
      if (
        placement.level !== nowPlacement.current.level ||
        placement.side !== nowPlacement.current.side
      ) {
        nowPlacement.current = placement;
        const lineLength =
          LABEL_LEADER_BASE_PX + placement.level * LABEL_LEADER_STEP_PX;
        const offset = LABEL_LEADER_GAP_PX + lineLength + 6;
        line.style.height = `${lineLength}px`;
        if (placement.side === 'up') {
          line.style.bottom = `${LABEL_LEADER_GAP_PX}px`;
          line.style.top = 'auto';
          label.style.bottom = `${offset}px`;
          label.style.top = 'auto';
        } else {
          line.style.top = `${LABEL_LEADER_GAP_PX}px`;
          line.style.bottom = 'auto';
          label.style.top = `${offset}px`;
          label.style.bottom = 'auto';
        }
      }
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
      <mesh ref={hitRef} onClick={handleClick}>
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
      <Html center style={{ pointerEvents: 'none' }}>
        {/* 点を原点として上下どちらかへ: 引き出し線 → 縦書きラベル */}
        <div
          ref={leaderRef}
          aria-hidden
          style={{
            position: 'relative',
            width: 0,
            height: 0,
            opacity: 0,
            transition: 'opacity 200ms ease',
          }}
        >
          <div
            ref={lineRef}
            style={{
              position: 'absolute',
              left: -0.75,
              bottom: LABEL_LEADER_GAP_PX,
              width: 1.5,
              height: LABEL_LEADER_BASE_PX,
              background: color,
              boxShadow: `0 0 5px ${color}88`,
              transition:
                'height 240ms cubic-bezier(0.22, 0.61, 0.36, 1), top 240ms cubic-bezier(0.22, 0.61, 0.36, 1), bottom 240ms cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          />
          <div
            ref={labelRef}
            className="font-momochidori font-momochidori--medium"
            style={{
              position: 'absolute',
              left: 0,
              bottom: LABEL_LEADER_GAP_PX + LABEL_LEADER_BASE_PX + 6,
              transform: 'translateX(-50%)',
              writingMode: 'vertical-rl',
              textOrientation: 'upright',
              whiteSpace: 'nowrap',
              fontSize: LABEL_FONT_SIZE_PX,
              letterSpacing: '0.1em',
              color,
              textShadow: '0 0 6px rgba(0,0,0,0.55)',
              transition:
                'top 240ms cubic-bezier(0.22, 0.61, 0.36, 1), bottom 240ms cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          >
            {plot.word_id}
          </div>
        </div>
      </Html>
    </group>
  );
}

interface Layer4ExplorationLayerProps {
  region: TelescopeRegionDefinition;
  plots: readonly UserPlotRow[];
  selectedSegmentIndex: number;
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
  selectedSegmentIndex,
  selectedPlotId,
  onSelectPlot,
}: Layer4ExplorationLayerProps) {
  const segmentCenter = useMemo<[number, number]>(() => {
    const [cx, cy] = getLayer3SegmentWorldCenter(region, selectedSegmentIndex);
    return [cx, cy];
  }, [region, selectedSegmentIndex]);

  const selectablePlots = useMemo(
    () =>
      plots.filter((plot) =>
        isTelescopeExplorationSelectablePlot(region, plot),
      ),
    [plots, region],
  );
  const labelLevels = useRef<Map<string, LabelPlacement>>(new Map());

  return (
    <group>
      <ExplorationLabelLevelCoordinator
        plots={selectablePlots}
        region={region}
        segmentCenter={segmentCenter}
        selectedPlotId={selectedPlotId}
        levels={labelLevels}
      />
      {selectablePlots.map((plot) => (
        <ExplorationPlot
          key={plot.word_id}
          plot={plot}
          region={region}
          segmentCenter={segmentCenter}
          labelLevels={labelLevels}
          selectedPlotId={selectedPlotId}
          onSelect={onSelectPlot}
        />
      ))}
    </group>
  );
}
