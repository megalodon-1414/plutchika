import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EmotionUiTheme } from '../../utils/emotionUiTheme';
import type { ExplorationInfoUiLayout } from '../../utils/explorationInfoUiLayout';
import {
  HOME_TUTORIAL_INTRO_PANEL_TUNE,
  type HomeTutorialIntroFitLineTune,
  type HomeTutorialIntroPanelTune,
  type HomeTutorialStepContent,
} from './constants';
import {
  capRemToPanelWidth,
  getIntroPanelResponsiveLayout,
} from './responsive';

const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease, box-shadow 320ms ease';

const INTRO_PANEL_BASE_WIDTH = 880;
const INTRO_PANEL_LEFT_LINE_WIDTH = 4;
const MOMOCHIDORI_FAMILY = 'var(--font-family-momochidori)';

interface HomeTutorialIntroPanelProps {
  uiTheme: EmotionUiTheme;
  panel: ExplorationInfoUiLayout['currentWordPanel'];
  content: HomeTutorialStepContent;
  visible: boolean;
  viewportWidth: number;
  tune?: HomeTutorialIntroPanelTune;
  /** 左下装飾ブロックの文字色（合成感情など） */
  welcomeColor?: string;
  /** true で本文を右揃え（STEP3 など） */
  bodyAlignRight?: boolean;
  /**
   * STEP3 スマホ専用: キャッチ非表示、見出しを球直下固定、body を右下固定
   * （body の出し入れで見出し位置が動かない）
   */
  step3MobilePinned?: boolean;
  /** 球の画面座標（step3MobilePinned 時の見出し位置に使用） */
  sphereScreenPoint?: { x: number; y: number } | null;
}

function rem(value: number, scale: number): string {
  return `${(value * scale).toFixed(3)}rem`;
}

function remToPx(value: number, scale: number): number {
  return value * 16 * scale;
}

function momochidoriStyle(
  wght: number,
  wdth: number,
  extra?: CSSProperties,
): CSSProperties {
  return {
    fontFamily: MOMOCHIDORI_FAMILY,
    fontFeatureSettings: "'palt' 1",
    fontVariationSettings: `"wght" ${wght}, "wdth" ${wdth}`,
    ...extra,
  };
}

interface TightFit {
  wdth: number;
  letterSpacing: string;
}

function findTightFit(
  element: HTMLSpanElement,
  targetWidth: number,
  wght: number,
  wdthMin: number,
  wdthMax: number,
  autoFillWidth: boolean,
): TightFit {
  let best = 100;
  let lo = wdthMin;
  let hi = wdthMax;

  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    element.style.fontVariationSettings = `"wght" ${wght}, "wdth" ${mid}`;
    element.style.letterSpacing = '0px';
    const fits = element.scrollWidth <= targetWidth + 0.5;
    if (fits) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  element.style.fontVariationSettings = `"wght" ${wght}, "wdth" ${best}`;
  element.style.letterSpacing = '0px';

  if (!autoFillWidth) {
    return { wdth: best, letterSpacing: '0px' };
  }

  const remaining = targetWidth - element.scrollWidth;
  if (remaining <= 0.5) {
    return { wdth: best, letterSpacing: '0px' };
  }

  const charCount = element.textContent?.length ?? 1;
  const gapCount = Math.max(1, charCount - 1);

  return {
    wdth: best,
    letterSpacing: `${remaining / gapCount}px`,
  };
}

function MomochidoriFitCell({
  text,
  cellWidth,
  cellHeight,
  fontSize,
  wght,
  color,
  align,
  valign = 'bottom',
  wdthMin,
  wdthMax,
  autoFillWidth,
  fitMode = 'auto',
  manualWdth,
  manualLetterSpacing,
  paddingLeftPx = 0,
  clipOverflow = true,
}: {
  text: string;
  cellWidth: number;
  cellHeight: number;
  fontSize: string;
  wght: number;
  color: string;
  align: 'left' | 'right' | 'center';
  valign?: 'top' | 'bottom';
  wdthMin: number;
  wdthMax: number;
  autoFillWidth: boolean;
  fitMode?: 'auto' | 'manual';
  manualWdth?: number;
  manualLetterSpacing?: string;
  paddingLeftPx?: number;
  clipOverflow?: boolean;
}) {
  const isManual = fitMode === 'manual';
  const textRef = useRef<HTMLSpanElement>(null);
  const [autoFit, setAutoFit] = useState<TightFit>({
    wdth: 100,
    letterSpacing: '0px',
  });

  useLayoutEffect(() => {
    if (isManual) {
      return;
    }

    const element = textRef.current;
    if (!element || cellWidth <= 0) {
      return;
    }

    setAutoFit(
      findTightFit(
        element,
        Math.max(0, cellWidth - paddingLeftPx),
        wght,
        wdthMin,
        wdthMax,
        autoFillWidth,
      ),
    );
  }, [
    autoFillWidth,
    cellHeight,
    cellWidth,
    fontSize,
    isManual,
    paddingLeftPx,
    text,
    wdthMax,
    wdthMin,
    wght,
  ]);

  const fit: TightFit = isManual
    ? {
        wdth: manualWdth ?? 100,
        letterSpacing: manualLetterSpacing ?? '0px',
      }
    : autoFit;

  return (
    <div
      style={{
        width: cellWidth,
        height: cellHeight,
        display: 'flex',
        alignItems: valign === 'top' ? 'flex-start' : 'flex-end',
        justifyContent:
          align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        overflow: clipOverflow ? 'hidden' : 'visible',
        flexShrink: 0,
        paddingLeft: paddingLeftPx,
        boxSizing: 'border-box',
      }}
    >
      <span
        ref={textRef}
        style={momochidoriStyle(wght, fit.wdth, {
          fontSize,
          lineHeight: `${cellHeight}px`,
          color,
          whiteSpace: 'nowrap',
          display: 'block',
          letterSpacing: fit.letterSpacing,
        })}
      >
        {text}
      </span>
    </div>
  );
}

type FitStackBlock =
  | HomeTutorialIntroPanelTune['welcome']
  | HomeTutorialIntroPanelTune['brand'];

function MomochidoriFitStack({
  lines,
  block,
  uiScale,
  color,
  align,
  paddingLeftPx = 0,
  clipOverflow = true,
  cellWidthRemOverride,
}: {
  lines: readonly string[];
  block: FitStackBlock;
  uiScale: number;
  color: string;
  align: 'left' | 'right' | 'center';
  paddingLeftPx?: number;
  clipOverflow?: boolean;
  cellWidthRemOverride?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${Math.round(block.gapPx * uiScale)}px`,
        marginLeft: align === 'right' ? 'auto' : undefined,
        marginRight: align === 'center' ? 'auto' : undefined,
        alignItems: align === 'center' ? 'center' : undefined,
        flexShrink: 0,
      }}
    >
      {lines.map((text, index) => {
        const lineTune: HomeTutorialIntroFitLineTune = block.lines?.[index] ?? {};
        const uncappedCellWidthRem =
          lineTune.cellWidthRem ?? cellWidthRemOverride ?? block.cellWidthRem;
        const cellWidthRem =
          cellWidthRemOverride != null
            ? Math.min(uncappedCellWidthRem, cellWidthRemOverride)
            : uncappedCellWidthRem;

        return (
          <MomochidoriFitCell
            key={`${text}-${index}`}
            text={text}
            cellWidth={remToPx(cellWidthRem, uiScale)}
            cellHeight={remToPx(lineTune.cellHeightRem ?? block.cellHeightRem, uiScale)}
            fontSize={rem(lineTune.fontSizeRem ?? block.fontSizeRem, uiScale)}
            wght={lineTune.wght ?? block.wght}
            color={color}
            align={align}
            valign={block.valign}
            wdthMin={block.wdthMin}
            wdthMax={block.wdthMax}
            autoFillWidth={block.autoFillWidth}
            fitMode={lineTune.fit ?? 'auto'}
            manualWdth={lineTune.wdth}
            manualLetterSpacing={lineTune.letterSpacing}
            paddingLeftPx={paddingLeftPx}
            clipOverflow={clipOverflow}
          />
        );
      })}
    </div>
  );
}

function CatchphraseBlock({
  lines,
  tune,
  displayScale,
  color,
  width,
  minHeight,
  flex,
}: {
  lines: readonly string[];
  tune: HomeTutorialIntroPanelTune['catchphrase'];
  displayScale: number;
  color: string;
  width?: string;
  minHeight?: string;
  flex?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: `${Math.round(tune.gapPx * displayScale)}px`,
        width: width ?? '100%',
        minHeight,
        flex: flex ?? '0 0 auto',
        minWidth: 0,
      }}
    >
      {lines.map((line) => (
        <p
          key={line}
          style={momochidoriStyle(tune.wght, tune.wdth, {
            margin: 0,
            fontSize: rem(tune.fontSizeRem, displayScale),
            lineHeight: tune.lineHeight,
            letterSpacing: tune.letterSpacing,
            color,
          })}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function BodyBlock({
  paragraphs,
  tune,
  displayScale,
  color,
  marginLeft,
  maxWidth,
  alignSelf,
  textAlign,
  paddingTopPx,
  width,
  fontScale = 1,
}: {
  paragraphs: readonly string[];
  tune: HomeTutorialIntroPanelTune['body'];
  displayScale: number;
  color: string;
  marginLeft: string;
  maxWidth: string;
  alignSelf?: 'stretch' | 'flex-end';
  textAlign?: 'left' | 'right';
  paddingTopPx?: number;
  width?: string;
  /** 本文フォントだけ追加拡縮（スマホレイアウト用） */
  fontScale?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${Math.round(tune.gapPx * displayScale)}px`,
        marginLeft,
        maxWidth,
        alignSelf,
        width,
        textAlign,
        paddingTop:
          paddingTopPx != null
            ? `${Math.round(paddingTopPx * displayScale)}px`
            : undefined,
        position: 'relative',
        zIndex: 1,
      }}
    >
      {paragraphs.map((paragraph) => (
        <p
          key={paragraph}
          style={momochidoriStyle(tune.wght, tune.wdth, {
            margin: 0,
            fontSize: rem(tune.fontSizeRem, displayScale * fontScale),
            lineHeight: tune.lineHeight,
            letterSpacing: tune.letterSpacing,
            color,
          })}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export function HomeTutorialIntroPanel({
  uiTheme,
  panel,
  content,
  visible,
  viewportWidth,
  tune = HOME_TUTORIAL_INTRO_PANEL_TUNE,
  welcomeColor,
  bodyAlignRight = false,
  step3MobilePinned = false,
  sphereScreenPoint = null,
}: HomeTutorialIntroPanelProps) {
  const uiScale = panel.width / INTRO_PANEL_BASE_WIDTH;
  const accent = uiTheme.accent;
  const decorColor = welcomeColor ?? accent;
  const bodyAccent = uiTheme.accentMuted;
  const responsive = getIntroPanelResponsiveLayout(viewportWidth, panel.width);
  const displayScale = uiScale * responsive.contentScale;
  const isNarrow = responsive.mode === 'narrow';
  const useStep3Mobile = step3MobilePinned && isNarrow;
  const bodyMarginLeft = bodyAlignRight || useStep3Mobile ? 'auto' : responsive.bodyMarginLeft;
  const bodyMaxWidth =
    bodyAlignRight || useStep3Mobile
      ? responsive.mode === 'narrow'
        ? '72%'
        : '53%'
      : responsive.bodyMaxWidth;
  const bodyTextAlign =
    bodyAlignRight || useStep3Mobile ? 'right' : responsive.bodyTextAlign;
  const bodyAlignSelf =
    bodyAlignRight || useStep3Mobile ? 'flex-end' : responsive.bodyAlignSelf;

  const catchphraseBoxWidthRem = capRemToPanelWidth(
    tune.catchphrase.boxWidthRem,
    responsive.catchphraseWidthRatio,
    displayScale,
    panel.width,
  );
  const welcomeCellWidthRem = capRemToPanelWidth(
    tune.welcome.cellWidthRem,
    responsive.welcomeWidthRatio,
    displayScale,
    panel.width,
  );
  const brandCellWidthRem = capRemToPanelWidth(
    tune.brand.cellWidthRem,
    responsive.brandWidthRatio,
    displayScale,
    panel.width,
  );
  const panelPaddingX = Math.max(
    12,
    Math.round(panel.paddingX * (isNarrow ? 0.85 : 1.1)),
  );
  const panelPaddingY = Math.round(panel.paddingY * (isNarrow ? 0.8 : 0.9));

  const catchphraseLines = content.catchphraseLines ?? [content.title, '', ''];
  const welcomeDecorLines = content.welcomeDecorLines ?? [
    'WELCOME',
    'TO THE',
    content.titleRuby || 'ぷるちか',
  ];
  const bodyParagraphs = content.bodyParagraphs ?? [content.body];
  const welcomeSiteName = content.welcomeSiteName ?? 'PLUTCHIKA';
  const welcomeSubline = content.welcomeSubline ?? '';
  const brandLines = welcomeSubline
    ? [welcomeSiteName, welcomeSubline]
    : [welcomeSiteName];
  const welcomePaddingLeftPx = remToPx(tune.welcome.paddingLeftRem, displayScale);

  return (
    <aside
      className="font-momochidori"
      style={{
        position: 'absolute',
        top: `${panel.y}px`,
        left: `${panel.x}px`,
        width: `${panel.width}px`,
        minHeight: `${panel.height}px`,
        zIndex: 2,
        padding: `${panelPaddingY}px ${panelPaddingX}px`,
        border: 'none',
        borderRadius: 0,
        backgroundColor: 'transparent',
        boxShadow: 'none',
        color: uiTheme.textPrimary,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: `opacity 320ms ease, ${UI_COLOR_TRANSITION}`,
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: INTRO_PANEL_LEFT_LINE_WIDTH,
          transform: 'translateX(-50%)',
          backgroundColor: uiTheme.accentBorder,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          height: isNarrow
            ? `${Math.max(panel.height - panelPaddingY * 2, 0)}px`
            : undefined,
          minHeight: isNarrow
            ? undefined
            : rem(tune.layout.rootMinHeightRem, displayScale),
        }}
      >
        {isNarrow ? (
          useStep3Mobile ? (
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                }}
              >
                <MomochidoriFitStack
                  lines={brandLines}
                  block={tune.brand}
                  uiScale={displayScale}
                  color={accent}
                  align="right"
                  cellWidthRemOverride={brandCellWidthRem}
                />
              </div>

              <div
                style={{
                  position: 'absolute',
                  left: sphereScreenPoint
                    ? `${sphereScreenPoint.x - panel.x - Math.round(14 * displayScale)}px`
                    : '48%',
                  top: sphereScreenPoint
                    ? `${sphereScreenPoint.y - panel.y + Math.round(300 * displayScale)}px`
                    : '86%',
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {welcomeDecorLines.map((line) => (
                  <p
                    key={line}
                    style={momochidoriStyle(tune.welcome.wght, 100, {
                      margin: 0,
                      fontSize: rem(
                        (tune.welcome.lines?.[0]?.fontSizeRem ?? tune.welcome.fontSizeRem) * 1.22,
                        displayScale,
                      ),
                      lineHeight: 1.25,
                      letterSpacing: '0.06em',
                      color: decorColor,
                      textAlign: 'center',
                    })}
                  >
                    {line}
                  </p>
                ))}
              </div>

              {bodyParagraphs.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: `${Math.round(52 * displayScale)}px`,
                    width: bodyMaxWidth,
                    maxWidth: '100%',
                  }}
                >
                  <BodyBlock
                    paragraphs={bodyParagraphs}
                    tune={tune.body}
                    displayScale={displayScale}
                    color={bodyAccent}
                    marginLeft="0"
                    maxWidth="100%"
                    alignSelf="stretch"
                    textAlign="right"
                    width="100%"
                    fontScale={1.2}
                  />
                </div>
              )}
            </div>
          ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              justifyContent: 'space-evenly',
            }}
          >
            <div style={{ alignSelf: 'flex-end' }}>
              <MomochidoriFitStack
                lines={brandLines}
                block={tune.brand}
                uiScale={displayScale}
                color={accent}
                align="right"
                cellWidthRemOverride={brandCellWidthRem}
              />
            </div>

            <CatchphraseBlock
              lines={catchphraseLines}
              tune={tune.catchphrase}
              displayScale={displayScale}
              color={uiTheme.textPrimary}
            />

            <BodyBlock
              paragraphs={bodyParagraphs}
              tune={tune.body}
              displayScale={displayScale}
              color={bodyAccent}
              marginLeft={bodyMarginLeft}
              maxWidth={bodyMaxWidth}
              alignSelf={bodyAlignSelf}
              textAlign={bodyTextAlign}
              width={bodyAlignSelf === 'flex-end' ? bodyMaxWidth : '100%'}
              fontScale={1.2}
            />

            <div style={{ alignSelf: 'flex-end' }}>
              <MomochidoriFitStack
                lines={welcomeDecorLines}
                block={tune.welcome}
                uiScale={displayScale}
                color={decorColor}
                align="right"
                clipOverflow={tune.welcome.clipOverflow}
                cellWidthRemOverride={welcomeCellWidthRem}
              />
            </div>
          </div>
          )
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: `${Math.round(tune.layout.headerRowGapPx * displayScale)}px`,
              }}
            >
              <CatchphraseBlock
                lines={catchphraseLines}
                tune={tune.catchphrase}
                displayScale={displayScale}
                color={uiTheme.textPrimary}
                width={rem(catchphraseBoxWidthRem, displayScale)}
                minHeight={rem(tune.catchphrase.boxMinHeightRem, displayScale)}
              />

              <MomochidoriFitStack
                lines={brandLines}
                block={tune.brand}
                uiScale={displayScale}
                color={accent}
                align="right"
                cellWidthRemOverride={brandCellWidthRem}
              />
            </div>

            <div
              style={{
                position: 'relative',
                marginTop: `${Math.round(responsive.lowerMarginTopPx * displayScale)}px`,
                minHeight: rem(tune.layout.lowerMinHeightRem, displayScale),
              }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: tune.layout.glowLeft,
                  top: tune.layout.glowTop,
                  width: tune.layout.glowWidth,
                  height: tune.layout.glowHeight,
                  background: `radial-gradient(ellipse at 20% 50%, ${decorColor}40 0%, transparent 72%)`,
                  filter: `blur(${Math.round(tune.layout.glowBlurPx * displayScale)}px)`,
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  left: rem(tune.welcome.leftRem, displayScale),
                  bottom: rem(tune.welcome.bottomRem, displayScale),
                }}
              >
                <MomochidoriFitStack
                  lines={welcomeDecorLines}
                  block={tune.welcome}
                  uiScale={displayScale}
                  color={decorColor}
                  align="left"
                  paddingLeftPx={welcomePaddingLeftPx}
                  clipOverflow={tune.welcome.clipOverflow}
                  cellWidthRemOverride={welcomeCellWidthRem}
                />
              </div>

              <BodyBlock
                paragraphs={bodyParagraphs}
                tune={tune.body}
                displayScale={displayScale}
                color={bodyAccent}
                marginLeft={bodyMarginLeft}
                maxWidth={bodyMaxWidth}
                textAlign={bodyTextAlign}
                paddingTopPx={tune.body.paddingTopPx}
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
