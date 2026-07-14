import { useEffect, useMemo, useState } from 'react';
import type { BasicEmotionId } from '../../data/emotions';
import { BASIC_EMOTIONS } from '../../data/emotions';
import type { EmotionUiTheme } from '../../utils/emotionUiTheme';
import { buildPlutchikPetalPath } from '../../utils/plutchikPetalPath';
import type { HomeTutorialStepContent } from './constants';
import type { HomeTutorialVerticalPanel } from './panelLayout';

const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease, box-shadow 320ms ease';

const VIEW_SIZE = 200;
const CENTER = VIEW_SIZE / 2;
const OUTER_RADIUS = 80;
const SECTOR_HALF_SPREAD = 22.5;
const ANGLE_OFFSET = -90;

interface HomeTutorialEmotionWheelPanelProps {
  uiTheme: EmotionUiTheme;
  panel: HomeTutorialVerticalPanel;
  content: HomeTutorialStepContent;
  visible: boolean;
}

export function HomeTutorialEmotionWheelPanel({
  uiTheme,
  panel,
  content,
  visible,
}: HomeTutorialEmotionWheelPanelProps) {
  const [selectedId, setSelectedId] = useState<BasicEmotionId | null>(null);
  const wheelSize = panel.wheelSize ?? 168;
  const wheelEmotionFontSize = panel.wheelEmotionFontSize ?? panel.bodyFontSize;

  useEffect(() => {
    if (!visible) {
      setSelectedId(null);
    }
  }, [visible]);

  const petals = useMemo(
    () =>
      BASIC_EMOTIONS.map((emotion) => ({
        id: emotion.id,
        label: emotion.label,
        color: emotion.color,
        d: buildPlutchikPetalPath(
          CENTER,
          CENTER,
          emotion.angle + ANGLE_OFFSET,
          OUTER_RADIUS,
          SECTOR_HALF_SPREAD,
        ),
      })),
    [],
  );

  const selectedEmotion = petals.find((petal) => petal.id === selectedId) ?? null;

  return (
    <aside
      style={{
        position: 'absolute',
        top: `${panel.y}px`,
        left: `${panel.x}px`,
        width: `${panel.width}px`,
        minHeight: `${panel.height}px`,
        zIndex: 2,
        padding: `${panel.paddingY}px ${panel.paddingX}px`,
        border: `1px solid ${uiTheme.accentBorder}`,
        borderLeft: `4px solid ${uiTheme.accentBorderStrong}`,
        borderRadius: `${panel.borderRadius}px`,
        backgroundColor: uiTheme.panelBackground,
        boxShadow: uiTheme.panelShadow,
        backdropFilter: 'blur(12px)',
        color: uiTheme.textPrimary,
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: `opacity 320ms ease, ${UI_COLOR_TRANSITION}`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row-reverse',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: `${panel.gap}px`,
          minHeight: `${panel.innerMinHeight}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
            alignItems: 'flex-start',
            gap: `${panel.innerGap}px`,
            paddingLeft: `${panel.paddingLeft}px`,
            borderLeft: `1px solid ${uiTheme.divider}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: `${panel.innerGap}px`,
            }}
          >
            <span
              style={{
                display: 'block',
                width: 0,
                height: 0,
                borderTop: `${panel.arrowBorder}px solid transparent`,
                borderBottom: `${panel.arrowBorder}px solid transparent`,
                borderRight: `${panel.arrowBorder + 4}px solid ${uiTheme.accentMuted}`,
                animation: 'homeTutorialArrowPulse 900ms ease-in-out infinite',
              }}
            />
            <p
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                fontSize: panel.sectionLabelFontSize,
                letterSpacing: '0.18em',
                color: uiTheme.accentMuted,
              }}
            >
              {content.sectionLabel}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: `${panel.innerGap}px`,
              width: `${panel.wordColumnWidth}px`,
            }}
          >
            <div
              style={{
                width: `${panel.wordColumnWidth}px`,
                height: `${panel.tickerHeight}px`,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <p
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  margin: 0,
                  fontSize: panel.tickerFontSize,
                  letterSpacing: '0.14em',
                  lineHeight: `${panel.tickerHeight}px`,
                  color: uiTheme.accentMuted,
                  whiteSpace: 'nowrap',
                  animation: 'homeTutorialTicker 4.2s linear infinite',
                }}
              >
                {content.ticker}
              </p>
            </div>
            <h1
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                fontSize: panel.wordFontSize,
                lineHeight: 1.25,
                letterSpacing: '0.12em',
              }}
            >
              {content.title}
            </h1>
            <p
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                fontSize: `calc(${panel.wordFontSize} * 0.78)`,
                lineHeight: 1.35,
                letterSpacing: '0.1em',
                color: uiTheme.textMuted,
              }}
            >
              {`【${content.titleRuby}】`}
            </p>
          </div>
        </div>

        <p
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            margin: 0,
            fontSize: panel.metaFontSize,
            letterSpacing: '0.12em',
            color: uiTheme.textMuted,
          }}
        >
          {content.note}
        </p>

        <p
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            margin: 0,
            maxHeight: `${panel.bodyMaxHeight}px`,
            fontSize: panel.bodyFontSize,
            lineHeight: 1.9,
            letterSpacing: '0.06em',
            color: uiTheme.textSecondary,
          }}
        >
          {content.body}
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: `${wheelSize}px`,
            gap: `${panel.innerGap}px`,
          }}
        >
          <svg
            width={wheelSize}
            height={wheelSize}
            viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
            role="img"
            aria-label="プルチックの8基本感情"
            style={{ display: 'block' }}
          >
            {petals.map((petal) => {
              const isSelected = selectedId === petal.id;
              return (
                <path
                  key={petal.id}
                  d={petal.d}
                  fill={petal.color}
                  fillOpacity={isSelected ? 1 : 0.82}
                  stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.15)'}
                  strokeWidth={isSelected ? 2.2 : 0.8}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedId(petal.id)}
                />
              );
            })}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={9}
              fill="rgba(255,255,255,0.08)"
              stroke="rgba(255,255,255,0.12)"
            />
          </svg>
          <p
            style={{
              margin: 0,
              width: '100%',
              textAlign: 'center',
              fontSize: wheelEmotionFontSize,
              fontWeight: selectedEmotion ? 700 : 500,
              letterSpacing: '0.08em',
              lineHeight: 1.3,
              color: selectedEmotion ? selectedEmotion.color : uiTheme.textMuted,
            }}
          >
            {selectedEmotion ? selectedEmotion.label : '環を選ぶ'}
          </p>
        </div>
      </div>
    </aside>
  );
}
