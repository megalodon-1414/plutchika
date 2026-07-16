import type { CSSProperties, ReactNode } from 'react';
import {
  TELESCOPE_EYEPIECE_MAX_PX,
  TELESCOPE_EYEPIECE_VH,
} from './constants';

interface TelescopeEyepieceProps {
  children: ReactNode;
  /** 穴の内側（クリップ内）オーバーレイ — ラベル軌道など */
  innerOverlay?: ReactNode;
  /** 穴のふち（クリップ外）オーバーレイ — 色光など */
  rimOverlay?: ReactNode;
  /** 円の外・右端に置く UI（拡大率ドットなど） */
  rightRail?: ReactNode;
  /** 0 = 遠景寄り、1 = 最大 */
  aperture: number;
}

/**
 * 画面中央の円形ビューポート。拡大された景色はこの内側だけに見える。
 */
export function TelescopeEyepiece({
  children,
  innerOverlay,
  rimOverlay,
  rightRail,
  aperture,
}: TelescopeEyepieceProps) {
  const sizeScale = 0.9 + aperture * 0.1;
  const diameter = `min(${TELESCOPE_EYEPIECE_MAX_PX * sizeScale}px, ${TELESCOPE_EYEPIECE_VH * sizeScale}vh, 96vw)`;

  const shellStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    pointerEvents: 'none',
    zIndex: 1,
  };

  const lensStyle: CSSProperties = {
    width: diameter,
    height: diameter,
    position: 'relative',
    borderRadius: '50%',
    pointerEvents: 'auto',
    transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1), height 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: `
      0 0 0 1px rgba(180, 190, 220, 0.2),
      0 0 0 10px rgba(8, 10, 16, 0.95),
      0 0 36px rgba(0, 0, 0, 0.55)
    `,
  };

  const clipStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    overflow: 'hidden',
    clipPath: 'circle(50% at 50% 50%)',
    background: '#02030a',
  };

  const railStyle: CSSProperties = {
    position: 'absolute',
    left: 'calc(100% + 56px)',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'auto',
  };

  return (
    <div style={shellStyle}>
      <div style={lensStyle}>
        <div style={clipStyle}>
          {children}
          {innerOverlay}
        </div>
        {rimOverlay}
        {rightRail ? <div style={railStyle}>{rightRail}</div> : null}
      </div>
    </div>
  );
}
