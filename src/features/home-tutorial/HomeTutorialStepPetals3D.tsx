import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BASIC_EMOTIONS, type BasicEmotionId } from '../../data/emotions';
import {
  createPlutchikPetalShape,
  PLUTCHIK_PETAL_EXTRUDE_SETTINGS,
} from '../../utils/plutchikPetalShape3d';

const OUTER_RADIUS = 0.7;
const HALF_SPREAD_DEG = 22.5;
const COMPACT_SCALE = 0.28;
const EXPANDED_SCALE = 1.42;
const SCALE_LERP_SPEED = 3.2;
/** 選択色が載る／退色する速さ */
const COLOR_LERP_SPEED = 5.5;
const MUTED_COLOR = new THREE.Color('#6a6a74');

function getPetalPlaneAngle(emotionAngle: number): number {
  return ((90 - emotionAngle) * Math.PI) / 180;
}

interface HomeTutorialStepPetals3DProps {
  center: [number, number, number];
  expanded: boolean;
  interactive: boolean;
  selectedIds: readonly BasicEmotionId[];
  selectionLabel: string;
  showSelectionLabel?: boolean;
  onToggleSelect?: (id: BasicEmotionId) => void;
}

function PetalMesh({
  geometry,
  color,
  petalDepth,
  interactive,
  isSelected,
  dimUnselected,
  onToggleSelect,
  emotionId,
}: {
  geometry: THREE.ExtrudeGeometry;
  color: string;
  petalDepth: number;
  interactive: boolean;
  isSelected: boolean;
  dimUnselected: boolean;
  onToggleSelect?: (id: BasicEmotionId) => void;
  emotionId: BasicEmotionId;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const colorAmount = useRef(isSelected ? 1 : 0);
  const emotionColor = useMemo(() => new THREE.Color(color), [color]);
  const displayColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    const material = materialRef.current;
    const group = groupRef.current;
    if (!material || !group) {
      return;
    }

    const targetAmount = !interactive
      ? 0.55
      : isSelected
        ? 1
        : dimUnselected
          ? 0
          : 0.28;
    colorAmount.current = THREE.MathUtils.lerp(
      colorAmount.current,
      targetAmount,
      1 - Math.exp(-COLOR_LERP_SPEED * delta),
    );

    const t = colorAmount.current;
    displayColor.copy(MUTED_COLOR).lerp(emotionColor, t);
    material.color.copy(displayColor);
    material.emissive.copy(displayColor);
    material.emissiveIntensity = THREE.MathUtils.lerp(0.04, 1.15, t);
    material.opacity = THREE.MathUtils.lerp(0.28, 1, t);
    material.roughness = THREE.MathUtils.lerp(0.55, 0.28, t);

    const scale = THREE.MathUtils.lerp(1, 1.08, t);
    group.scale.setScalar(scale);
  });

  return (
    <group ref={groupRef}>
      <mesh
        geometry={geometry}
        position={[0, 0, -petalDepth / 2]}
        onClick={(event) => {
          if (!interactive || !onToggleSelect) {
            return;
          }
          event.stopPropagation();
          onToggleSelect(emotionId);
        }}
        onPointerOver={(event) => {
          if (!interactive) {
            return;
          }
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (!interactive) {
            return;
          }
          document.body.style.cursor = 'auto';
        }}
      >
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.22}
          roughness={0.55}
          metalness={0}
          toneMapped={false}
          transparent
          opacity={0.72}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function HomeTutorialStepPetals3D({
  center,
  expanded,
  interactive,
  selectedIds,
  selectionLabel,
  showSelectionLabel = true,
  onToggleSelect,
}: HomeTutorialStepPetals3DProps) {
  const rootRef = useRef<THREE.Group>(null);
  const billboardRef = useRef<THREE.Group>(null);
  const scaleCurrent = useRef(expanded ? EXPANDED_SCALE : COMPACT_SCALE);
  const { camera } = useThree();

  const petalGeometry = useMemo(() => {
    const shape = createPlutchikPetalShape(OUTER_RADIUS, HALF_SPREAD_DEG);
    return new THREE.ExtrudeGeometry(shape, PLUTCHIK_PETAL_EXTRUDE_SETTINGS);
  }, []);

  const petalDepth = PLUTCHIK_PETAL_EXTRUDE_SETTINGS.depth ?? 0.048;

  const petals = useMemo(
    () =>
      BASIC_EMOTIONS.map((emotion) => {
        const planeAngle = getPetalPlaneAngle(emotion.angle);
        return {
          id: emotion.id,
          color: emotion.color,
          rotation: [0, 0, planeAngle - Math.PI / 2] as [number, number, number],
        };
      }),
    [],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasSelection = selectedIds.length > 0;

  useFrame((_, delta) => {
    const billboard = billboardRef.current;
    const root = rootRef.current;
    if (!billboard || !root) {
      return;
    }

    billboard.quaternion.copy(camera.quaternion);

    const targetScale = expanded ? EXPANDED_SCALE : COMPACT_SCALE;
    scaleCurrent.current = THREE.MathUtils.lerp(
      scaleCurrent.current,
      targetScale,
      1 - Math.exp(-SCALE_LERP_SPEED * delta),
    );
    root.scale.setScalar(scaleCurrent.current);
  });

  return (
    <group ref={rootRef} position={center}>
      <group ref={billboardRef}>
        {petals.map((petal) => {
          const isSelected = selectedSet.has(petal.id);
          const dimUnselected = interactive && selectedIds.length > 0 && !isSelected;
          return (
            <group key={petal.id} rotation={petal.rotation}>
              <PetalMesh
                geometry={petalGeometry}
                color={petal.color}
                petalDepth={petalDepth}
                interactive={interactive}
                isSelected={isSelected}
                dimUnselected={dimUnselected}
                onToggleSelect={onToggleSelect}
                emotionId={petal.id}
              />
            </group>
          );
        })}

        {interactive && showSelectionLabel && (
          <Html
            center
            position={[0, -OUTER_RADIUS * 1.32, 0.06]}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
            zIndexRange={[20, 0]}
          >
            <div
              className="font-momochidori"
              style={{
                minWidth: 'max-content',
                color: hasSelection ? '#f8f4ff' : 'rgba(248,244,255,0.55)',
                fontSize: 'clamp(1.45rem, 3.6vw, 2.35rem)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                lineHeight: 1.2,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                fontVariationSettings: "'wght' 780, 'wdth' 100",
                fontFeatureSettings: "'palt' 1",
                textShadow: '0 1px 10px rgba(0,0,0,0.65)',
              }}
            >
              {selectionLabel}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
