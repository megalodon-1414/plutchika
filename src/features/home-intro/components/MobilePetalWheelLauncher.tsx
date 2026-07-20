import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlutchikPetalWheel } from '../../../components/landing/PlutchikPetalWheel';
import { BASIC_EMOTIONS } from '../../../data/emotions';

const ICON_VIEW = 48;
const ICON_CENTER = ICON_VIEW / 2;
const ICON_PETAL_RX = 6;
const ICON_PETAL_RY = 14;

/** スマホ用：小さな8花びらアイコン（感情環を開くトリガー）。 */
function PetalWheelIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_VIEW} ${ICON_VIEW}`}
      aria-hidden
      style={{ display: 'block', overflow: 'visible' }}
    >
      {BASIC_EMOTIONS.map((emotion) => {
        const angle = emotion.angle - 90;
        return (
          <ellipse
            key={emotion.id}
            cx={ICON_CENTER}
            cy={ICON_CENTER - ICON_PETAL_RY * 0.55}
            rx={ICON_PETAL_RX}
            ry={ICON_PETAL_RY}
            fill={emotion.color}
            fillOpacity={0.88}
            transform={`rotate(${angle} ${ICON_CENTER} ${ICON_CENTER})`}
            style={{ mixBlendMode: 'screen' }}
          />
        );
      })}
    </svg>
  );
}

interface MobilePetalWheelLauncherProps {
  opacity: number;
  stepIndex: number;
}

/**
 * スマホ向け。本文ブロック内（本文の直後）に置き、タップで感情環オーバーレイを開く。
 * パネルと同じ Html ツリーに載せるため、ブロック位置の移動に追従する。
 */
export function MobilePetalWheelLauncher({
  opacity,
  stepIndex,
}: MobilePetalWheelLauncherProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [stepIndex]);

  useEffect(() => {
    if (opacity < 0.5) {
      setOpen(false);
    }
  }, [opacity]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const interactive = opacity > 0.5;

  return (
    <>
      <div className="home-intro-petal-launcher-row">
        <button
          type="button"
          className="home-intro-petal-launcher"
          style={{
            opacity,
            transition: 'opacity 0.2s linear',
            pointerEvents: interactive ? 'auto' : 'none',
          }}
          onClick={() => setOpen(true)}
          aria-label="プルチックの感情環を開く"
          aria-expanded={open}
        >
          <PetalWheelIcon />
          <span className="home-intro-petal-launcher__hint">感情を見てみる</span>
        </button>
      </div>
      {open &&
        createPortal(
          <div
            className="home-intro-petal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="プルチックの感情環"
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="home-intro-petal-overlay__backdrop"
              aria-label="閉じる"
              onClick={() => setOpen(false)}
            />
            <div className="home-intro-petal-overlay__panel">
              <button
                type="button"
                className="home-intro-petal-overlay__close"
                aria-label="閉じる"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
              <PlutchikPetalWheel
                key={stepIndex}
                size="min(78vw, 300px)"
                style={{ maxWidth: 'none' }}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
