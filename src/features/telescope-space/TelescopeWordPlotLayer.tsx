import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getEmotionById,
  isBasicEmotionId,
  type BasicEmotionId,
  type EmotionId,
} from '../../data/emotions';
import type { UserPlotRow } from '../../types/userPlot';
import { plotColorFromRow } from '../../utils/plotFromUserPlot';
import { getTelescopePlotPosition } from './telescopePlotLayout';

interface TelescopeWordPlotLayerProps {
  plots: readonly UserPlotRow[];
  opacity: number;
  visible: boolean;
  focusBasicId: BasicEmotionId | null;
}

const CENTER_LIFT = 0.18;
const CENTER_LIFT_RADIUS = 0.44;
const CENTER_LIFT_CURVE = 1.4;
const CENTER_CAPTURE_RADIUS_NDC = 0.28;
const CENTER_LIFT_SPEED = 8;
const PLOT_BASE_Z = -0.1;
const _projectedPlot = new THREE.Vector3();

function createSoftShadowTexture(): THREE.DataTexture {
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
  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
  );
  texture.needsUpdate = true;
  return texture;
}

function includesBasicEmotion(id: EmotionId, basicId: BasicEmotionId): boolean {
  if (isBasicEmotionId(id)) {
    return id === basicId;
  }
  const emotion = getEmotionById(id);
  return 'components' in emotion && emotion.components.includes(basicId);
}

function isRelatedPlot(plot: UserPlotRow, focusBasicId: BasicEmotionId): boolean {
  return (
    includesBasicEmotion(plot.primaryId, focusBasicId) ||
    includesBasicEmotion(plot.secondaryId, focusBasicId)
  );
}

/**
 * detail レイヤー用の単語プロット。
 * 関連点を強調し、画面中央に最も近い関連点を平面から少し持ち上げる。
 */
export function TelescopeWordPlotLayer({
  plots,
  opacity,
  visible,
  focusBasicId,
}: TelescopeWordPlotLayerProps) {
  const dimPositionAttribute = useRef<THREE.BufferAttribute>(null);
  const relatedPositionAttribute = useRef<THREE.BufferAttribute>(null);
  const shadowTexture = useMemo(createSoftShadowTexture, []);

  useEffect(() => () => shadowTexture.dispose(), [shadowTexture]);

  const geometryData = useMemo(() => {
    const dimPositions: number[] = [];
    const dimColors: number[] = [];
    const relatedPositions: number[] = [];
    const relatedColors: number[] = [];
    const shadowPositions: number[] = [];

    plots.forEach((plot) => {
      const position = getTelescopePlotPosition(plot);
      const color = new THREE.Color(plotColorFromRow(plot));
      dimPositions.push(position[0], position[1], position[2] + PLOT_BASE_Z);
      dimColors.push(color.r, color.g, color.b);
      shadowPositions.push(
        position[0] + 0.025,
        position[1] - 0.025,
        PLOT_BASE_Z - 0.045,
      );

      if (focusBasicId && isRelatedPlot(plot, focusBasicId)) {
        relatedPositions.push(
          position[0],
          position[1],
          position[2] + PLOT_BASE_Z,
        );
        relatedColors.push(color.r, color.g, color.b);
      }
    });

    return {
      dimPositions: new Float32Array(dimPositions),
      dimColors: new Float32Array(dimColors),
      relatedPositions: new Float32Array(relatedPositions),
      relatedColors: new Float32Array(relatedColors),
      shadowPositions: new Float32Array(shadowPositions),
    };
  }, [plots, focusBasicId]);

  useFrame(({ camera }, delta) => {
    if (!visible) {
      return;
    }
    const relatedAttribute = relatedPositionAttribute.current;
    const dimAttribute = dimPositionAttribute.current;
    if (!relatedAttribute || !dimAttribute || relatedAttribute.count === 0) {
      return;
    }

    let centeredIndex = -1;
    let centeredDistance = Infinity;
    for (let index = 0; index < relatedAttribute.count; index++) {
      _projectedPlot
        .set(
          relatedAttribute.getX(index),
          relatedAttribute.getY(index),
          PLOT_BASE_Z,
        )
        .project(camera);
      if (_projectedPlot.z < -1 || _projectedPlot.z > 1) {
        continue;
      }
      const distance = _projectedPlot.x ** 2 + _projectedPlot.y ** 2;
      if (distance < centeredDistance) {
        centeredDistance = distance;
        centeredIndex = index;
      }
    }

    const captured =
      centeredIndex >= 0 &&
      centeredDistance <= CENTER_CAPTURE_RADIUS_NDC ** 2;
    const centerX = captured ? relatedAttribute.getX(centeredIndex) : 0;
    const centerY = captured ? relatedAttribute.getY(centeredIndex) : 0;
    const blend = 1 - Math.exp(-CENTER_LIFT_SPEED * delta);

    const liftAroundCenter = (attribute: THREE.BufferAttribute) => {
      for (let index = 0; index < attribute.count; index++) {
        const distance = captured
          ? Math.hypot(
              attribute.getX(index) - centerX,
              attribute.getY(index) - centerY,
            )
          : Infinity;
        const proximity = THREE.MathUtils.clamp(
          1 - distance / CENTER_LIFT_RADIUS,
          0,
          1,
        );
        // 中央ほど高く、外周で傾きが滑らかに0になる丘状の減衰。
        const smoothProximity =
          proximity * proximity * (3 - 2 * proximity);
        // 外周は低く抑え、中央付近で高さが少し強く立ち上がる。
        const targetZ =
          PLOT_BASE_Z +
          CENTER_LIFT * Math.pow(smoothProximity, CENTER_LIFT_CURVE);
        attribute.setZ(
          index,
          THREE.MathUtils.lerp(attribute.getZ(index), targetZ, blend),
        );
      }
      attribute.needsUpdate = true;
    };

    liftAroundCenter(dimAttribute);
    liftAroundCenter(relatedAttribute);
  });

  if (!visible || plots.length === 0 || opacity < 0.01) {
    return null;
  }

  return (
    <group>
      <points frustumCulled={false} renderOrder={1}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[geometryData.shadowPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.055}
          color="#000000"
          alphaMap={shadowTexture}
          transparent
          opacity={Math.min(0.38, opacity * 0.38)}
          depthWrite={false}
          depthTest
          sizeAttenuation
          toneMapped={false}
        />
      </points>
      <points frustumCulled={false} renderOrder={1}>
        <bufferGeometry>
          <bufferAttribute
            ref={dimPositionAttribute}
            attach="attributes-position"
            args={[geometryData.dimPositions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[geometryData.dimColors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.018}
          vertexColors
          transparent
          opacity={Math.min(0.14, opacity * 0.14)}
          depthWrite={false}
          depthTest
          sizeAttenuation
          toneMapped={false}
        />
      </points>
      <points frustumCulled={false} renderOrder={2}>
        <bufferGeometry>
          <bufferAttribute
            ref={relatedPositionAttribute}
            attach="attributes-position"
            args={[geometryData.relatedPositions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[geometryData.relatedColors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.042}
          vertexColors
          transparent
          opacity={Math.min(0.98, opacity)}
          depthWrite={false}
          depthTest
          sizeAttenuation
          toneMapped={false}
        />
      </points>
    </group>
  );
}
