import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { UserPlotRow } from '../types/userPlot';
import { getExplorationInfoUiLayout } from '../utils/explorationInfoUiLayout';
import { getPrimaryEmotionColor } from '../utils/emotionPlotBridge';
import { getEmotionUiTheme } from '../utils/emotionUiTheme';
import { LoopingTickerText } from './LoopingTickerText';
import { TELESCOPE_EMOTION_INFO_MOBILE_MAX_WIDTH } from '../features/telescope-space/constants';

interface ExplorationWordInfoPanelProps {
  plot: UserPlotRow;
  /** 右側に別HUDがある場合の退避量（縦書き時） */
  rightOffset?: number;
  /** 引き出し線などの外部参照用 */
  panelRef?: MutableRefObject<HTMLElement | null>;
  /**
   * vertical: デスクトップ右サイド縦書き
   * horizontal: スマホ下ドック横書き
   * auto: 画面幅で切替
   */
  writingDirection?: 'auto' | 'vertical' | 'horizontal';
  /**
   * true のとき absolute 配置せず、親ドックのレイアウトに従う。
   */
  embedded?: boolean;
  /**
   * 矢印セグメント移動時の入場方向。
   * 1 = 次へ（右からフェードイン）、-1 = 前へ（左から）、null = 通常入場。
   */
  enterDirection?: -1 | 1 | null;
}

function viewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

const WORD_INFO_ENTER_MS = 520;
const WORD_INFO_ENTER_EASE = 'cubic-bezier(.22,.61,.36,1)';

function wordInfoEnterAnimation(
  kind: 'horizontal' | 'vertical' | 'vertical-absolute',
  direction: -1 | 1 | null | undefined,
): string {
  if (kind === 'vertical-absolute') {
    if (direction === 1) {
      return `telescopeWordInfoSlideNextAbsolute ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
    }
    if (direction === -1) {
      return `telescopeWordInfoSlidePrevAbsolute ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
    }
    return `telescopeWordInfoEnter ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
  }
  if (direction === 1) {
    return `telescopeWordInfoSlideNext ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
  }
  if (direction === -1) {
    return `telescopeWordInfoSlidePrev ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
  }
  if (kind === 'horizontal') {
    return `telescopeWordInfoEnterMobile ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
  }
  return `telescopeWordInfoEnterEmbedded ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
}

/** 降り立つボタンなど、中央寄せ要素向けの入場アニメーション名 */
export function explorationUiSlideAnimation(
  direction: -1 | 1 | null | undefined,
  centered = false,
): string {
  if (direction === 1) {
    return centered
      ? `telescopeWordInfoSlideNextCentered ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`
      : `telescopeWordInfoSlideNext ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
  }
  if (direction === -1) {
    return centered
      ? `telescopeWordInfoSlidePrevCentered ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`
      : `telescopeWordInfoSlidePrev ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
  }
  return centered
    ? `telescopeWordInfoEnterFadeCentered ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`
    : `telescopeWordInfoEnterFade ${WORD_INFO_ENTER_MS}ms ${WORD_INFO_ENTER_EASE} both`;
}

export const EXPLORATION_UI_TRANSITION_KEYFRAMES = `
  @keyframes telescopeWordInfoEnterMobile {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes telescopeWordInfoEnter {
    from { opacity: 0; transform: translate(18px, calc(-50% + 10px)); }
    to { opacity: 1; transform: translate(0, -50%); }
  }
  @keyframes telescopeWordInfoEnterEmbedded {
    from { opacity: 0; transform: translateX(14px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes telescopeWordInfoEnterFade {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes telescopeWordInfoEnterFadeCentered {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  @keyframes telescopeWordInfoSlideNext {
    from { opacity: 0; transform: translateX(22px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes telescopeWordInfoSlidePrev {
    from { opacity: 0; transform: translateX(-22px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes telescopeWordInfoSlideNextCentered {
    from { opacity: 0; transform: translate(-50%, 0) translateX(22px); }
    to { opacity: 1; transform: translate(-50%, 0) translateX(0); }
  }
  @keyframes telescopeWordInfoSlidePrevCentered {
    from { opacity: 0; transform: translate(-50%, 0) translateX(-22px); }
    to { opacity: 1; transform: translate(-50%, 0) translateX(0); }
  }
  @keyframes telescopeWordInfoSlideNextAbsolute {
    from { opacity: 0; transform: translate(22px, -50%); }
    to { opacity: 1; transform: translate(0, -50%); }
  }
  @keyframes telescopeWordInfoSlidePrevAbsolute {
    from { opacity: 0; transform: translate(-22px, -50%); }
    to { opacity: 1; transform: translate(0, -50%); }
  }
`;

const WORD_INFO_ENTER_KEYFRAMES = EXPLORATION_UI_TRANSITION_KEYFRAMES;

/**
 * レイヤー4の単語説明パネル。
 * デスクトップは右サイド縦書き、スマホは画面下の横書きドック。
 */
export function ExplorationWordInfoPanel({
  plot,
  rightOffset = 210,
  panelRef,
  writingDirection = 'auto',
  embedded = false,
  enterDirection = null,
}: ExplorationWordInfoPanelProps) {
  const [viewport, setViewport] = useState(viewportSize);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport(viewportSize()));
    };
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, []);

  const horizontal =
    writingDirection === 'horizontal' ||
    (writingDirection === 'auto' &&
      viewport.width <= TELESCOPE_EMOTION_INFO_MOBILE_MAX_WIDTH);

  const layout = useMemo(() => {
    const base = getExplorationInfoUiLayout(
      viewport.width,
      viewport.height,
    ).currentWordPanel;
    if (horizontal) {
      return {
        kind: 'horizontal' as const,
        paddingY: Math.max(10, Math.round(base.paddingY * 0.5)),
        paddingX: Math.max(12, Math.round(base.paddingX * 0.7)),
        borderRadius: base.borderRadius,
        gap: Math.round(base.gap * 0.5),
        innerGap: Math.round(base.innerGap * 0.4),
        sectionLabelFontSize: '0.58rem',
        tickerFontSize: '0.55rem',
        wordFontSize: 'clamp(1.1rem, 5vw, 1.4rem)',
        bodyFontSize: 'clamp(0.7rem, 3vw, 0.86rem)',
        usageFontSize: 'clamp(0.62rem, 2.6vw, 0.76rem)',
        metaFontSize: '0.58rem',
        arrowBorder: Math.max(4, Math.round(base.arrowBorder * 0.85)),
        intensityBarWidth: Math.round(base.intensityBarWidth * 0.9),
        intensityBarHeight: Math.round(base.intensityBarHeight * 0.45),
      };
    }
    return { kind: 'vertical' as const, ...base };
  }, [horizontal, viewport]);

  const theme = useMemo(
    () => getEmotionUiTheme(getPrimaryEmotionColor(plot.primaryId), 'dark'),
    [plot.primaryId],
  );
  const meaning =
    plot.meaning?.trim() || 'この単語の意味データはまだ登録されていません。';

  if (layout.kind === 'horizontal') {
    return (
      <aside
        key={plot.word_id}
        ref={(el) => {
          if (panelRef) {
            panelRef.current = el;
          }
        }}
        aria-label={`${plot.word_id}の説明`}
        style={{
          position: embedded ? 'relative' : 'absolute',
          left: embedded ? undefined : 10,
          right: embedded ? undefined : 10,
          bottom: embedded ? undefined : 14,
          width: embedded ? '100%' : undefined,
          zIndex: 3,
          maxHeight: '32vh',
          padding: `${layout.paddingY}px ${layout.paddingX}px`,
          border: `1px solid ${theme.accentBorder}`,
          borderTop: `3px solid ${theme.accentBorderStrong}`,
          borderRadius: layout.borderRadius,
          backgroundColor: theme.panelBackground,
          boxShadow: theme.panelShadow,
          backdropFilter: 'blur(12px)',
          color: theme.textPrimary,
          pointerEvents: 'none',
          boxSizing: 'border-box',
          overflow: 'hidden',
          flexShrink: 0,
          animation: wordInfoEnterAnimation('horizontal', enterDirection),
        }}
      >
        <style>{`
          ${WORD_INFO_ENTER_KEYFRAMES}
          @keyframes telescopeCurrentWordArrowPulseH {
            0%, 100% { opacity: .45; transform: translateY(0); }
            50% { opacity: 1; transform: translateY(-3px); }
          }
        `}</style>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: layout.gap,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: layout.innerGap,
              paddingBottom: layout.innerGap,
              borderBottom: `1px solid ${theme.divider}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: `${layout.arrowBorder}px solid transparent`,
                  borderRight: `${layout.arrowBorder}px solid transparent`,
                  borderBottom: `${layout.arrowBorder + 3}px solid ${theme.accentMuted}`,
                  animation:
                    'telescopeCurrentWordArrowPulseH 900ms ease-in-out infinite',
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: layout.sectionLabelFontSize,
                  letterSpacing: '0.14em',
                  color: theme.accentMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                現在の語
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
                flex: 1,
              }}
            >
              <div
                style={{
                  height: 14,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <LoopingTickerText
                  text="CURRENT WORD"
                  fontSize={layout.tickerFontSize}
                  letterSpacing="0.12em"
                  lineHeight="14px"
                  color={theme.accentMuted}
                  durationSec={7.2}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <h2
                  className="font-momochidori font-momochidori--medium"
                  style={{
                    margin: 0,
                    fontSize: layout.wordFontSize,
                    lineHeight: 1.2,
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {plot.word_id}
                </h2>
                {plot.ruby?.trim() ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: `calc(${layout.wordFontSize} * 0.62)`,
                      letterSpacing: '0.06em',
                      color: theme.textMuted,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {`【${plot.ruby.trim()}】`}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: layout.bodyFontSize,
              lineHeight: 1.65,
              letterSpacing: '0.04em',
              color: theme.textSecondary,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {meaning}
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      key={plot.word_id}
      ref={(el) => {
        if (panelRef) {
          panelRef.current = el;
        }
      }}
      aria-label={`${plot.word_id}の説明`}
      style={{
        position: embedded ? 'relative' : 'absolute',
        top: embedded ? undefined : '50%',
        right: embedded
          ? undefined
          : Math.max(rightOffset, Math.round(viewport.width * 0.09)),
        width: 'max-content',
        maxWidth: embedded
          ? '100%'
          : `calc(100vw - ${rightOffset + 24}px)`,
        minHeight: layout.height,
        zIndex: 3,
        padding: `${layout.paddingY}px ${layout.paddingX}px`,
        border: `1px solid ${theme.accentBorder}`,
        borderLeft: `4px solid ${theme.accentBorderStrong}`,
        borderRadius: layout.borderRadius,
        backgroundColor: theme.panelBackground,
        boxShadow: theme.panelShadow,
        backdropFilter: 'blur(12px)',
        color: theme.textPrimary,
        pointerEvents: 'none',
        transform: embedded ? undefined : 'translateY(-50%)',
        boxSizing: 'border-box',
        flexShrink: 0,
        animation: wordInfoEnterAnimation(
          embedded ? 'vertical' : 'vertical-absolute',
          enterDirection,
        ),
      }}
    >
      <style>{`
        ${WORD_INFO_ENTER_KEYFRAMES}
        @keyframes telescopeCurrentWordArrowPulse {
          0%, 100% { opacity: .45; transform: translateX(0); }
          50% { opacity: 1; transform: translateX(-4px); }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row-reverse',
          alignItems: 'stretch',
          gap: layout.gap,
          minHeight: layout.innerMinHeight,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
            alignItems: 'flex-start',
            gap: layout.innerGap,
            paddingLeft: layout.paddingLeft,
            borderLeft: `1px solid ${theme.divider}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: layout.innerGap,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 0,
                height: 0,
                borderTop: `${layout.arrowBorder}px solid transparent`,
                borderBottom: `${layout.arrowBorder}px solid transparent`,
                borderRight: `${layout.arrowBorder + 4}px solid ${theme.accentMuted}`,
                animation:
                  'telescopeCurrentWordArrowPulse 900ms ease-in-out infinite',
              }}
            />
            <p
              style={{
                writingMode: 'vertical-rl',
                margin: 0,
                fontSize: layout.sectionLabelFontSize,
                letterSpacing: '0.18em',
                color: theme.accentMuted,
              }}
            >
              現在の語
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: layout.innerGap,
              width: layout.wordColumnWidth,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: layout.wordColumnWidth,
                height: layout.tickerHeight,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <LoopingTickerText
                text="CURRENT WORD"
                fontSize={layout.tickerFontSize}
                letterSpacing="0.14em"
                lineHeight={`${layout.tickerHeight}px`}
                color={theme.accentMuted}
                durationSec={7.2}
              />
            </div>
            <h2
              className="font-momochidori font-momochidori--medium"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                fontSize: layout.wordFontSize,
                lineHeight: 1.25,
                letterSpacing: '0.08em',
              }}
            >
              {plot.word_id}
            </h2>
            {plot.ruby?.trim() ? (
              <p
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  margin: 0,
                  fontSize: `calc(${layout.wordFontSize} * .78)`,
                  lineHeight: 1.35,
                  letterSpacing: '0.1em',
                  color: theme.textMuted,
                }}
              >
                {`︻${plot.ruby.trim()}︼`}
              </p>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
            alignItems: 'flex-start',
            gap: layout.bodyTextGap,
          }}
        >
          <p
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              margin: 0,
              maxHeight: layout.bodyMaxHeight,
              fontSize: layout.bodyFontSize,
              lineHeight: 1.9,
              letterSpacing: '0.06em',
              color: theme.textSecondary,
            }}
          >
            {meaning}
          </p>
          {plot.usageExample?.trim() ? (
            <p
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                maxHeight: layout.bodyMaxHeight,
                fontSize: layout.usageFontSize,
                lineHeight: 1.8,
                letterSpacing: '0.06em',
                color: theme.textMuted,
                whiteSpace: 'nowrap',
              }}
            >
              {`用例：${plot.usageExample.trim()}`}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
