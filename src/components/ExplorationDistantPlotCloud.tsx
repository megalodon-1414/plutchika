import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { UserPlotRow } from '../types/userPlot';
import {
  plotColorFromRow,
  plotPositionFromRow,
  type PlotOrbitOverrideMap,
} from '../utils/plotFromUserPlot';

/** 移動可能星より小さく、以前の 0.024 より少しだけ小さく */
const SAME_SYSTEM_CUBE_SIZE = 0.02;
const OTHER_SYSTEM_CUBE_SIZE = 0.018;

interface DistantSquareCloudProps {
  plots: UserPlotRow[];
  orbitOverrides?: PlotOrbitOverrideMap;
  size: number;
}

/** 移動不可星用の静的な不透明四角（毎フレーム更新なし） */
function DistantSquareCloud({ plots, orbitOverrides, size }: DistantSquareCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const entries = useMemo(
    () =>
      plots.map((plot) => ({
        position: plotPositionFromRow(plot, 0, orbitOverrides?.get(plot.word_id)),
        color: plotColorFromRow(plot),
      })),
    [orbitOverrides, plots],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    entries.forEach((entry, index) => {
      dummy.position.set(entry.position[0], entry.position[1], entry.position[2]);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setStyle(entry.color);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [color, dummy, entries, size]);

  if (plots.length === 0) {
    return null;
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, plots.length]} frustumCulled>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

interface ExplorationDistantPlotCloudProps {
  sameSystemPlots: UserPlotRow[];
  otherSystemPlots: UserPlotRow[];
  orbitOverrides?: PlotOrbitOverrideMap;
}

/** 同一星系・他星系の移動不可星をサイズ違いの不透明四角で描画 */
export function ExplorationDistantPlotCloud({
  sameSystemPlots,
  otherSystemPlots,
  orbitOverrides,
}: ExplorationDistantPlotCloudProps) {
  return (
    <>
      <DistantSquareCloud
        plots={sameSystemPlots}
        orbitOverrides={orbitOverrides}
        size={SAME_SYSTEM_CUBE_SIZE}
      />
      <DistantSquareCloud
        plots={otherSystemPlots}
        orbitOverrides={orbitOverrides}
        size={OTHER_SYSTEM_CUBE_SIZE}
      />
    </>
  );
}
