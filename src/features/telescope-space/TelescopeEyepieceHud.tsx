import { useEffect, useState } from 'react';
import { getEmotionById, type EmotionId } from '../../data/emotions';
import type {
  TelescopeNearbyEmotionGlow,
  TelescopeViewFocus,
} from './telescopeFocus';

interface TelescopeEyepieceHudProps {
  focus: TelescopeViewFocus;
  visible: boolean;
  detailMode?: boolean;
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

/**
 * 未検知時も同じ位置に白い円を表示し、検知時は感情色の円と中央下のラベルに切り替える。
 * 上部ラベル枠（今の気持ちは／の方向・の中でも）は非検知時も常時表示し、検知名だけ空白にする。
 */
export function TelescopeInnerTrackLabel({
  focus,
  visible,
  detailMode = false,
  selectedEmotion = null,
}: TelescopeEyepieceHudProps) {
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

  const idle = !emotion;
  const trackRadius =
    LABEL_TRACK_RADIUS *
    (detailMode ? LAYER2_TRACK_SCALE : LAYER1_TRACK_SCALE);
  const trackCenterY = detailMode
    ? LAYER2_TRACK_CENTER_Y
    : LAYER1_TRACK_CENTER_Y;
  const trackSize = `${trackRadius * 200}%`;
  const trackColor = emotion?.color ?? '#ffffff';
  const idleOpacity = idle ? 0.42 : 1;
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

  const primaryLabel =
    detailMode && selectedEmotion ? selectedEmotion.label : emotion?.label ?? '';
  const primaryColor =
    detailMode && selectedEmotion
      ? selectedEmotion.color
      : emotion?.color ?? 'rgba(244, 236, 247, 0.55)';
  const detectionLabel = detailMode ? emotion?.label ?? '' : '';
  const detectionColor = emotion?.color ?? 'rgba(244, 236, 247, 0.55)';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <div style={{ opacity: idleOpacity, transition: 'opacity 300ms ease' }}>
        <TrackCircle
          size={trackSize}
          centerY={trackCenterY}
          color={trackColor}
          thin={idle}
        />

        <svg
          viewBox="0 0 24 24"
          width="32"
          height="32"
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: detailMode ? '46%' : '50%',
            transform: detailMode
              ? 'translate(-50%, -50%) perspective(180px) rotateX(62deg) scale(1.35)'
              : 'translate(-50%, -50%) perspective(180px) rotateX(0deg) scale(1)',
            transformOrigin: 'center',
            transformStyle: 'preserve-3d',
            overflow: 'visible',
            filter: `drop-shadow(0 0 4px ${trackColor}66)`,
            transition:
              'top 720ms cubic-bezier(0.22, 0.61, 0.36, 1), transform 720ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        >
        <defs>
          <clipPath id="telescope-center-star-clip">
            <path d="M12 1 C12.25 7.6 16.4 11.75 23 12 C16.4 12.25 12.25 16.4 12 23 C11.75 16.4 7.6 12.25 1 12 C7.6 11.75 11.75 7.6 12 1 Z" />
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
        <g clipPath="url(#telescope-center-star-clip)">
          <rect
            x="0"
            y="0"
            width="24"
            height="24"
            style={{
              fill: fallbackSource.color,
              opacity: idle ? 0.14 : 0.25,
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
              // SVGは24単位を32pxで表示しているためCSS移動量へ換算。
              const cssScale = 32 / 24;
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
                    cy="12"
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
          d="M12 1 C12.25 7.6 16.4 11.75 23 12 C16.4 12.25 12.25 16.4 12 23 C11.75 16.4 7.6 12.25 1 12 C7.6 11.75 11.75 7.6 12 1 Z"
          fill="none"
          stroke={trackColor}
          strokeWidth="0.28"
          strokeOpacity={idle ? 0.22 : 0.38}
          style={{
            transition: 'stroke 950ms ease, stroke-opacity 950ms ease',
          }}
        />
      </svg>
      </div>

      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          left: '50%',
          top: '6%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          opacity: 0.92,
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            color: 'rgba(244, 236, 247, 0.72)',
            fontSize: '0.78rem',
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
            fontSize: detailMode ? '1.08rem' : '1.45rem',
            fontWeight: 750,
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
            minHeight: detailMode ? '1.2em' : '1.5em',
            opacity: detailMode
              ? selectedEmotion
                ? 1
                : 0.55
              : emotion && detectionShown
                ? 1
                : 0.55,
            transition: 'opacity 300ms ease, color 300ms ease',
          }}
        >
          {primaryLabel || '\u00A0'}
        </span>
        <span
          style={{
            marginTop: -2,
            color: 'rgba(244, 236, 247, 0.72)',
            fontSize: '0.78rem',
            fontWeight: 550,
            letterSpacing: '0.18em',
            whiteSpace: 'nowrap',
          }}
        >
          {detailMode ? 'の中でも' : 'の方向'}
        </span>
        {detailMode ? (
          <span
            style={{
              color: detectionColor,
              fontSize: '1.45rem',
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
    </div>
  );
}

function TrackCircle({
  size,
  centerY,
  color,
  thin = false,
}: {
  size: string;
  centerY: number;
  color: string;
  thin?: boolean;
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
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: thin ? `1px solid ${color}` : `1.5px solid ${color}`,
        opacity: thin ? 0.7 : 0.85,
        boxShadow: thin
          ? `0 0 6px ${color}22`
          : `0 0 10px ${color}44, inset 0 0 12px ${color}22`,
        transition: `${TRACK_LAYOUT_TRANSITION}, border-color 0.35s ease, box-shadow 0.35s ease, opacity 0.35s ease`,
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
