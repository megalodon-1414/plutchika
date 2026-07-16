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
  const trackRadius = idle ? LABEL_TRACK_RADIUS : LABEL_TRACK_RADIUS * 0.72;
  const trackSize = `${trackRadius * 200}%`;
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
          marginLeft: `-${trackRadius * 100}%`,
          marginTop: `-${trackRadius * 100}%`,
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
  if (!thin) {
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
          border: `1.5px solid ${color}`,
          opacity: 0.85,
          boxShadow: `0 0 10px ${color}44, inset 0 0 12px ${color}22`,
          transition: 'border-color 0.35s ease, box-shadow 0.35s ease, opacity 0.35s ease',
        }}
      >
        <svg
          viewBox="0 0 100 100"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
          }}
        >
          <circle
            cx="50"
            cy="50"
            r="12.5"
            fill="none"
            stroke={color}
            strokeWidth="0.55"
            strokeOpacity="0.16"
          />
          <line x1="50" y1="32" x2="50" y2="43" stroke={color} strokeWidth="0.58" strokeOpacity="0.22" strokeLinecap="round" />
          <line x1="50" y1="57" x2="50" y2="68" stroke={color} strokeWidth="0.58" strokeOpacity="0.22" strokeLinecap="round" />
          <line x1="32" y1="50" x2="43" y2="50" stroke={color} strokeWidth="0.58" strokeOpacity="0.22" strokeLinecap="round" />
          <line x1="57" y1="50" x2="68" y2="50" stroke={color} strokeWidth="0.58" strokeOpacity="0.22" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

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
 * 穴の外の近い感情の方位を、円周上の内向きバーで示す。
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
        <filter id="telescope-rim-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.8" result="blurWide" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blurTight" />
          <feMerge>
            <feMergeNode in="blurWide" />
            <feMergeNode in="blurTight" />
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
        // `angle` は NDC 上で 0=右, 反時計回り, Y-up。
        // SVG 回転は 0=上配置の基準線を時計回りに回すので変換する。
        const rotDeg = 90 - (sample.angle * 180) / Math.PI;
        const spread = sample.onScreen ? 1.18 : 1;
        const barLen = (2.4 + sample.weight * 4.8) * spread;
        const arcSpreadDeg = (0.7 + sample.weight * 1.05) * spread;
        const maxBars = 21; // 現在(14)の 1.5倍
        const minBars = 10;
        // weight が大きいほど「近い」想定 → 本数を増やす
        const closenessT = Math.max(0, Math.min(1, sample.weight));
        let barCount = Math.round(minBars + closenessT * (maxBars - minBars));
        // 扇の中心で対称になるように奇数に丸める
        if (barCount % 2 === 0) {
          barCount += 1;
        }
        barCount = Math.min(maxBars, barCount);
        const widthBoost = sample.onScreen ? 1.28 : 1;
        const strokeW = (0.34 + sample.weight * 0.4) * widthBoost;
        const groupOpacity = sample.opacity;
        const baseBarOpacity = 0.78 + sample.weight * 0.22;
        const centerIndex = (barCount - 1) / 2;
        const maxCenterDist = Math.max(centerIndex, 1);

        const barOffsets = Array.from(
          { length: barCount },
          (_, i) => (i - centerIndex) * arcSpreadDeg,
        );

        return (
          <g
            key={sample.id}
            transform={`rotate(${rotDeg} 50 50)`}
            opacity={groupOpacity}
          >
            {barOffsets.map((offsetDeg, index) => {
              const distFromCenter = Math.abs(index - centerIndex) / maxCenterDist;
              const centerWeight = 1 - distFromCenter;
              const edgeFade = centerWeight * centerWeight;
              const barOpacity = baseBarOpacity * (0.14 + edgeFade * 0.86);
              const bentLen = barLen * (1 - distFromCenter * 0.1);
              const glowLen = bentLen * 1.08;
              const innerLen = bentLen * 0.62;
              const startY = 50 - RIM_R - 1.1;

              return (
              <g key={index} transform={`rotate(${offsetDeg} 50 50)`}>
                <line
                  x1="50"
                  y1={startY}
                  x2="50"
                  y2={startY - glowLen}
                  stroke={sample.color}
                  strokeWidth={strokeW * 2.8}
                  strokeLinecap="round"
                  strokeOpacity={barOpacity * 0.18}
                  filter="url(#telescope-rim-glow)"
                />
                <line
                  x1="50"
                  y1={startY}
                  x2="50"
                  // 円の外側方向へ伸ばす（中心ではなく外へ）
                  y2={startY - bentLen}
                  stroke={sample.color}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                  strokeOpacity={barOpacity}
                  filter="url(#telescope-rim-glow)"
                />
                <line
                  x1="50"
                  y1={startY}
                  x2="50"
                  y2={startY - innerLen}
                  stroke={sample.color}
                  strokeWidth={strokeW * 0.5}
                  strokeLinecap="round"
                  strokeOpacity={barOpacity * 0.72}
                />
              </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
