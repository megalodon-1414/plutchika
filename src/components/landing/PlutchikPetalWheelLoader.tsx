import { useMemo } from 'react';
import { BASIC_EMOTIONS } from '../../data/emotions';
import { buildPlutchikPetalPath } from '../../utils/plutchikPetalPath';

const VIEW_SIZE = 420;
const CENTER = VIEW_SIZE / 2;
const OUTER_RADIUS = 128;
const INNER_RADIUS = 16;
const SECTOR_HALF_SPREAD = 16;
/** joy を 12 時方向に合わせる */
const ANGLE_OFFSET = -90;
const PETAL_COUNT = BASIC_EMOTIONS.length;
const COLOR_CYCLE_S = 2.4;
const COLOR_STAGGER_S = COLOR_CYCLE_S / PETAL_COUNT;

interface PlutchikPetalWheelLoaderProps {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  /** false にすると色のパルスを止める（退場前など） */
  animating?: boolean;
}

export function PlutchikPetalWheelLoader({
  size = 'min(42vh, 360px)',
  className,
  style,
  animating = true,
}: PlutchikPetalWheelLoaderProps) {
  const petals = useMemo(
    () =>
      BASIC_EMOTIONS.map((emotion, index) => {
        const renderAngle = emotion.angle + ANGLE_OFFSET;
        return {
          id: emotion.id,
          index,
          color: emotion.color,
          d: buildPlutchikPetalPath(
            CENTER,
            CENTER,
            renderAngle,
            OUTER_RADIUS,
            SECTOR_HALF_SPREAD,
            INNER_RADIUS,
          ),
        };
      }),
    [],
  );

  return (
    <>
      <style>
        {`
          @keyframes plutchikPetalColorPulse {
            0%, 100% {
              opacity: 0.55;
              filter: brightness(0.82) saturate(0.75);
            }
            50% {
              opacity: 1;
              filter: brightness(1.28) saturate(1.15);
            }
          }
          .plutchik-petal-wheel-loader {
            overflow: visible;
          }
          .plutchik-petal-wheel-loader__petal path {
            animation: plutchikPetalColorPulse ${COLOR_CYCLE_S}s ease-in-out infinite;
            animation-play-state: ${animating ? 'running' : 'paused'};
          }
          ${petals
            .map(
              (petal) => `
            .plutchik-petal-wheel-loader__petal--${petal.index} path {
              animation-delay: ${(petal.index * COLOR_STAGGER_S).toFixed(2)}s;
            }
          `,
            )
            .join('')}
        `}
      </style>
      <svg
        className={['plutchik-petal-wheel-loader', className].filter(Boolean).join(' ')}
        width={size}
        height={size}
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        aria-hidden
        style={{ display: 'block', maxWidth: '100%', ...style }}
      >
        <g>
          {petals.map((petal) => (
            <g
              key={petal.id}
              className={`plutchik-petal-wheel-loader__petal plutchik-petal-wheel-loader__petal--${petal.index}`}
            >
              <path d={petal.d} fill={petal.color} />
            </g>
          ))}
        </g>
        <circle
          cx={CENTER}
          cy={CENTER}
          r={12}
          fill="#ffffff"
          style={{
            opacity: animating ? 0.95 : 0.75,
          }}
        />
      </svg>
    </>
  );
}
