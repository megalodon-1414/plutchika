import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BASIC_EMOTIONS } from '../data/emotions';
import type { EmotionUiTheme } from '../utils/emotionUiTheme';
import { getEmotionPositionInfo } from '../utils/emotionCoordinates';
import {
  MINIMAP_DEFAULT_CAMERA,
  MINIMAP_SHAPE_CENTER,
  buildMinimapWireframePositions,
  getBasicEmotionMinimapVertices,
  getMinimapBoundingRadius,
  worldTupleToMinimapLocal,
  type MinimapSyncState,
} from '../utils/emotionMinimapLayout';

const VIEWPORT = 156;
const SIDE_LABEL_WIDTH = 44;
const INNER_GAP = 8;
const PANEL_PADDING = 10;
export const MAP_WIDTH = VIEWPORT + INNER_GAP + SIDE_LABEL_WIDTH + PANEL_PADDING * 2;
const PANEL_RADIUS = 9;
const FIT_MARGIN = 1.14;

const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease, box-shadow 320ms ease';

interface EmotionMinimapProps {
  syncState: MinimapSyncState | null;
  uiTheme: EmotionUiTheme;
  active?: boolean;
  onClick?: () => void;
}

function computeFitDistance(camera: THREE.PerspectiveCamera, boundingRadius: number): number {
  const fovRad = (camera.fov * Math.PI) / 180;
  const halfFov = fovRad / 2;
  const verticalDistance = boundingRadius / Math.sin(halfFov);
  const horizontalDistance = boundingRadius / (Math.sin(halfFov) * camera.aspect);
  return Math.max(verticalDistance, horizontalDistance) * FIT_MARGIN;
}

function MinimapCamera({ syncState }: { syncState: MinimapSyncState | null }) {
  const { camera } = useThree();
  const shapeCenter = useRef(new THREE.Vector3(...MINIMAP_SHAPE_CENTER));
  const desiredPosition = useRef(new THREE.Vector3(...MINIMAP_DEFAULT_CAMERA));
  const desiredUp = useRef(new THREE.Vector3(0, 1, 0));
  const boundingRadius = useMemo(() => getMinimapBoundingRadius(), []);

  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    const fitDistance = computeFitDistance(camera, boundingRadius);

    if (syncState) {
      const camPos = new THREE.Vector3(...worldTupleToMinimapLocal(syncState.cameraPosition));
      const camTarget = new THREE.Vector3(...worldTupleToMinimapLocal(syncState.cameraTarget));
      const viewDir = camPos.sub(camTarget);
      if (viewDir.lengthSq() > 1e-6) {
        desiredPosition.current.copy(shapeCenter.current).add(viewDir.normalize().multiplyScalar(fitDistance));
      } else {
        desiredPosition.current.set(...MINIMAP_DEFAULT_CAMERA).normalize().multiplyScalar(fitDistance);
      }
      desiredUp.current.set(...syncState.cameraUp).normalize();
    } else {
      desiredPosition.current
        .set(...MINIMAP_DEFAULT_CAMERA)
        .normalize()
        .multiplyScalar(fitDistance);
      desiredUp.current.set(0, 1, 0);
    }

    camera.position.lerp(desiredPosition.current, 0.22);
    camera.up.copy(desiredUp.current);
    camera.lookAt(shapeCenter.current);
  });

  return null;
}

function MinimapWireframe({ holoColor }: { holoColor: string }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buildMinimapWireframePositions(), 3));
    return geo;
  }, []);

  const glowMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: holoColor,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [holoColor],
  );

  const coreMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: holoColor,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [holoColor],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      glowMat.dispose();
      coreMat.dispose();
    },
    [geometry, glowMat, coreMat],
  );

  useFrame((state) => {
    const pulse = 0.84 + Math.sin(state.clock.elapsedTime * 2.4) * 0.08;
    const flicker = 0.97 + Math.sin(state.clock.elapsedTime * 17.3) * 0.03;
    coreMat.opacity = 0.88 * pulse * flicker;
    glowMat.opacity = 0.22 * pulse;
  });

  return (
    <group>
      <lineSegments geometry={geometry} scale={1.03} material={glowMat} />
      <lineSegments geometry={geometry} material={coreMat} />
    </group>
  );
}

function MinimapEmotionNodes() {
  const vertices = useMemo(() => getBasicEmotionMinimapVertices(), []);

  return (
    <>
      {BASIC_EMOTIONS.map((emotion) => {
        const [x, y, z] = vertices[emotion.id];
        return (
          <group key={emotion.id} position={[x, y, z]}>
            <mesh scale={1.8}>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshBasicMaterial
                color={emotion.color}
                transparent
                opacity={0.35}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.028, 8, 8]} />
              <meshBasicMaterial color={emotion.color} transparent opacity={0.95} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function MinimapFocusMarker({
  syncState,
  markerColor,
}: {
  syncState: MinimapSyncState | null;
  markerColor: string;
}) {
  const markerRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const reticleRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!markerRef.current) {
      return;
    }

    if (!syncState?.focusPosition) {
      markerRef.current.visible = false;
      return;
    }

    markerRef.current.visible = true;
    markerRef.current.position.set(...worldTupleToMinimapLocal(syncState.focusPosition));

    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.6) * 0.1;
    if (ringRef.current) {
      ringRef.current.scale.setScalar(pulse);
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.8;
    }
    if (reticleRef.current) {
      reticleRef.current.rotation.z = -state.clock.elapsedTime * 1.1;
    }
  });

  return (
    <group ref={markerRef} visible={false}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.11, 0.145, 32]} />
        <meshBasicMaterial color={markerColor} transparent opacity={0.5} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={reticleRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.07, 0.078, 4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.058, 12, 12]} />
        <meshBasicMaterial color={markerColor} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.038, 10, 10]} />
        <meshBasicMaterial color={markerColor} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

function MinimapViewRay({
  syncState,
  markerColor,
}: {
  syncState: MinimapSyncState | null;
  markerColor: string;
}) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({
      color: markerColor,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const object = new THREE.Line(geometry, material);
    object.visible = false;
    return object;
  }, [markerColor]);

  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );

  useFrame((state) => {
    if (!syncState?.focusPosition) {
      line.visible = false;
      return;
    }

    const focus = new THREE.Vector3(...worldTupleToMinimapLocal(syncState.focusPosition));
    const camPos = new THREE.Vector3(...worldTupleToMinimapLocal(syncState.cameraPosition));
    const camTarget = new THREE.Vector3(...worldTupleToMinimapLocal(syncState.cameraTarget));
    const dir = camPos.sub(camTarget);

    if (dir.lengthSq() < 1e-6) {
      line.visible = false;
      return;
    }

    const tip = focus.clone().add(dir.normalize().multiplyScalar(0.36));
    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.setXYZ(0, focus.x, focus.y, focus.z);
    attr.setXYZ(1, tip.x, tip.y, tip.z);
    attr.needsUpdate = true;
    (line.material as THREE.LineBasicMaterial).opacity = 0.7 + Math.sin(state.clock.elapsedTime * 5) * 0.15;
    line.visible = true;
  });

  return <primitive object={line} />;
}

function MinimapScene({
  syncState,
  holoColor,
  markerColor,
}: {
  syncState: MinimapSyncState | null;
  holoColor: string;
  markerColor: string;
}) {
  return (
    <>
      <MinimapCamera syncState={syncState} />
      <ambientLight intensity={0.45} />
      <MinimapWireframe holoColor={holoColor} />
      <MinimapEmotionNodes />
      <MinimapFocusMarker syncState={syncState} markerColor={markerColor} />
      <MinimapViewRay syncState={syncState} markerColor={markerColor} />
    </>
  );
}

function MapPinIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="18" viewBox="0 0 13 16" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M6.5 0C3.46 0 1 2.46 1 5.5c0 4.06 5.5 10.5 5.5 10.5S12 9.56 12 5.5C12 2.46 9.54 0 6.5 0Z"
        fill={color}
        opacity={0.92}
      />
      <circle cx="6.5" cy="5.5" r="2.1" fill="#ffffff" opacity={0.95} />
    </svg>
  );
}

export function EmotionMinimap({
  syncState,
  uiTheme,
  active = false,
  onClick,
}: EmotionMinimapProps) {
  const positionInfo = useMemo(() => {
    if (!syncState?.focusPosition || !syncState.primaryId) {
      return null;
    }
    return getEmotionPositionInfo(
      syncState.focusPosition,
      syncState.primaryId,
      syncState.primaryLabel,
    );
  }, [syncState?.focusPosition, syncState?.primaryId, syncState?.primaryLabel]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={active ? '感情空間ミニマップ（俯瞰中・クリックで探索に戻る）' : '感情空間ミニマップ（クリックで全体俯瞰）'}
      aria-pressed={active}
      className="emotion-minimap-holo"
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      style={{
        position: 'relative',
        width: `${MAP_WIDTH}px`,
        pointerEvents: onClick ? 'auto' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transition: UI_COLOR_TRANSITION,
        outline: active ? `1px solid ${uiTheme.accentBorderStrong}` : 'none',
        boxShadow: active ? `0 0 16px ${uiTheme.holoGlow}` : undefined,
      }}
    >
      <style>
        {`
          .emotion-minimap-holo {
            animation: holoFloat 5.5s ease-in-out infinite;
          }
          @keyframes holoFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }
          @keyframes holoScan {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(220%); }
          }
          @keyframes holoFlicker {
            0%, 100% { opacity: 1; }
            48% { opacity: 1; }
            49% { opacity: 0.82; }
            50% { opacity: 1; }
            89% { opacity: 1; }
            90% { opacity: 0.88; }
            91% { opacity: 1; }
          }
        `}
      </style>

      <div
        style={{
          position: 'relative',
          padding: `${PANEL_PADDING}px`,
          borderRadius: `${PANEL_RADIUS}px`,
          background: `linear-gradient(145deg, ${uiTheme.holoPanel}, rgba(0,0,0,0.08))`,
          border: `1px solid ${uiTheme.accentBorder}`,
          borderRight: `3px solid ${uiTheme.accentBorderStrong}`,
          boxShadow: `0 0 18px ${uiTheme.holoGlow}, inset 0 0 20px ${uiTheme.panelInset}`,
          backdropFilter: 'blur(14px) saturate(1.4)',
          animation: 'holoFlicker 6s linear infinite',
          transition: UI_COLOR_TRANSITION,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: `${INNER_GAP}px`,
          }}
        >
          <div style={{ width: `${VIEWPORT}px`, flexShrink: 0 }}>
            <div
              style={{
                position: 'relative',
                width: `${VIEWPORT}px`,
                height: `${VIEWPORT}px`,
                borderRadius: '50%',
                overflow: 'hidden',
                border: `1px solid ${uiTheme.holoBorder}`,
                boxShadow: `inset 0 0 20px ${uiTheme.holoGlow}`,
                transition: UI_COLOR_TRANSITION,
              }}
            >
              <Canvas
                camera={{ position: MINIMAP_DEFAULT_CAMERA, fov: 36, near: 0.05, far: 20 }}
                dpr={[1, 1.5]}
                gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
                style={{ width: '100%', height: '100%', background: 'transparent' }}
                onCreated={({ gl }) => {
                  gl.setClearColor(0x000000, 0);
                }}
              >
                <MinimapScene syncState={syncState} holoColor={uiTheme.holoPrimary} markerColor={uiTheme.markerColor} />
              </Canvas>

              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    ${uiTheme.holoStripe} 2px,
                    ${uiTheme.holoStripe} 4px
                  )`,
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: '28%',
                  background: `linear-gradient(180deg, transparent, ${uiTheme.holoScan}, transparent)`,
                  animation: 'holoScan 3.8s linear infinite',
                  pointerEvents: 'none',
                  mixBlendMode: 'screen',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at center, transparent 38%, ${uiTheme.panelBackground} 100%)`,
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>

          <div
            style={{
              width: `${SIDE_LABEL_WIDTH}px`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 0 2px 8px',
              borderLeft: `1px solid ${uiTheme.divider}`,
            }}
          >
            <MapPinIcon color={uiTheme.holoPrimary} />
            <p
              style={{
                margin: 0,
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: uiTheme.holoText,
                textShadow: `0 0 8px ${uiTheme.holoGlow}`,
                whiteSpace: 'nowrap',
                transition: UI_COLOR_TRANSITION,
              }}
            >
              {positionInfo?.primaryEmotionLabel ?? '—'}
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row-reverse',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: '5px',
                marginTop: '2px',
                paddingTop: '6px',
                borderTop: `1px solid ${uiTheme.holoBorder}`,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.34rem',
                letterSpacing: '0.08em',
                color: uiTheme.holoSubtext,
                transition: UI_COLOR_TRANSITION,
              }}
            >
              <span
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  whiteSpace: 'nowrap',
                }}
              >
                {positionInfo?.coordinateLines[0] ?? '— — —'}
              </span>
              <span
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  whiteSpace: 'nowrap',
                }}
              >
                {positionInfo?.coordinateLines[1] ?? '— — —'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
