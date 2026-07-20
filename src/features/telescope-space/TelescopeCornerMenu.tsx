import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';

const LINE_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/**
 * 望遠鏡画面右上のメニュー（三本線）。
 * 線はそれぞれ変形し、プルダウンは背景なしの薄い文字メニュー。
 */
export function TelescopeCornerMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) {
        return;
      }
      if (!root.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        top: 'max(12px, env(safe-area-inset-top, 0px))',
        right: 14,
        zIndex: 6,
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes telescopeMenuItemIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
            filter: blur(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
      `}</style>

      <button
        type="button"
        aria-label="メニュー"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          position: 'relative',
          width: 40,
          height: 40,
          padding: 0,
          border: 'none',
          borderRadius: 8,
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 18,
            height: 12,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* 上線 */}
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: 1.5,
              borderRadius: 999,
              background: 'rgba(244, 236, 247, 0.92)',
              boxShadow: '0 0 6px rgba(0,0,0,0.45)',
              transformOrigin: 'center',
              transform: open
                ? 'translateY(5.25px) rotate(45deg)'
                : 'translateY(0) rotate(0deg)',
              transition: `transform 420ms ${LINE_EASING}`,
            }}
          />
          {/* 中線 */}
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              width: '100%',
              height: 1.5,
              marginTop: -0.75,
              borderRadius: 999,
              background: 'rgba(244, 236, 247, 0.92)',
              boxShadow: '0 0 6px rgba(0,0,0,0.45)',
              transformOrigin: 'center',
              transform: open ? 'scaleX(0)' : 'scaleX(1)',
              opacity: open ? 0 : 1,
              transition: `transform 280ms ${LINE_EASING}, opacity 220ms ease`,
            }}
          />
          {/* 下線 */}
          <span
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '100%',
              height: 1.5,
              borderRadius: 999,
              background: 'rgba(244, 236, 247, 0.92)',
              boxShadow: '0 0 6px rgba(0,0,0,0.45)',
              transformOrigin: 'center',
              transform: open
                ? 'translateY(-5.25px) rotate(-45deg)'
                : 'translateY(0) rotate(0deg)',
              transition: `transform 420ms ${LINE_EASING}`,
              transitionDelay: open ? '40ms' : '0ms',
            }}
          />
        </span>
      </button>

      <div
        role="menu"
        aria-hidden={!open}
        style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
          pointerEvents: open ? 'auto' : 'none',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          transition: 'opacity 180ms ease, visibility 180ms ease',
        }}
      >
        <Link
          role="menuitem"
          to={ROUTES.home}
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          style={{
            display: 'block',
            padding: '6px 2px',
            color: 'rgba(244, 236, 247, 0.88)',
            textDecoration: 'none',
            fontSize: '0.72rem',
            letterSpacing: '0.1em',
            fontWeight: 550,
            whiteSpace: 'nowrap',
            textShadow: '0 1px 8px rgba(0,0,0,0.7)',
            background: 'transparent',
            animation: open
              ? `telescopeMenuItemIn 360ms ${LINE_EASING} both`
              : 'none',
          }}
        >
          Home
        </Link>
      </div>
    </div>
  );
}
