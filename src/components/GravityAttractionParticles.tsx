import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { isBasicEmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { getPrimaryEmotionColor, rowToEmotionParams } from '../utils/emotionPlotBridge';
import { getEmotionCenter } from '../utils/emotionSpaceLayout';
import { plotPositionFromRow, type PlotOrbitOverride } from '../utils/plotFromUserPlot';

interface GravityAttractionParticlesProps {
  plot: UserPlotRow;
  orbitOverride?: PlotOrbitOverride;
  /** 重力方向にある周囲の星（ワード）位置。螺旋の寄り道に使う */
  guideStars?: ReadonlyArray<[number, number, number]>;
}

interface GravityStreamProps {
  plot: UserPlotRow;
  orbitOverride?: PlotOrbitOverride;
  source?: [number, number, number];
  target: [number, number, number];
  guideStars?: ReadonlyArray<[number, number, number]>;
  color: string;
  particleCount: number;
  particleSize: number;
  speed: number;
  spiralTurns?: number;
  spiralRadius?: number;
  reach?: number;
  phaseOffset?: number;
}

function buildAxisBasis(axis: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const reference = Math.abs(axis.y) < 0.92
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(axis, reference).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  return { u, v };
}

function GravityStream({
  plot,
  orbitOverride,
  source,
  target,
  guideStars = [],
  color,
  particleCount,
  particleSize,
  speed,
  spiralTurns = 2.8,
  spiralRadius = 0.14,
  reach = 0.82,
  phaseOffset = 0,
}: GravityStreamProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const start = useRef(new THREE.Vector3());
  const end = useMemo(() => new THREE.Vector3(...target), [target]);
  const axis = useRef(new THREE.Vector3());
  const position = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());
  const starPull = useRef(new THREE.Vector3());
  const basisU = useRef(new THREE.Vector3());
  const basisV = useRef(new THREE.Vector3());
  const baseColor = useMemo(() => new THREE.Color(color), [color]);
  const particleSeeds = useMemo(
    () =>
      Array.from({ length: particleCount }, (_, index) => ({
        phase: (index / particleCount) * Math.PI * 2,
        radiusJitter: 0.88 + ((index * 17) % 100) / 100 * 0.24,
        turnJitter: 0.94 + ((index * 29) % 100) / 100 * 0.12,
        speedJitter: 0.92 + ((index * 13) % 100) / 100 * 0.16,
      })),
    [particleCount],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    start.current.set(...(source ?? plotPositionFromRow(plot, state.clock.elapsedTime, orbitOverride)));
    axis.current.copy(end).sub(start.current);
    const pathLength = axis.current.length();
    if (pathLength < 0.0001) {
      return;
    }

    axis.current.multiplyScalar(1 / pathLength);
    const { u, v } = buildAxisBasis(axis.current);
    basisU.current.copy(u);
    basisV.current.copy(v);

    const time = state.clock.elapsedTime;

    for (let i = 0; i < particleCount; i += 1) {
      const seed = particleSeeds[i];
      const progress = (time * speed * seed.speedJitter + i / particleCount + phaseOffset) % 1;
      // ゆるやかに前進し、終端で少しだけ寄せる
      const eased = 1 - Math.pow(1 - progress, 1.25);
      const along = eased * reach * pathLength;

      position.current.copy(start.current).addScaledVector(axis.current, along);

      const remaining = 1 - progress;
      const envelope = Math.sin(progress * Math.PI);
      const radius =
        spiralRadius
        * seed.radiusJitter
        * (0.35 + remaining * 0.65)
        * (0.7 + envelope * 0.3);

      const angle =
        seed.phase
        + progress * Math.PI * 2 * spiralTurns * seed.turnJitter
        + time * 0.12;

      offset.current
        .copy(basisU.current)
        .multiplyScalar(Math.cos(angle) * radius)
        .addScaledVector(basisV.current, Math.sin(angle) * radius);

      // 重力方向にある星の近くでは、弱く螺旋を寄せる
      starPull.current.set(0, 0, 0);
      if (guideStars.length > 0) {
        let influenceSum = 0;
        for (let s = 0; s < guideStars.length; s += 1) {
          const star = guideStars[s];
          const toStarX = star[0] - position.current.x;
          const toStarY = star[1] - position.current.y;
          const toStarZ = star[2] - position.current.z;
          const distance = Math.hypot(toStarX, toStarY, toStarZ);
          if (distance < 0.0001 || distance > 0.7) {
            continue;
          }

          const influence = Math.pow(1 - distance / 0.7, 2) * 0.55;
          influenceSum += influence;

          const starAngle = angle * 1.1 + s * 0.5;
          const localRadius = Math.min(0.1, distance * 0.4) * influence;
          starPull.current.x += (star[0] - position.current.x) * influence * 0.22
            + (basisU.current.x * Math.cos(starAngle) + basisV.current.x * Math.sin(starAngle)) * localRadius;
          starPull.current.y += (star[1] - position.current.y) * influence * 0.22
            + (basisU.current.y * Math.cos(starAngle) + basisV.current.y * Math.sin(starAngle)) * localRadius;
          starPull.current.z += (star[2] - position.current.z) * influence * 0.22
            + (basisU.current.z * Math.cos(starAngle) + basisV.current.z * Math.sin(starAngle)) * localRadius;
        }

        if (influenceSum > 0) {
          const blend = Math.min(0.55, influenceSum);
          offset.current.lerp(starPull.current, blend);
        }
      }

      position.current.add(offset.current);

      const pulse = Math.sin(progress * Math.PI);
      dummy.position.copy(position.current);
      dummy.scale.setScalar(particleSize * (0.34 + pulse * 0.22));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={baseColor} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

function vecToTuple(vec: { x: number; y: number; z: number }): [number, number, number] {
  return [vec.x, vec.y, vec.z];
}

function isStarAlongGravity(
  source: [number, number, number],
  target: [number, number, number],
  star: [number, number, number],
): boolean {
  const ax = target[0] - source[0];
  const ay = target[1] - source[1];
  const az = target[2] - source[2];
  const length = Math.hypot(ax, ay, az) || 1;
  const nx = ax / length;
  const ny = ay / length;
  const nz = az / length;

  const sx = star[0] - source[0];
  const sy = star[1] - source[1];
  const sz = star[2] - source[2];
  const along = sx * nx + sy * ny + sz * nz;
  if (along < 0.08 || along > length * 0.92) {
    return false;
  }

  const px = sx - nx * along;
  const py = sy - ny * along;
  const pz = sz - nz * along;
  const radial = Math.hypot(px, py, pz);
  return radial < 0.72;
}

export function GravityAttractionParticles({
  plot,
  orbitOverride,
  guideStars = [],
}: GravityAttractionParticlesProps) {
  const params = rowToEmotionParams(plot);
  const primaryCenter = getEmotionCenter(params.primaryId);
  const secondaryCenter = getEmotionCenter(params.secondaryId);
  const showSecondary = !(isBasicEmotionId(params.primaryId) && params.primaryId === params.secondaryId);
  const source = orbitOverride?.center;

  const sourceTuple = useMemo((): [number, number, number] => {
    if (source) {
      return source;
    }
    return plotPositionFromRow(plot, 0, orbitOverride);
  }, [orbitOverride, plot, source]);

  const primaryGuides = useMemo(
    () =>
      guideStars.filter((star) =>
        isStarAlongGravity(sourceTuple, vecToTuple(primaryCenter), star),
      ),
    [guideStars, primaryCenter, sourceTuple],
  );

  const secondaryGuides = useMemo(
    () =>
      guideStars.filter((star) =>
        isStarAlongGravity(sourceTuple, vecToTuple(secondaryCenter), star),
      ),
    [guideStars, secondaryCenter, sourceTuple],
  );

  return (
    <>
      <GravityStream
        plot={plot}
        orbitOverride={orbitOverride}
        source={source}
        target={vecToTuple(primaryCenter)}
        guideStars={primaryGuides}
        color={getPrimaryEmotionColor(params.primaryId)}
        particleCount={72}
        particleSize={0.0022}
        speed={0.045}
        spiralTurns={2.8}
        spiralRadius={0.13}
        reach={0.82}
      />
      {showSecondary && (
        <GravityStream
          plot={plot}
          orbitOverride={orbitOverride}
          source={source}
          target={vecToTuple(secondaryCenter)}
          guideStars={secondaryGuides}
          color={getPrimaryEmotionColor(params.secondaryId)}
          particleCount={28}
          particleSize={0.0026}
          speed={0.05}
          spiralTurns={2.4}
          spiralRadius={0.1}
          reach={0.78}
          phaseOffset={0.38}
        />
      )}
    </>
  );
}
