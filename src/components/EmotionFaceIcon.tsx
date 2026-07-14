import { getEmotionFaceAtAngle } from '../utils/emotionFace';

interface EmotionFaceIconProps {
  angle: number;
  size?: number;
}

export function EmotionFaceIcon({ angle, size = 56 }: EmotionFaceIconProps) {
  const face = getEmotionFaceAtAngle(angle);
  const normalized = ((angle % 360) + 360) % 360;
  const blend = (normalized % 45) / 45;
  const label =
    blend < 0.12 ? face.label : blend > 0.88 ? face.nextLabel : `${face.label}〜${face.nextLabel}`;

  const eyeRx = 7 * face.eyeWidth;
  const eyeRy = 9 * face.eyeHeight;
  const leftEyeX = 36;
  const rightEyeX = 64;
  const eyeY = 42;
  const browY = 30;
  const browLen = 10;
  const innerTiltOffset = face.browInnerTilt * 12;
  const outerLift = face.browAngle * -6;
  const mouthY = 66;
  const mouthCurve = face.mouthCurve * 14;
  const mouthOpenH = 4 + face.mouthOpen * 12;
  const mouthOpenW = 6 + face.mouthOpen * 10;
  const pupilOffsetY =
    Math.sign(face.pupilY) * Math.min(Math.abs(face.pupilY), eyeRy * 0.75);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#0b0c10" stroke="#45f3ff" strokeWidth="2" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="#1f2833" strokeWidth="1" />

        <line
          x1={leftEyeX - browLen}
          y1={browY + outerLift}
          x2={leftEyeX + 5}
          y2={browY + innerTiltOffset}
          stroke="#e5e7eb"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1={rightEyeX + browLen}
          y1={browY + outerLift}
          x2={rightEyeX - 5}
          y2={browY + innerTiltOffset}
          stroke="#e5e7eb"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        <ellipse cx={leftEyeX} cy={eyeY} rx={eyeRx} ry={eyeRy} fill="#e5e7eb" />
        <ellipse cx={rightEyeX} cy={eyeY} rx={eyeRx} ry={eyeRy} fill="#e5e7eb" />
        <circle cx={leftEyeX} cy={eyeY + pupilOffsetY} r={2.8} fill="#0b0c10" />
        <circle cx={rightEyeX} cy={eyeY + pupilOffsetY} r={2.8} fill="#0b0c10" />

        {face.mouthOpen > 0.35 ? (
          <ellipse cx="50" cy={mouthY} rx={mouthOpenW} ry={mouthOpenH} fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
        ) : (
          <path
            d={`M ${50 - 14} ${mouthY} Q 50 ${mouthY + mouthCurve} ${50 + 14} ${mouthY}`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}
      </svg>
      <span style={{ fontSize: '0.7rem', color: '#9ca3af', lineHeight: 1 }}>{label}</span>
    </div>
  );
}
