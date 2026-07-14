import { useMemo } from 'react';
import { BASIC_EMOTIONS } from '../../data/emotions';
import { buildPlutchikPetalPath } from '../../utils/plutchikPetalPath';

const VIEW_SIZE = 420;
const CENTER = VIEW_SIZE / 2;
const OUTER_RADIUS = 168;
const SECTOR_HALF_SPREAD = 22.5;
/** joy を 12 時方向に合わせる */
const ANGLE_OFFSET = -90;

interface PlutchikPetalWheelProps {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function PlutchikPetalWheel({
  size = 'min(46vh, 420px)',
  className,
  style,
}: PlutchikPetalWheelProps) {
  const petals = useMemo(
    () =>
      BASIC_EMOTIONS.map((emotion) => {
        const renderAngle = emotion.angle + ANGLE_OFFSET;
        return {
          id: emotion.id,
          color: emotion.color,
          d: buildPlutchikPetalPath(
            CENTER,
            CENTER,
            renderAngle,
            OUTER_RADIUS,
            SECTOR_HALF_SPREAD,
          ),
        };
      }),
    [],
  );

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      aria-hidden
      style={{ display: 'block', maxWidth: '100%', ...style }}
    >
      {petals.map((petal) => (
        <path key={petal.id} d={petal.d} fill={petal.color} fillOpacity={0.9} />
      ))}
    </svg>
  );
}
