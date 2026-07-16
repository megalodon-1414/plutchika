import { useEffect, useRef, useState } from 'react';
import type {
  TelescopeNearbyEmotionGlow,
  TelescopeViewFocus,
} from './telescopeFocus';

interface TelescopeEyepieceHudProps {
  focus: TelescopeViewFocus;
  visible: boolean;
}

/** 内側ラベル軌道の半径（接眼直径に対する割合） */
const LABEL_TRACK_RADIUS = 0.38;
/** ふち光の SVG 半径（viewBox 100 基準） */
const RIM_R = 49.2;
const RIM_C = 2 * Math.PI * RIM_R;
const RIM_FADE_MS = 420;

const ORBIT_STYLE_ID = 'telescope-label-orbit-style';

function ensureOrbitKeyframes() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(ORBIT_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = ORBIT_STYLE_ID;
  style.textContent = `
    @keyframes telescope-label-orbit {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * 穴の内側の円周上をラベルが周回する。
 * 初期／未検知時は白線 +「Click」。検知時は感情色 + 感情名。
 */
export function TelescopeInnerTrackLabel({
  focus,
  visible,
}: TelescopeEyepieceHudProps) {
  if (!visible) {
    return null;
  }

  ensureOrbitKeyframes();

  const emotion = focus.nearest;
  const idle = !emotion;
  const trackSize = `${LABEL_TRACK_RADIUS * 200}%`;
  const trackColor = emotion?.color ?? '#ffffff';
  const labelText = emotion?.label ?? 'Click';
  const labelColor = emotion?.color ?? '#ffffff';
  const idleOpacity = idle ? 0.42 : 1;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
        opacity: idleOpacity,
      }}
    >
      <TrackCircle size={trackSize} color={trackColor} thin={idle} />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: trackSize,
          height: trackSize,
          marginLeft: `-${LABEL_TRACK_RADIUS * 100}%`,
          marginTop: `-${LABEL_TRACK_RADIUS * 100}%`,
          animation: 'telescope-label-orbit 28s linear infinite',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '100%',
            top: '50%',
            transform: 'translate(-50%, -50%) rotate(90deg)',
            color: labelColor,
            fontSize: idle ? '0.95rem' : '1.12rem',
            fontWeight: 750,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
          aria-live="polite"
        >
          {labelText}
        </div>
        <div
          style={{
            position: 'absolute',
            left: '0%',
            top: '50%',
            transform: 'translate(-50%, -50%) rotate(-90deg)',
            color: labelColor,
            fontSize: idle ? '0.95rem' : '1.12rem',
            fontWeight: 750,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
          aria-hidden
        >
          {labelText}
        </div>
      </div>
    </div>
  );
}

function TrackCircle({
  size,
  color,
  thin = false,
}: {
  size: string;
  color: string;
  thin?: boolean;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: thin ? `1px solid ${color}` : `1.5px solid ${color}`,
        opacity: thin ? 0.7 : 0.85,
        boxShadow: thin
          ? `0 0 6px ${color}22`
          : `0 0 10px ${color}44, inset 0 0 12px ${color}22`,
        transition: 'border-color 0.35s ease, box-shadow 0.35s ease, opacity 0.35s ease',
      }}
    />
  );
}

interface GlowRenderState extends TelescopeNearbyEmotionGlow {
  /** 1 = 表示目標, 0 = フェードアウト中 */
  targetOpacity: number;
  opacity: number;
}

/**
 * 穴の外の近い感情の方位をふちの色光で示す。
 * 画面内の球は大きめに広がり、ラベル対象になると消える。フェードイン/アウトあり。
 */
export function TelescopeRimColorGlow({
  focus,
  visible,
}: TelescopeEyepieceHudProps) {
  const [glows, setGlows] = useState<GlowRenderState[]>([]);
  const glowsRef = useRef(glows);
  glowsRef.current = glows;
  const nearestId = focus.nearest?.id ?? null;

  useEffect(() => {
    if (!visible) {
      setGlows((prev) =>
        prev.map((g) => ({ ...g, targetOpacity: 0 })),
      );
      return;
    }

    const incoming = new Map(
      focus.nearby
        .filter((n) => n.id !== nearestId)
        .map((n) => [n.id, n]),
    );

    setGlows((prev) => {
      const nextById = new Map<string, GlowRenderState>();

      for (const g of prev) {
        const sample = incoming.get(g.id);
        if (sample && sample.id !== nearestId) {
          nextById.set(g.id, {
            ...g,
            ...sample,
            targetOpacity: 1,
          });
        } else {
          // ラベル判定された／対象外 → フェードアウト
          nextById.set(g.id, { ...g, targetOpacity: 0 });
        }
      }

      for (const [id, sample] of incoming) {
        if (!nextById.has(id)) {
          nextById.set(id, {
            ...sample,
            targetOpacity: 1,
            opacity: 0,
          });
        }
      }

      return Array.from(nextById.values());
    });
  }, [focus.nearby, nearestId, visible]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const list = glowsRef.current;
      let changed = false;
      const next = list
        .map((g) => {
          const dir = g.targetOpacity > g.opacity ? 1 : g.targetOpacity < g.opacity ? -1 : 0;
          if (dir === 0) {
            return g;
          }
          changed = true;
          const step = 1 / (RIM_FADE_MS / (1000 / 60));
          const opacity = Math.max(
            0,
            Math.min(1, g.opacity + dir * step),
          );
          return { ...g, opacity };
        })
        .filter((g) => !(g.targetOpacity === 0 && g.opacity <= 0.01));

      if (changed || next.length !== list.length) {
        setGlows(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!visible && glows.length === 0) {
    return null;
  }

  return (
    <svg
      viewBox="0 0 100 100"
      style={{
        position: 'absolute',
        inset: '-1.5%',
        width: '103%',
        height: '103%',
        pointerEvents: 'none',
        zIndex: 3,
        overflow: 'visible',
      }}
      aria-hidden
    >
      <defs>
        <filter id="telescope-rim-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        cx="50"
        cy="50"
        r={RIM_R}
        fill="none"
        stroke="rgba(160, 170, 200, 0.14)"
        strokeWidth="1.2"
      />

      {glows.map((sample) => {
        const rotDeg = (-sample.angle * 180) / Math.PI;
        const spread = sample.onScreen ? 1.55 : 1;
        const arcFrac = (0.055 + sample.weight * 0.09) * spread;
        const dash = arcFrac * RIM_C;
        const gap = RIM_C - dash;
        const dashOffset = dash / 2;
        const widthBoost = sample.onScreen ? 1.7 : 1;

        return (
          <g
            key={sample.id}
            transform={`rotate(${rotDeg} 50 50)`}
            opacity={sample.opacity}
          >
            <circle
              cx="50"
              cy="50"
              r={RIM_R}
              fill="none"
              stroke={sample.color}
              strokeWidth={(1.1 + sample.weight * 2.2) * widthBoost}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={dashOffset}
              opacity={0.4 + sample.weight * 0.5}
              filter="url(#telescope-rim-glow)"
            />
            <circle
              cx="50"
              cy="50"
              r={RIM_R}
              fill="none"
              stroke={sample.color}
              strokeWidth={(0.65 + sample.weight * 0.85) * widthBoost}
              strokeLinecap="round"
              strokeDasharray={`${dash * 0.55} ${RIM_C - dash * 0.55}`}
              strokeDashoffset={dash * 0.275}
              opacity={0.75 + sample.weight * 0.25}
            />
          </g>
        );
      })}
    </svg>
  );
}
