import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import type { UserPlotRow } from '../types/userPlot';
import { getAtmosphericAppearance } from '../utils/plotAtmosphere';
import { getPureOrbitRingPoints } from '../utils/emotionPlotPosition';
import { rowToEmotionParams } from '../utils/emotionPlotBridge';
import { plotPositionFromRow, type PlotOrbitOverride } from '../utils/plotFromUserPlot';

const ORBIT_LINE_WIDTH = 10;
const PARTICLE_TRAIL_COUNT = 22;
const SUBTLE_PARTICLE_TRAIL_COUNT = 12;
const PARTICLE_TRAIL_STEP_SECONDS = 0.55;
const SELECTED_PARTICLE_TRAIL_STEP_SECONDS = 1.15;
const PARTICLE_TRAIL_SIZE = 0.0038;
const SUBTLE_PARTICLE_TRAIL_SIZE = 0.0026;

interface OrbitTrailProps {
  plot: UserPlotRow;
  color: string;
  isSelected: boolean;
  isNearbyVisible: boolean;
  particleTrail?: boolean;
  selectedParticleTrail?: boolean;
  subtleParticleTrail?: boolean;
  orbitOverride?: PlotOrbitOverride;
  orbitTimeScale?: number;
}

function OrbitParticleTrail({
  plot,
  color,
  selectedParticleTrail = false,
  subtleParticleTrail = false,
  orbitOverride,
  orbitTimeScale = 1,
}: Pick<
  OrbitTrailProps,
  'plot' | 'color' | 'selectedParticleTrail' | 'subtleParticleTrail' | 'orbitOverride' | 'orbitTimeScale'
>) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const baseColor = useMemo(() => new THREE.Color(color), [color]);
  const particleCount = subtleParticleTrail ? SUBTLE_PARTICLE_TRAIL_COUNT : PARTICLE_TRAIL_COUNT;
  const particleSize = subtleParticleTrail ? SUBTLE_PARTICLE_TRAIL_SIZE : PARTICLE_TRAIL_SIZE;
  const particleOpacity = subtleParticleTrail ? 0.36 : 0.68;
  const particleStepSeconds = selectedParticleTrail
    ? SELECTED_PARTICLE_TRAIL_STEP_SECONDS
    : PARTICLE_TRAIL_STEP_SECONDS;

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < particleCount; i += 1) {
      const age = i * particleStepSeconds;
      const fade = 1 - i / particleCount;
      dummy.position.set(...plotPositionFromRow(plot, (state.clock.elapsedTime - age) * orbitTimeScale, orbitOverride));
      dummy.scale.setScalar(particleSize * Math.pow(fade, 0.72));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={baseColor} transparent opacity={particleOpacity} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

export function OrbitTrail({
  plot,
  color,
  isSelected,
  isNearbyVisible,
  particleTrail = false,
  selectedParticleTrail = false,
  subtleParticleTrail = false,
  orbitOverride,
  orbitTimeScale = 1,
}: OrbitTrailProps) {
  const { camera, size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const worldPosition = useRef(new THREE.Vector3());
  const fadedColor = useRef(new THREE.Color());
  const visibility = useRef(isNearbyVisible ? 1 : 0);
  const baseColor = useMemo(() => new THREE.Color(color), [color]);

  if (particleTrail) {
    return (
      <OrbitParticleTrail
        plot={plot}
        color={color}
        selectedParticleTrail={selectedParticleTrail}
        subtleParticleTrail={subtleParticleTrail}
        orbitOverride={orbitOverride}
        orbitTimeScale={orbitTimeScale}
      />
    );
  }

  const trailMesh = useMemo(() => {
    const params = rowToEmotionParams(plot);
    const points = getPureOrbitRingPoints(params, plot.word_id);
    if (!points) return null;

    const geometry = new MeshLineGeometry();
    geometry.setPoints(points);

    const material = new MeshLineMaterial({
      color: new THREE.Color(color),
      lineWidth: ORBIT_LINE_WIDTH,
      opacity: 0.32,
      sizeAttenuation: 0,
      resolution: new THREE.Vector2(size.width, size.height),
    });
    material.transparent = true;
    material.depthWrite = false;

    return new THREE.Mesh(geometry, material);
  }, [plot, color, size.width, size.height]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const targetVisibility = isNearbyVisible ? 1 : 0;
    const t = 1 - Math.exp(-6 * delta);
    visibility.current = THREE.MathUtils.lerp(visibility.current, targetVisibility, t);

    const visibilityFactor = visibility.current;
    mesh.visible = visibilityFactor > 0.01;
    if (!mesh.visible) return;

    mesh.getWorldPosition(worldPosition.current);
    const distance = camera.position.distanceTo(worldPosition.current);
    const appearance = getAtmosphericAppearance(distance, baseColor, isSelected, fadedColor.current);
    const material = mesh.material as MeshLineMaterial;
    const trailOpacity = (isSelected ? 0.55 : 0.32) * appearance.opacity * visibilityFactor;

    material.resolution.set(size.width, size.height);
    material.opacity = trailOpacity;
    material.color.copy(appearance.color);
  });

  if (!trailMesh) {
    return null;
  }

  return <primitive ref={meshRef} object={trailMesh} />;
}
