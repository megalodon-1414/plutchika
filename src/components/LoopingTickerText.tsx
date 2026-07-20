import { useLayoutEffect, type CSSProperties } from 'react';

interface LoopingTickerTextProps {
  text: string;
  fontSize: string | number;
  color: string;
  letterSpacing?: string;
  lineHeight?: string | number;
  /** 1ユニット分が通り抜ける秒数 */
  durationSec?: number;
  style?: CSSProperties;
}

const KEYFRAMES_ID = 'looping-ticker-keyframes';

function ensureTickerKeyframes() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(KEYFRAMES_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes loopingTickerScroll {
      from { transform: translate3d(0, 0, 0); }
      to { transform: translate3d(-50%, 0, 0); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * 文言を2つ並べて translateX(-50%) でシームレスにループさせるティッカー。
 */
export function LoopingTickerText({
  text,
  fontSize,
  color,
  letterSpacing = '0.12em',
  lineHeight = '1em',
  durationSec = 7.5,
  style,
}: LoopingTickerTextProps) {
  useLayoutEffect(() => {
    ensureTickerKeyframes();
  }, []);

  const unit = `${text}  ·  `;
  const segmentStyle: CSSProperties = {
    flex: '0 0 auto',
    display: 'inline-block',
    fontSize,
    letterSpacing,
    lineHeight,
    color,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          width: 'max-content',
          whiteSpace: 'nowrap',
          willChange: 'transform',
          animation: `loopingTickerScroll ${durationSec}s linear infinite`,
        }}
      >
        <span style={segmentStyle}>{unit}</span>
        <span style={segmentStyle}>{unit}</span>
      </div>
    </div>
  );
}
