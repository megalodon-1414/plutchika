import { useEffect, useRef, useState } from 'react';
import { getEmotionById, type EmotionId } from '../../data/emotions';
import type { TelescopeRegionIndicatorState } from './TelescopeGalaxyLayer';
import {
  getTelescopeAimCssFraction,
  isTelescopeCursorAimActive,
  isTelescopePinHidden,
  TELESCOPE_AIM,
} from './telescopeAim';
import type {
  TelescopeNearbyEmotionGlow,
  TelescopeViewFocus,
} from './telescopeFocus';

interface TelescopeEyepieceHudProps {
  focus: TelescopeViewFocus;
  visible: boolean;
  detailMode?: boolean;
  /** レイヤー3（領域ビュー）— 中央の十字星をバー平面に沿わせて倒す */
  regionMode?: boolean;
  selectedEmotion?: { label: string; color: string } | null;
}

/** 内側ラベル軌道の半径（接眼直径に対する割合） */
const LABEL_TRACK_RADIUS = 0.38;
const LAYER1_TRACK_SCALE = 0.72 * 0.9;
const LAYER2_TRACK_SCALE = 0.84 * 1.2 * 1.15;
const LAYER1_TRACK_CENTER_Y = 0.5;
const LAYER2_TRACK_CENTER_Y = 1.2;
const TRACK_LAYOUT_TRANSITION =
  'top 720ms cubic-bezier(0.22, 0.61, 0.36, 1), width 720ms cubic-bezier(0.22, 0.61, 0.36, 1), height 720ms cubic-bezier(0.22, 0.61, 0.36, 1)';

function getEmotionLabel(id: string): string {
  return getEmotionById(id as EmotionId).label;
}

/** 照準ピン（逆しずく型）。先端が (12, 23) ＝下端中央 */
const AIM_PIN_PATH =
  'M12 23 C12 23 4.5 13.6 4.5 8.6 C4.5 4.3 7.9 1.5 12 1.5 C16.1 1.5 19.5 4.3 19.5 8.6 C19.5 13.6 12 23 12 23 Z';
/** ピン頭部（縁の円）の中心。白い円をここに置く */
const AIM_PIN_HEAD_CX = 12;
const AIM_PIN_HEAD_CY = 8.6;
/** ピンが指す地点の楕円サイズ（px） */
const AIM_GROUND_ELLIPSE_W = 26;
const AIM_GROUND_ELLIPSE_H = 10;

/**
 * 未検知時も同じ位置に白い円を表示し、検知時は感情色の円と中央下のラベルに切り替える。
 * 上部ラベル枠（今の気持ちは／の方向・の中でも）は非検知時も常時表示し、検知名だけ空白にする。
 */
export function TelescopeInnerTrackLabel({
  focus,
  visible,
  detailMode = false,
  regionMode = false,
}: TelescopeEyepieceHudProps) {
  const emotion = focus.nearest;

  if (!visible) {
    return null;
  }

  const idle = !emotion;
  const trackRadius =
    LABEL_TRACK_RADIUS *
    (detailMode ? LAYER2_TRACK_SCALE : LAYER1_TRACK_SCALE);
  const trackCenterY = detailMode
    ? LAYER2_TRACK_CENTER_Y
    : LAYER1_TRACK_CENTER_Y;
  const trackSize = `${trackRadius * 200}%`;
  const trackColor = emotion?.color ?? '#ffffff';
  const idleOpacity = idle ? 0.62 : 1;
  const rawColorSources = [
    ...(emotion
      ? [{ color: emotion.color, angle: emotion.angle, weight: 1, center: true }]
      : []),
    ...focus.nearby.slice(0, 4).map((sample) => ({
      color: sample.color,
      angle: sample.angle,
      weight: sample.weight,
      center: false,
    })),
  ];
  const fallbackSource = rawColorSources.at(-1) ?? {
    color: '#ffffff',
    angle: 0,
    weight: 0,
    center: true,
  };
  // スロット数を固定し、色源が入れ替わっても同じSVG要素上で補間させる。
  const centerColorSources = Array.from({ length: 5 }, (_, index) => {
    const source = rawColorSources[index] ?? fallbackSource;
    return { ...source, active: index < rawColorSources.length };
  });

  const aimAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const el = aimAnchorRef.current;
      if (el) {
        if (TELESCOPE_AIM.mode === 'cursor' && isTelescopeCursorAimActive()) {
          const { x, y } = getTelescopeAimCssFraction();
          el.style.left = `${x * 100}%`;
          el.style.top = `${y * 100}%`;
        } else {
          el.style.left = '50%';
          el.style.top = '50%';
        }
        // 矢印ホバー中などはピンを一時的に隠す
        el.style.visibility = isTelescopePinHidden() ? 'hidden' : 'visible';
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {/* 方向ラベルのレール円 — 画面固定のまま */}
      <div style={{ opacity: idleOpacity, transition: 'opacity 300ms ease' }}>
        <TrackCircle
          size={trackSize}
          centerY={trackCenterY}
          color={trackColor}
          thin={idle}
          flattened={regionMode}
        />
      </div>

      {/* 照準ピン — カーソル位置（検知点）を逆しずく型で示す */}
      <div
        ref={aimAnchorRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
          opacity: idleOpacity,
          transition: 'opacity 300ms ease',
        }}
      >
        <style>
          {`@keyframes telescope-aim-ripple {
  0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0.5; }
  100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
}`}
        </style>
        {/* ピンが指す地点の楕円（接地マーク） */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: AIM_GROUND_ELLIPSE_W,
            height: AIM_GROUND_ELLIPSE_H,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: `1px solid ${trackColor}`,
            opacity: idle ? 0.45 : 0.55,
            boxShadow: `0 0 6px ${trackColor}44`,
            transition:
              'opacity 300ms ease, border-color 300ms ease, box-shadow 300ms ease',
          }}
        />
        {/* 選択中の波紋 — 楕円が広がって消えるループ */}
        {!idle
          ? [0, 1].map((index) => (
              <div
                key={index}
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: AIM_GROUND_ELLIPSE_W,
                  height: AIM_GROUND_ELLIPSE_H,
                  borderRadius: '50%',
                  border: `1px solid ${trackColor}`,
                  opacity: 0,
                  animation: `telescope-aim-ripple 1.8s ease-out ${index * 0.9}s infinite`,
                }}
              />
            ))
          : null}
        <svg
          viewBox="0 0 24 24"
          width="30"
          height="30"
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            // 先端（下端）が照準点に一致するよう上へずらす
            transform: 'translate(-50%, -100%)',
            transformOrigin: '50% 100%',
            overflow: 'visible',
            filter: `drop-shadow(0 0 4px ${trackColor}66)`,
          }}
        >
        <defs>
          <clipPath id="telescope-aim-pin-clip">
            <path d={AIM_PIN_PATH} />
          </clipPath>
          <filter
            id="telescope-center-color-field-blur"
            x="-80%"
            y="-80%"
            width="260%"
            height="260%"
          >
            <feGaussianBlur stdDeviation="4.2" />
          </filter>
        </defs>
        <g clipPath="url(#telescope-aim-pin-clip)">
          <rect
            x="0"
            y="0"
            width="24"
            height="24"
            style={{
              fill: fallbackSource.color,
              opacity: idle ? 0.2 : 0.25,
              transition: 'fill 950ms ease, opacity 950ms ease',
            }}
          />
          <g filter="url(#telescope-center-color-field-blur)">
            {centerColorSources.map((source, index) => {
              const sourceDistance = source.center
                ? 0
                : 3.2 + (1 - source.weight) * 6.8;
              const dx = Math.cos(source.angle) * sourceDistance;
              const dy = -Math.sin(source.angle) * sourceDistance;
              // SVGは24単位を30pxで表示しているためCSS移動量へ換算。
              const cssScale = 30 / 24;
              return (
                <g
                  key={index}
                  style={{
                    transform: `translate(${dx * cssScale}px, ${dy * cssScale}px)`,
                    transition:
                      'transform 950ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                  }}
                >
                  <circle
                    cx="12"
                    cy="9"
                    r={9 + source.weight * 3}
                    style={{
                      fill: source.color,
                      opacity: source.active ? 0.42 : 0,
                      mixBlendMode: 'normal',
                      transition:
                        'fill 950ms ease, opacity 700ms ease, r 950ms ease',
                    }}
                  />
                </g>
              );
            })}
          </g>
        </g>
        <path
          d={AIM_PIN_PATH}
          fill="none"
          stroke={trackColor}
          strokeWidth="0.6"
          strokeOpacity={idle ? 0.5 : 0.6}
          style={{
            transition: 'stroke 950ms ease, stroke-opacity 950ms ease',
          }}
        />
        {/* 縁部分（頭部）の中心の白い円 */}
        <circle
          cx={AIM_PIN_HEAD_CX}
          cy={AIM_PIN_HEAD_CY}
          r="2.3"
          fill="#ffffff"
          style={{
            opacity: idle ? 0.8 : 0.92,
            transition: 'opacity 300ms ease',
          }}
        />
      </svg>
      </div>
    </div>
  );
}

/**
 * 画面上部のガイドラベル（「今の気持ちは〜の方向／の中でも」）。
 * レンズ径・オーバースキャン・水平シフトの影響を受けないよう、
 * レンズ内ではなく画面座標に固定して表示する。
 * レイヤー3では「の方向」を出さず、区画に応じた文言を可変部に表示する。
 */
export function TelescopeGuideLabelHud({
  focus,
  visible,
  detailMode = false,
  regionMode = false,
  selectedEmotion = null,
  regionGuideLabel = null,
  regionGuideColor = null,
}: Omit<TelescopeEyepieceHudProps, 'regionMode'> & {
  regionMode?: boolean;
  /** レイヤー3: 現在区画のガイド文言（例「悲観よりの悲しみ」） */
  regionGuideLabel?: string | null;
  regionGuideColor?: string | null;
}) {
  const emotion = focus.nearest;
  const [detectionShown, setDetectionShown] = useState(false);

  useEffect(() => {
    if (!visible || !emotion) {
      setDetectionShown(false);
      return;
    }
    setDetectionShown(false);
    const enterFrame = requestAnimationFrame(() => {
      setDetectionShown(true);
    });
    return () => cancelAnimationFrame(enterFrame);
  }, [emotion?.id, visible]);

  if (!visible) {
    return null;
  }

  const primaryLabel = regionMode
    ? regionGuideLabel ?? ''
    : detailMode && selectedEmotion
      ? selectedEmotion.label
      : emotion?.label ?? '';
  const primaryColor = regionMode
    ? regionGuideColor ??
      selectedEmotion?.color ??
      'rgba(244, 236, 247, 0.55)'
    : detailMode && selectedEmotion
      ? selectedEmotion.color
      : emotion?.color ?? 'rgba(244, 236, 247, 0.55)';
  const detectionLabel = detailMode ? emotion?.label ?? '' : '';
  const detectionColor = emotion?.color ?? 'rgba(244, 236, 247, 0.55)';
  const primaryOpacity = regionMode
    ? regionGuideLabel
      ? 1
      : 0.55
    : detailMode
      ? selectedEmotion
        ? 1
        : 0.55
      : emotion && detectionShown
        ? 1
        : 0.55;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'absolute',
        left: '50%',
        top: 'clamp(72px, 13vh, 150px)',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        opacity: 0.92,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <span
        style={{
          color: 'rgba(244, 236, 247, 0.72)',
          fontSize: '1.02rem',
          fontWeight: 550,
          letterSpacing: '0.18em',
          whiteSpace: 'nowrap',
        }}
      >
        今の気持ちは
      </span>
      <span
        style={{
          color: primaryColor,
          fontSize: detailMode && !regionMode ? '1.4rem' : '1.9rem',
          fontWeight: 750,
          letterSpacing: '0.14em',
          whiteSpace: 'nowrap',
          minHeight: detailMode && !regionMode ? '1.2em' : '1.5em',
          opacity: primaryOpacity,
          transition: 'opacity 300ms ease, color 300ms ease',
        }}
      >
        {primaryLabel || '\u00A0'}
      </span>
      {!regionMode ? (
        <span
          style={{
            marginTop: -2,
            color: 'rgba(244, 236, 247, 0.72)',
            fontSize: '1.02rem',
            fontWeight: 550,
            letterSpacing: '0.18em',
            whiteSpace: 'nowrap',
          }}
        >
          {detailMode ? 'の中でも' : 'の方向'}
        </span>
      ) : null}
      {detailMode && !regionMode ? (
        <span
          style={{
            color: detectionColor,
            fontSize: '1.9rem',
            fontWeight: 750,
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
            minHeight: '1.5em',
            opacity: emotion && detectionShown ? 1 : 0.55,
            transition: 'opacity 300ms ease, color 300ms ease',
          }}
        >
          {detectionLabel || '\u00A0'}
        </span>
      ) : null}
    </div>
  );
}

function TrackCircle({
  size,
  centerY,
  color,
  thin = false,
  flattened = false,
}: {
  size: string;
  centerY: number;
  color: string;
  thin?: boolean;
  /** レイヤー3: 空間の平面と平行に見えるよう縦に潰して楕円にする */
  flattened?: boolean;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        top: `${centerY * 100}%`,
        width: size,
        height: size,
        // カメラ仰角（≒35°）から見た平面上の円 ≒ 縦 cos55° に潰れた楕円
        transform: flattened
          ? 'translate(-50%, -50%) scaleY(0.57)'
          : 'translate(-50%, -50%) scaleY(1)',
        borderRadius: '50%',
        border: thin ? `1px solid ${color}` : `1.5px solid ${color}`,
        opacity: thin ? 0.7 : 0.85,
        boxShadow: thin
          ? `0 0 6px ${color}22`
          : `0 0 10px ${color}44, inset 0 0 12px ${color}22`,
        transition: `${TRACK_LAYOUT_TRANSITION}, transform 720ms cubic-bezier(0.22, 0.61, 0.36, 1), border-color 0.35s ease, box-shadow 0.35s ease, opacity 0.35s ease`,
      }}
    />
  );
}

interface DirectionMarkerRenderState extends TelescopeNearbyEmotionGlow {
  shown: boolean;
}

/** 接眼内外にある感情の方向を、小さな円と縦書きラベルで示す。 */
export function TelescopeRimEmotionIcons({
  focus,
  visible,
  detailMode = false,
}: TelescopeEyepieceHudProps) {
  const nearestId = focus.nearest?.id ?? null;
  const [markers, setMarkers] = useState<DirectionMarkerRenderState[]>([]);

  useEffect(() => {
    const detectedDirection: TelescopeNearbyEmotionGlow | null =
      detailMode && focus.nearest
        ? {
            id: focus.nearest.id,
            color: focus.nearest.color,
            angle: focus.nearest.angle,
            nx: focus.nearest.nx,
            ny: focus.nearest.ny,
            weight: 1,
            onScreen: true,
          }
        : null;
    const incoming = visible
      ? detailMode
        ? [
            ...(detectedDirection ? [detectedDirection] : []),
            ...focus.nearby.filter((sample) => sample.id !== nearestId),
          ]
        : focus.nearby
            .filter((sample) => sample.id !== nearestId)
            .slice(0, 4)
      : [];
    const incomingById = new Map(
      incoming.map((sample) => [sample.id, sample]),
    );

    setMarkers((previous) => {
      const next = previous.map((marker) => {
        const sample = incomingById.get(marker.id);
        return sample
          ? { ...marker, ...sample, shown: true }
          : { ...marker, shown: false };
      });
      for (const sample of incoming) {
        if (!previous.some((marker) => marker.id === sample.id)) {
          next.push({ ...sample, shown: false });
        }
      }
      return next;
    });

    const enterFrame = requestAnimationFrame(() => {
      setMarkers((previous) =>
        previous.map((marker) =>
          incomingById.has(marker.id) ? { ...marker, shown: true } : marker,
        ),
      );
    });
    const cleanupTimer = window.setTimeout(() => {
      setMarkers((previous) => previous.filter((marker) => marker.shown));
    }, 360);

    return () => {
      cancelAnimationFrame(enterFrame);
      window.clearTimeout(cleanupTimer);
    };
  }, [focus.nearby, focus.nearest, nearestId, visible, detailMode]);

  if (markers.length === 0) {
    return null;
  }

  const trackRadius =
    LABEL_TRACK_RADIUS *
    (detailMode ? LAYER2_TRACK_SCALE : LAYER1_TRACK_SCALE);
  const trackCenterY = detailMode
    ? LAYER2_TRACK_CENTER_Y
    : LAYER1_TRACK_CENTER_Y;
  const trackSize = `${trackRadius * 200}%`;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: `${trackCenterY * 100}%`,
          width: trackSize,
          height: trackSize,
          transform: 'translate(-50%, -50%)',
          transition: TRACK_LAYOUT_TRANSITION,
        }}
      >
        {markers.map((sample) => {
          // 移動後の円中心から対象の投影位置へ向かう正確な方位。
          const targetX = 0.5 + sample.nx * 0.5;
          const targetY = 0.5 - sample.ny * 0.5;
          const directionX = targetX - 0.5;
          const directionY = targetY - trackCenterY;
          const directionLength =
            Math.hypot(directionX, directionY) || 1;
          const left = 50 + (directionX / directionLength) * 50;
          const top = 50 + (directionY / directionLength) * 50;
          const closeness = Math.max(0, Math.min(1, sample.weight));
          const dotSize = 12 + closeness * 18;
          const labelFontSize = 0.62 + closeness * 0.18;

          return (
            <div
              key={sample.id}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                transform: `translate(-50%, -50%) scale(${sample.shown ? 1 : 0.82})`,
                opacity: sample.shown ? 0.55 + closeness * 0.45 : 0,
                transition:
                  'left 140ms linear, top 140ms linear, opacity 300ms ease, transform 300ms ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: dotSize,
                  height: dotSize,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  backgroundColor: sample.color,
                  boxShadow: `0 0 ${8 + closeness * 14}px ${sample.color}aa`,
                  transition:
                    'width 180ms ease, height 180ms ease, box-shadow 180ms ease',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  display: 'block',
                  left: '50%',
                  top: `calc(50% + ${dotSize * 0.5 + 6}px)`,
                  transform: 'translateX(-50%)',
                  writingMode: 'vertical-rl',
                  textOrientation: 'upright',
                  width: '1.2em',
                  height: 'max-content',
                  whiteSpace: 'nowrap',
                  fontSize: `${labelFontSize.toFixed(3)}rem`,
                  fontWeight: 650,
                  letterSpacing: '0.14em',
                  color: sample.color,
                  lineHeight: 1.1,
                  transition: 'top 180ms ease, font-size 180ms ease',
                }}
              >
                {getEmotionLabel(sample.id)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** レイヤー3 現在位置インジケータの線の長さ（px） */
const REGION_INDICATOR_LENGTH_PX = 270;
/** バーの画面上の傾きへ加える追加チルト（+で左端が上がる、ラジアン） */
const REGION_INDICATOR_EXTRA_TILT_RAD = 0.2;

/**
 * レイヤー3の現在位置インジケータ（画面固定 HUD）。
 * Canvas 側のレポーターが書き込む共有状態を rAF で読み取り、
 * バーの画面上の傾きと同じ角度の線分＋現在位置マーカーを描く。
 */
export function TelescopeRegionPositionHud({
  state,
}: {
  state: { readonly current: TelescopeRegionIndicatorState };
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rotateRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const startDotRef = useRef<HTMLDivElement>(null);
  const endDotRef = useRef<HTMLDivElement>(null);
  const midDotRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const shared = state.current;
      const root = rootRef.current;
      const rotate = rotateRef.current;
      const line = lineRef.current;
      const startDot = startDotRef.current;
      const endDot = endDotRef.current;
      const midDot = midDotRef.current;
      const marker = markerRef.current;
      if (
        !root ||
        !rotate ||
        !line ||
        !startDot ||
        !endDot ||
        !midDot ||
        !marker
      ) {
        return;
      }
      const opacity = shared.active ? shared.reveal : 0;
      root.style.opacity = opacity.toFixed(3);
      if (opacity <= 0.001) {
        return;
      }
      rotate.style.transform = `rotate(${
        shared.angle + REGION_INDICATOR_EXTRA_TILT_RAD
      }rad)`;
      line.style.background = `linear-gradient(90deg, ${shared.startColor}, ${shared.endColor})`;
      startDot.style.background = shared.startColor;
      endDot.style.background = shared.endColor;
      midDot.style.background = shared.midColor;
      midDot.style.boxShadow = `0 0 8px ${shared.midColor}aa`;
      marker.style.left = `${shared.progress * REGION_INDICATOR_LENGTH_PX}px`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  return (
    <div
      ref={rootRef}
      style={{
        width: REGION_INDICATOR_LENGTH_PX,
        opacity: 0,
        pointerEvents: 'none',
      }}
    >
      <div
        ref={rotateRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 0,
          transformOrigin: 'center',
        }}
      >
        <div
          ref={lineRef}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -2,
            height: 4,
            borderRadius: 2,
            opacity: 0.75,
          }}
        />
        <div
          ref={startDotRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 13,
            height: 13,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        <div
          ref={endDotRef}
          style={{
            position: 'absolute',
            left: '100%',
            top: 0,
            width: 13,
            height: 13,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {/* 中央（progress 0.5）= 24感情の位置 */}
        <div
          ref={midDotRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 10,
            height: 10,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        <div
          ref={markerRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 25,
            height: 25,
            borderRadius: '50%',
            border: '2.5px solid rgba(255, 255, 255, 0.92)',
            background: 'rgba(255, 255, 255, 0.14)',
            boxShadow: '0 0 12px rgba(255, 255, 255, 0.4)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    </div>
  );
}
