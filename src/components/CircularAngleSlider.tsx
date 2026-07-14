import { useCallback, useRef } from 'react';
import { EmotionFaceIcon } from './EmotionFaceIcon';

interface CircularAngleSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const SIZE = 132;
const CENTER = SIZE / 2;
const TRACK_RADIUS = 52;
const HANDLE_RADIUS = 7;

function pointerToAngle(clientX: number, clientY: number, rect: DOMRect): number {
  const x = clientX - rect.left - CENTER;
  const y = clientY - rect.top - CENTER;
  const deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
  return Math.round(((deg % 360) + 360) % 360);
}

function angleToPosition(angle: number): { x: number; y: number } {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: CENTER + TRACK_RADIUS * Math.cos(rad),
    y: CENTER + TRACK_RADIUS * Math.sin(rad),
  };
}

export function CircularAngleSlider({ value, onChange }: CircularAngleSliderProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const handle = angleToPosition(value);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      onChange(pointerToAngle(clientX, clientY, rect));
    },
    [onChange],
  );

  const startDrag = (clientX: number, clientY: number) => {
    updateFromPointer(clientX, clientY);

    const onMove = (event: PointerEvent) => updateFromPointer(event.clientX, event.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg
          ref={svgRef}
          width={SIZE}
          height={SIZE}
          style={{ display: 'block', touchAction: 'none', cursor: 'pointer' }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            startDrag(event.clientX, event.clientY);
          }}
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={TRACK_RADIUS}
            fill="none"
            stroke="#1f2833"
            strokeWidth="8"
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={TRACK_RADIUS}
            fill="none"
            stroke="#45f3ff"
            strokeWidth="2"
            strokeDasharray="4 6"
            opacity="0.6"
          />
          <line x1={CENTER} y1={CENTER} x2={handle.x} y2={handle.y} stroke="#45f3ff" strokeWidth="2" opacity="0.5" />
          <circle cx={handle.x} cy={handle.y} r={HANDLE_RADIUS} fill="#45f3ff" stroke="#0b0c10" strokeWidth="2" />
        </svg>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <EmotionFaceIcon angle={value} size={72} />
        </div>
      </div>
    </div>
  );
}
