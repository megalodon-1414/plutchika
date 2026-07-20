import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import * as THREE from 'three';
import { PlutchikPetalWheel } from '../../../components/landing/PlutchikPetalWheel';
import type { BasicEmotionId } from '../../../data/emotions';
import { getCombinedEmotion } from '../../../data/plutchikDyadTable';
import type {
  BodyTextSegment,
  DualWheelPanelContent,
  PlanetPanelContent,
  SimplePanelContent,
  SplitGraphicPanelContent,
  WelcomePanelContent,
} from '../panelContent';
import { getRotationPerStep } from '../planetRotation';
import { HOME_INTRO_HORIZON_RATIO, homeIntroHorizonRatio } from '../sceneLayout';
import { MobilePetalWheelLauncher } from './MobilePetalWheelLauncher';

/** 角度を [-π, π] に正規化する */
function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let result = angle % twoPi;
  if (result > Math.PI) {
    result -= twoPi;
  } else if (result < -Math.PI) {
    result += twoPi;
  }
  return result;
}

const ROTATION_LERP_SPEED = 4;

const PLANET_BASE_COLOR = '#c3cbef';
const CRATER_COLOR = 'rgba(64, 68, 116, 0.4)';
const CRATER_COUNT = 46;

type PanelTextRole = 'hook' | 'heading' | 'subcopy' | 'body';

const PANEL_TEXT_ROLE_CLASS: Record<PanelTextRole, string> = {
  hook: 'home-intro-panel-text home-intro-panel-text--hook font-momochidori font-momochidori--medium',
  heading: 'home-intro-panel-text home-intro-panel-text--heading font-momochidori font-momochidori--bold',
  subcopy: 'home-intro-panel-text home-intro-panel-text--subcopy',
  body: 'home-intro-panel-text home-intro-panel-text--body',
};

function anchorTransformFor(anchorX: 'left' | 'right' | 'center'): string {
  if (anchorX === 'right') {
    return 'translateX(-100%)';
  }
  if (anchorX === 'center') {
    return 'translateX(-50%)';
  }
  return 'none';
}

/**
 * 百千鳥（Adobe Fonts）を効かせるため、パネル見出し類も troika Text ではなく Html で描画する。
 */
function PanelHtmlText({
  text,
  x,
  startY,
  maxWidth,
  fontSize,
  lineHeight = 1.35,
  color,
  letterSpacing,
  anchorX,
  textAlign,
  opacity,
  role,
  /** true のとき折り返さず、maxWidth いっぱいまでフォントを拡大／縮小する（スマホ見出し用） */
  fitToWidth = false,
  /** fitToWidth 後の実寸（高さは可変）。下要素の積み位置に使う。 */
  onSizeChange,
}: {
  text: string;
  x: number;
  startY: number;
  maxWidth: number;
  fontSize: number;
  lineHeight?: number;
  color: string;
  letterSpacing?: number | string;
  anchorX: 'left' | 'right' | 'center';
  textAlign: 'left' | 'right' | 'center';
  opacity: number;
  role: PanelTextRole;
  fitToWidth?: boolean;
  onSizeChange?: (size: { width: number; height: number; fontSize: number }) => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [fittedSize, setFittedSize] = useState(fontSize);
  const onSizeChangeRef = useRef(onSizeChange);
  onSizeChangeRef.current = onSizeChange;

  useLayoutEffect(() => {
    let cancelled = false;
    let raf = 0;
    let attempts = 0;

    const reportSize = (el: HTMLDivElement, nextFontSize: number) => {
      el.style.fontSize = `${nextFontSize}px`;
      el.style.width = `${maxWidth}px`;
      el.style.height = 'auto';
      el.style.whiteSpace = fitToWidth ? 'nowrap' : 'pre-wrap';
      onSizeChangeRef.current?.({
        width: maxWidth,
        height: el.offsetHeight,
        fontSize: nextFontSize,
      });
    };

    const measure = () => {
      if (cancelled) {
        return;
      }
      const el = measureRef.current;
      // Html はポータルで遅れてマウントされることがあるので、付くまで再試行する。
      if (!el || maxWidth <= 0) {
        if (attempts < 45) {
          attempts += 1;
          raf = requestAnimationFrame(measure);
        }
        return;
      }

      if (!fitToWidth) {
        setFittedSize(fontSize);
        reportSize(el, fontSize);
        return;
      }

      const probe = 100;
      el.style.fontSize = `${probe}px`;
      el.style.whiteSpace = 'nowrap';
      el.style.width = 'max-content';
      el.style.height = 'auto';
      el.style.transform = 'none';
      const measured = el.scrollWidth;
      if (measured <= 1) {
        if (attempts < 45) {
          attempts += 1;
          raf = requestAnimationFrame(measure);
        }
        return;
      }
      // 横幅いっぱいに拡大（わずかに余白）。下限を設けて 12px 固定に見えないようにする。
      // スマホは本文との差を抑えるため、幅いっぱいより少し控えめに。
      const filled = probe * (maxWidth / measured) * 0.88;
      const next = Math.max(20, Math.min(filled, maxWidth * 0.2));
      setFittedSize(next);
      reportSize(el, next);
    };

    measure();
    void document.fonts.ready.then(() => {
      if (!cancelled) {
        attempts = 0;
        measure();
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [fitToWidth, text, maxWidth, fontSize, letterSpacing, role, lineHeight]);

  const resolvedSize = fitToWidth ? fittedSize : fontSize;

  return (
    // transform={false}: オルソ＋大きな world 単位でも CSS スケールで潰さない
    <Html position={[x, startY, 0]} transform={false} style={{ pointerEvents: 'none' }}>
      <div
        ref={measureRef}
        className={PANEL_TEXT_ROLE_CLASS[role]}
        style={{
          transform: anchorTransformFor(anchorX),
          width: maxWidth,
          height: 'auto',
          fontSize: resolvedSize,
          lineHeight,
          color,
          textAlign,
          letterSpacing,
          opacity,
          transition: 'opacity 0.2s linear',
          wordBreak: fitToWidth ? 'normal' : 'break-word',
          whiteSpace: fitToWidth ? 'nowrap' : 'pre-wrap',
          overflow: 'visible',
        }}
      >
        {text}
      </div>
    </Html>
  );
}

/** クレーターは凹凸をモデリングせず、平らなテクスチャ画像として貼る。 */
function createPlanetTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = PLANET_BASE_COLOR;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = CRATER_COLOR;
  for (let i = 0; i < CRATER_COUNT; i += 1) {
    const x = (i * 97 + 31) % width;
    const y = 30 + ((i * 53 + 17) % (height - 60));
    const radius = 8 + ((i * 31) % 22);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface TextPanelProps {
  radius: number;
  angle: number;
  content: PlanetPanelContent | null;
  /** 「空」（頂点から画面上端まで）の幅・高さ。テキストはこの範囲内にだけ収める。 */
  skyWidth: number;
  skyHeight: number;
  /**
   * 惑星を下げたぶん、文字パネルをローカル＋Yへ持ち上げて画面上の文字位置を維持する。
   * デスクトップは 0。
   */
  textLiftY: number;
  /** 球と回転を共有する親グループへの参照。位置・向きはここから一切動かさず、表示の濃さだけをこの回転から導出する。 */
  rotatingGroupRef: RefObject<THREE.Group | null>;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
  /** 現在の共有ステップ番号。花びらグラフィックの選択リセット判定に使う（PanelLayoutProps参照）。 */
  stepIndex: number;
}

/** この角度差を超えたら完全に不可視（cos(diff) がこの値未満） */
const PANEL_FADE_COS_MIN = 0.05;
/** この角度差以内なら完全に不透明（cos(diff) がこの値以上） */
const PANEL_FADE_COS_MAX = 0.7;

/**
 * フック・見出しのY位置（skyHeightに対する割合）。本文に近づけつつ、
 * 必須ルート・深掘りルートの全レイアウトで高さを揃えるため、共通の定数として持つ。
 */
const PANEL_HOOK_Y = 0.84;
const PANEL_HEADING_Y = 0.74;

/** 花びらグラフィック（必須ルート・深掘りルート共通）を画面内側へ寄せる量（px）。 */
const PETAL_GRAPHIC_INWARD_SHIFT_PX = 32;

/**
 * skyHeightに対するこの割合のY位置が、ちょうどキャンバス（画面）の上下中央になる。
 * オルソグラフィックカメラはワールドY=0を画面の上下中央に投影する。頂点（dy=0）のワールドYは
 * size.height*(0.5 - HOME_INTRO_HORIZON_RATIO)、skyHeightはsize.height*HOME_INTRO_HORIZON_RATIOなので、
 * 「ワールドY=0になるdy」をskyHeightで割った割合は 1 - 0.5/HOME_INTRO_HORIZON_RATIO で求まる
 * （HOME_INTRO_HORIZON_RATIOが変わっても追従する）。
 */
const SCREEN_VERTICAL_CENTER_FRACTION = 1 - 0.5 / HOME_INTRO_HORIZON_RATIO;

/**
 * 必須ルート画面右端固定のNavigationIndicator（home-intro.css .nav-indicator）のジオメトリ。
 * 本文の右端がこのインジケーターと一定の隙間を保つよう、fraction指定ではなくpx単位で正確に逆算する
 * （skyWidthの割合だけで位置決めすると、インジケーター自体は画面幅に応じてスケールしないpx固定サイズなので、
 * 画面幅が変わるたびに隙間が一定にならないため）。NavigationIndicator自身は640px未満で非表示になるので、
 * この計算も同じ幅未満では適用しない。
 */
const NAV_INDICATOR_RIGHT_OFFSET_PX = 24; // .nav-indicator の right
const NAV_INDICATOR_WIDTH_PX = 182; // .nav-indicator の width（1.3倍後）
const NAV_INDICATOR_NARROW_BREAKPOINT_PX = 640; // .nav-indicator が非表示になる境界と同じ
/** 本文とインジケーターの間に空ける隙間（px）。 */
const NAV_INDICATOR_TEXT_GAP_PX = 24;
/** スマホ時のパネル文字サイズ（フック・見出し・本文とも固定） */
const MOBILE_PANEL_FONT_PX = 12;

/** デスクトップは skyHeight 比率、スマホ（幅640以下）は 12px 固定。 */
function panelFontPx(skyWidth: number, skyHeight: number, ratio: number): number {
  if (skyWidth <= NAV_INDICATOR_NARROW_BREAKPOINT_PX) {
    return MOBILE_PANEL_FONT_PX;
  }
  return skyHeight * ratio;
}

interface PanelLayoutProps {
  skyWidth: number;
  skyHeight: number;
  opacity: number;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
  /**
   * 現在の共有ステップ番号。花びらグラフィックの選択状態は、この値が変わるたび
   * （進む方向・戻る方向どちらでも）リセットする（PlutchikPetalWheelをkeyで強制再マウントする）。
   */
  stepIndex: number;
}

interface LinkedBodyTextProps {
  segments: BodyTextSegment[];
  x: number;
  startY: number;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  color: string;
  linkColor: string;
  anchorX: 'left' | 'right' | 'center';
  textAlign: 'left' | 'right' | 'center';
  opacity: number;
  onNavigate?: (path: string) => void;
  /** 本文の直後・同じブロック内に置く要素（スマホ花びらアイコンなど） */
  afterBody?: ReactNode;
}

/**
 * 本文の断片配列を、文中にリンク語が自然に組み込まれた見た目で描画する。
 *
 * troika-three-text（<Text>）は1メッシュ＝1スタイルで、HTMLの<a>のように文中の一部だけを
 * 別スタイル＋クリック可能にすることができない。そこで本文だけは通常のHTML（<Html>、
 * 花びらグラフィックと同じ非transformモード）で描画し、実際の<a>タグを使うことで、
 * ブラウザ標準の折り返し・インライン配置にリンク語をそのまま任せる。
 *
 * Html（非transformモード）はワールド座標をスクリーン座標へ投影するだけで、
 * 追加のスケーリングは行わない。このシーンはオルソグラフィックカメラを世界単位＝
 * CSSピクセルになるよう設定しているため、fontSize/maxWidth等の数値をそのままpxとして使える
 * （花びらグラフィックのHtml配置と同じ前提）。
 */
function LinkedBodyText({
  segments,
  x,
  startY,
  maxWidth,
  fontSize,
  lineHeight,
  color,
  linkColor,
  anchorX,
  textAlign,
  opacity,
  onNavigate,
  afterBody,
}: LinkedBodyTextProps) {
  return (
    <Html position={[x, startY, 0]} transform={false} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          transform: anchorTransformFor(anchorX),
          width: maxWidth,
          opacity,
          transition: 'opacity 0.2s linear',
        }}
      >
        <div
          className={PANEL_TEXT_ROLE_CLASS.body}
          style={{
            width: '100%',
            fontSize,
            lineHeight,
            color,
            textAlign,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {segments.map((segment, index) =>
            segment.linkTo ? (
              <a
                key={index}
                href={segment.linkTo}
                className="home-intro-body-link"
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate?.(segment.linkTo as string);
                }}
              >
                <span className="home-intro-body-link__arrow" aria-hidden />
                <span
                  className="home-intro-body-link__label"
                  style={{ color: linkColor }}
                >
                  {segment.text}
                </span>
              </a>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </div>
        <div className="home-intro-body-footer">
          <span className="home-intro-body-scroll-hint" aria-hidden />
          {afterBody ? (
            <div className="home-intro-body-footer__trailing">{afterBody}</div>
          ) : null}
        </div>
      </div>
    </Html>
  );
}

/** ようこそパネル用。フック・見出し・サブコピーは左揃え、本文は右揃え。 */
function WelcomePanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
  onNavigate,
}: PanelLayoutProps & { content: WelcomePanelContent }) {
  const leftX = -skyWidth * 0.42;
  const leftWidth = skyWidth * 0.5;
  const isMobile = skyWidth <= NAV_INDICATOR_NARROW_BREAKPOINT_PX;
  const bodyFontSize = panelFontPx(skyWidth, skyHeight, 0.029);
  // 本文は左揃え。末尾の孤立行を防ぐため折り返し幅を文字数ぶん広げ、
  // 右端のNavigationIndicatorと重ならないよう最大幅も抑える。
  const bodyMaxRight =
    skyWidth >= NAV_INDICATOR_NARROW_BREAKPOINT_PX
      ? skyWidth / 2 - (NAV_INDICATOR_RIGHT_OFFSET_PX + NAV_INDICATOR_WIDTH_PX + NAV_INDICATOR_TEXT_GAP_PX)
      : skyWidth * 0.42;
  const bodyWidth = Math.min(skyWidth * 0.72 + bodyFontSize * 4, bodyMaxRight - leftX);
  // デスクトップは見出しを広めに。スマホは本文と同じ幅に揃え、fitToWidth で拡大する。
  const headingWidth = isMobile ? bodyWidth : skyWidth * 0.7;
  const headingY = skyHeight * PANEL_HEADING_Y;
  const [headingHeight, setHeadingHeight] = useState(0);
  const stackGap = 12;
  /** 見出しと「ぷるちか」の字間（かなり狭く） */
  const headingSubcopyGap = 2;
  const subcopyFontSize = panelFontPx(skyWidth, skyHeight, 0.024);
  const subcopyBlock = subcopyFontSize * 1.5;
  const desktopHeadingBlock = skyHeight * 0.068 * 1.22;
  // 見出し直下に「ぷるちか」を密着。スマホは実測高さ、PCは見出し見積もり高さで詰める。
  const subcopyY =
    isMobile && headingHeight > 0
      ? headingY - headingHeight - headingSubcopyGap
      : headingY - desktopHeadingBlock - headingSubcopyGap;
  const bodyY =
    isMobile && headingHeight > 0
      ? content.subcopy
        ? subcopyY - subcopyBlock - stackGap
        : headingY - headingHeight - stackGap
      : skyHeight * (content.subcopy ? 0.56 : 0.58);
  return (
    <>
      <PanelHtmlText
        text={content.hook}
        x={leftX}
        startY={skyHeight * PANEL_HOOK_Y}
        maxWidth={leftWidth}
        fontSize={panelFontPx(skyWidth, skyHeight, 0.028)}
        lineHeight={1.45}
        color="#9f8aaa"
        letterSpacing="0.08em"
        anchorX="left"
        textAlign="left"
        opacity={opacity}
        role="hook"
      />
      <PanelHtmlText
        text={content.heading}
        x={leftX}
        startY={headingY}
        maxWidth={headingWidth}
        fontSize={panelFontPx(skyWidth, skyHeight, 0.068)}
        lineHeight={1.22}
        color="#f4ecf7"
        letterSpacing="0.02em"
        anchorX="left"
        textAlign="left"
        opacity={opacity}
        role="heading"
        fitToWidth={isMobile}
        onSizeChange={(size) => {
          if (isMobile) {
            setHeadingHeight(size.height);
          }
        }}
      />
      {content.subcopy ? (
        <PanelHtmlText
          text={content.subcopy}
          x={leftX}
          startY={subcopyY}
          maxWidth={leftWidth}
          fontSize={subcopyFontSize}
          lineHeight={1.2}
          color="#ffffff"
          letterSpacing="0.04em"
          anchorX="left"
          textAlign="left"
          opacity={opacity}
          role="subcopy"
        />
      ) : null}
      <LinkedBodyText
        segments={content.body}
        x={leftX}
        startY={bodyY}
        maxWidth={bodyWidth}
        fontSize={bodyFontSize}
        lineHeight={1.75}
        color="#d8cfe0"
        linkColor="#c39bd3"
        anchorX="left"
        textAlign="left"
        opacity={opacity}
        onNavigate={onNavigate}
      />
    </>
  );
}

const PETAL_WHEEL_HTML_SIZE = 360;

/** プルチック環パネル用。テキストを左、花びらグラフィックを右に配置する左右分割レイアウト。 */
function SplitGraphicPanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
  onNavigate,
  stepIndex,
}: PanelLayoutProps & { content: SplitGraphicPanelContent }) {
  // 左マージンはようこそパネル（WelcomePanelLayout）と揃える。
  const leftX = -skyWidth * 0.42;
  const isMobile = skyWidth <= NAV_INDICATOR_NARROW_BREAKPOINT_PX;
  const bodyFontSize = panelFontPx(skyWidth, skyHeight, 0.029);
  // スマホは花びらを本文ブロック内に移すため、ようこそパネルと同じく横幅を広く取る。
  const bodyMaxRight =
    skyWidth >= NAV_INDICATOR_NARROW_BREAKPOINT_PX
      ? skyWidth / 2 - (NAV_INDICATOR_RIGHT_OFFSET_PX + NAV_INDICATOR_WIDTH_PX + NAV_INDICATOR_TEXT_GAP_PX)
      : skyWidth * 0.42;
  const textWidth = isMobile
    ? Math.min(skyWidth * 0.72 + bodyFontSize * 4, bodyMaxRight - leftX)
    : skyWidth * 0.42;
  const headingY = skyHeight * PANEL_HEADING_Y;
  const [headingHeight, setHeadingHeight] = useState(0);
  const bodyY =
    isMobile && headingHeight > 0
      ? headingY - headingHeight - 12
      : skyHeight * 0.6;
  const petalGraphicX = skyWidth * 0.24 - PETAL_GRAPHIC_INWARD_SHIFT_PX;
  const petalGraphicY = skyHeight * SCREEN_VERTICAL_CENTER_FRACTION;
  return (
    <>
      <PanelHtmlText
        text={content.hook}
        x={leftX}
        startY={skyHeight * PANEL_HOOK_Y}
        maxWidth={textWidth}
        fontSize={panelFontPx(skyWidth, skyHeight, 0.028)}
        lineHeight={1.45}
        color="#9f8aaa"
        letterSpacing="0.08em"
        anchorX="left"
        textAlign="left"
        opacity={opacity}
        role="hook"
      />
      <PanelHtmlText
        text={content.heading}
        x={leftX}
        startY={headingY}
        maxWidth={textWidth}
        fontSize={panelFontPx(skyWidth, skyHeight, 0.068)}
        lineHeight={1.22}
        color="#f4ecf7"
        letterSpacing="0.02em"
        anchorX="left"
        textAlign="left"
        opacity={opacity}
        role="heading"
        fitToWidth={isMobile}
        onSizeChange={(size) => {
          if (isMobile) {
            setHeadingHeight(size.height);
          }
        }}
      />
      <LinkedBodyText
        segments={content.body}
        x={leftX}
        startY={bodyY}
        maxWidth={textWidth}
        fontSize={bodyFontSize}
        lineHeight={1.75}
        color="#d8cfe0"
        linkColor="#c39bd3"
        anchorX="left"
        textAlign="left"
        opacity={opacity}
        onNavigate={onNavigate}
        afterBody={
          isMobile ? (
            <MobilePetalWheelLauncher opacity={opacity} stepIndex={stepIndex} />
          ) : null
        }
      />
      {/*
        花びらグラフィック：右半分。花びらをクリックするとその感情語を表示する（PlutchikPetalWheel参照）。
        Html の transform モードは、このシーンのオルソグラフィックカメラ・大きな world 単位（≒px換算）の
        組み合わせでは自動計算されるCSSスケールが極端に小さくなってしまう（実測で0.025倍＝9pxほどに縮小）ため、
        通常のスクリーン投影モード（screen-space billboard）を使う。表示・非表示はテキストと同じ opacity で揃える。
        クリックを花びらまで届かせるため pointerEvents は 'auto'（ホイールイベントの伝播はヒットテストと無関係のため、
        スクロールジェスチャーには影響しない）。
        スマホではインライン選択を切り離し、本文ブロック内のアイコンからオーバーレイ展開する。
      */}
      {!isMobile && (
        <Html
          center
          position={[petalGraphicX, petalGraphicY, 0]}
          style={{ pointerEvents: 'auto' }}
        >
          <div style={{ opacity, transition: 'opacity 0.2s linear', pointerEvents: opacity > 0.5 ? 'auto' : 'none' }}>
            {/*
              PlutchikPetalWheel は既定で maxWidth:100% を付ける。Html のラッパーdivは
              transformのみで明示的な width を持たないため、100%の基準が定まらず幅が0に
              つぶれてしまう。ここでは固定pxで表示したいので maxWidth を打ち消す。
            */}
            {/* key={stepIndex}：パネルをスクロールして移動したら（進む・戻る方向とも）選択状態をリセットする */}
            <PlutchikPetalWheel key={stepIndex} size={PETAL_WHEEL_HTML_SIZE} style={{ maxWidth: 'none' }} />
          </div>
        </Html>
      )}
    </>
  );
}

/**
 * 深掘りルート用。必須ルート02（ようこそパネル＝WelcomePanelLayout）と同じ左右分割レイアウト。
 * フック・見出しは片側、本文はもう片側。content.mirrored が true なら左右を入れ替える
 * （隣り合うパネル同士で交互に配置するため。深掘りは本文がリンクを含まない単純な文字列なので
 * LinkedBodyText で描画する）。
 */
function SimplePanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
}: PanelLayoutProps & { content: SimplePanelContent }) {
  const mirrored = Boolean(content.mirrored);
  const leftSideX = -skyWidth * 0.42;
  // 右側は画面右端固定の現在地インジケーター（NavigationIndicator）と重ならないよう、
  // 左側より内側に寄せる（深掘りの見出しラベルは「段階的感情探索」等、ようこそ画面より長くなりうるため）。
  const rightSideX = skyWidth * 0.34;
  const headingX = mirrored ? rightSideX : leftSideX;
  const headingAnchorX: 'left' | 'right' = mirrored ? 'right' : 'left';
  const isMobile = skyWidth <= NAV_INDICATOR_NARROW_BREAKPOINT_PX;

  const bodyFontSize = panelFontPx(skyWidth, skyHeight, 0.029);
  // WelcomePanelLayoutと同様、末尾の孤立行を防ぐため文字数8つ分ほど幅を広げてある。
  const bodyWidth = skyWidth * 0.48 + bodyFontSize * 8;
  // スマホは見出し幅を本文と同じにする。
  const headingWidth = isMobile ? bodyWidth : skyWidth * 0.5;
  // 本文はフック・見出しと同じ基準位置・同じ揃え方向にする（左右どちらの配置でも1つのカラムとして揃える）。
  const bodyAnchorX: 'left' | 'right' = headingAnchorX;
  const bodyX = headingX;
  const headingY = skyHeight * PANEL_HEADING_Y;
  const [headingHeight, setHeadingHeight] = useState(0);
  const bodyY =
    isMobile && headingHeight > 0
      ? headingY - headingHeight - 12
      : skyHeight * 0.52;

  return (
    <>
      <PanelHtmlText
        text={content.hook}
        x={headingX}
        startY={skyHeight * PANEL_HOOK_Y}
        maxWidth={headingWidth}
        fontSize={panelFontPx(skyWidth, skyHeight, 0.028)}
        lineHeight={1.45}
        color="#9f8aaa"
        letterSpacing="0.08em"
        anchorX={headingAnchorX}
        textAlign={headingAnchorX}
        opacity={opacity}
        role="hook"
      />
      <PanelHtmlText
        text={content.heading}
        x={headingX}
        startY={headingY}
        maxWidth={headingWidth}
        fontSize={panelFontPx(skyWidth, skyHeight, 0.068)}
        lineHeight={1.22}
        color="#f4ecf7"
        letterSpacing="0.02em"
        anchorX={headingAnchorX}
        textAlign={headingAnchorX}
        opacity={opacity}
        role="heading"
        fitToWidth={isMobile}
        onSizeChange={(size) => {
          if (isMobile) {
            setHeadingHeight(size.height);
          }
        }}
      />
      {/*
        本文は必須ルート（WelcomePanelLayout等）のLinkedBodyTextと全く同じコンポーネント・スタイルで描画する。
        百千鳥は Adobe Fonts（CSS）経由のため、見出しも含め Html 経路に統一している。
        深掘りの本文にリンクは無いので、リンクなしの単一セグメントとして渡す。
      */}
      <LinkedBodyText
        segments={[{ text: content.body }]}
        x={bodyX}
        startY={bodyY}
        maxWidth={bodyWidth}
        fontSize={bodyFontSize}
        lineHeight={1.75}
        color="#d8cfe0"
        linkColor="#d8cfe0"
        anchorX={bodyAnchorX}
        textAlign={bodyAnchorX}
        opacity={opacity}
      />
    </>
  );
}

/** 花2輪を横に並べたサイズ（px）。通常幅／狭い画面（NavigationIndicatorと同じ640px基準）で切り替える。 */
const DUAL_WHEEL_SIZE = 240;
const DUAL_WHEEL_SIZE_NARROW = 110;
const DUAL_WHEEL_GAP = 16;
const DUAL_WHEEL_NARROW_BREAKPOINT_PX = 640;

/**
 * 深掘りルートpanel-3専用。見出し・本文を片側、8感情の花を2輪（横並び）＋組み合わせ感情名を
 * もう片側に配置する。狭い画面ではテキストを上・花2輪を下に積む縦並びに切り替える
 * （plutchika-panel3-32emotions-instructions.md 準拠）。
 *
 * 2輪はそれぞれ独立に1枚ずつ花びらを選択できる（同じ花びらを再クリックで選択解除）。
 * 両方選択されると、円環距離に応じた組み合わせ感情（同じ感情ならピュア感情、対極なら
 * メッセージ）を2輪の下・中央にフェードイン表示する。
 *
 * 呼び出し側（TextPanel）がkey={stepIndex}を渡してこのコンポーネントごと強制再マウントする。
 * パネルをスクロールして移動したら（進む・戻る方向とも）選択状態・組み合わせ結果を丸ごとリセットするため。
 */
function DualWheelPanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
}: PanelLayoutProps & { content: DualWheelPanelContent }) {
  const [selectedLeft, setSelectedLeft] = useState<BasicEmotionId | null>(null);
  const [selectedRight, setSelectedRight] = useState<BasicEmotionId | null>(null);
  const combined = selectedLeft && selectedRight ? getCombinedEmotion(selectedLeft, selectedRight) : null;

  const isNarrow = skyWidth < DUAL_WHEEL_NARROW_BREAKPOINT_PX;
  const wheelSize = isNarrow ? DUAL_WHEEL_SIZE_NARROW : DUAL_WHEEL_SIZE;

  // 左位置は深掘り「感情ラベリング」パネル（SimplePanelLayoutのleftSideX = -skyWidth*0.42）に揃える。
  // 右へ寄る分、花びらグラフィックとの間隔を保つため本文の折り返し幅は少し狭める。
  const textX = isNarrow ? 0 : -skyWidth * 0.42;
  const textWidth = isNarrow ? skyWidth * 0.94 : skyWidth * 0.38;
  const textAnchorX: 'left' | 'center' = isNarrow ? 'center' : 'left';

  // 狭い画面では本文が長く（プレースホルダーの仮テキストが特に長い）折り返し行数がかさむため、
  // 小さめ・幅広にして行数を抑える。花2輪はさらに下（地平線に立つ人物と重ならない最小限の位置）へ寄せる。
  const bodyFontSize = panelFontPx(
    skyWidth,
    skyHeight,
    isNarrow ? 0.021 : 0.029,
  );
  // 花2輪＋組み合わせ感情名のグラフィック全体を、さらに左へ48px寄せる。
  const graphicsX = (isNarrow ? 0 : skyWidth * 0.24 - PETAL_GRAPHIC_INWARD_SHIFT_PX) - 48;
  const graphicsY = isNarrow ? skyHeight * 0.14 : skyHeight * SCREEN_VERTICAL_CENTER_FRACTION;
  const headingY = skyHeight * PANEL_HEADING_Y;
  const [headingHeight, setHeadingHeight] = useState(0);
  const bodyY =
    isNarrow && headingHeight > 0
      ? headingY - headingHeight - 12
      : skyHeight * 0.6;

  return (
    <>
      <PanelHtmlText
        text={content.hook}
        x={textX}
        startY={skyHeight * PANEL_HOOK_Y}
        maxWidth={textWidth}
        fontSize={panelFontPx(skyWidth, skyHeight, 0.028)}
        lineHeight={1.45}
        color="#9f8aaa"
        letterSpacing="0.08em"
        anchorX={textAnchorX}
        textAlign={textAnchorX}
        opacity={opacity}
        role="hook"
      />
      <PanelHtmlText
        text={content.heading}
        x={textX}
        startY={headingY}
        maxWidth={textWidth}
        fontSize={panelFontPx(skyWidth, skyHeight, 0.068)}
        lineHeight={1.22}
        color="#f4ecf7"
        letterSpacing="0.02em"
        anchorX={textAnchorX}
        textAlign={textAnchorX}
        opacity={opacity}
        role="heading"
        fitToWidth={isNarrow}
        onSizeChange={(size) => {
          if (isNarrow) {
            setHeadingHeight(size.height);
          }
        }}
      />
      <LinkedBodyText
        segments={[{ text: content.body }]}
        x={textX}
        startY={bodyY}
        maxWidth={textWidth}
        fontSize={bodyFontSize}
        lineHeight={1.75}
        color="#d8cfe0"
        linkColor="#d8cfe0"
        anchorX={textAnchorX}
        textAlign={textAnchorX}
        opacity={opacity}
      />
      {/*
        花2輪＋組み合わせ感情名は必須ルートの花びらグラフィックと同じ非transform Htmlモードで描画する
        （オルソグラフィックカメラ・大きな world 単位の組み合わせでは transform モードのCSSスケールが
        極端に小さくなるため）。クリックを花びらまで届かせるため pointerEvents は 'auto'。
      */}
      <Html center position={[graphicsX, graphicsY, 0]} style={{ pointerEvents: 'auto' }}>
        <div
          style={{
            opacity,
            transition: 'opacity 0.2s linear',
            pointerEvents: opacity > 0.5 ? 'auto' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.6em',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: DUAL_WHEEL_GAP }}>
            <PlutchikPetalWheel size={wheelSize} style={{ maxWidth: 'none' }} onSelectionChange={setSelectedLeft} />
            <PlutchikPetalWheel size={wheelSize} style={{ maxWidth: 'none' }} onSelectionChange={setSelectedRight} />
          </div>
          <div
            key={combined?.name ?? 'none'}
            className={`dual-wheel-badge${combined ? ' dual-wheel-badge--active' : ''}`}
            style={{
              fontSize: '2.05em',
              backgroundColor: combined?.color ?? 'transparent',
              opacity: combined ? 1 : 0,
              ...(combined ? ({ '--dual-wheel-glow-color': combined.color } as CSSProperties) : {}),
            }}
          >
            {combined?.name ?? ' '}
          </div>
        </div>
      </Html>
    </>
  );
}

/**
 * 球の表面（回転軸に沿った円周上）に貼り付ける平らな板。
 * ローカル位置 (0, R cosβ, -R sinβ) ・ローカル回転 -β で固定しておくと、
 * 親グループの共有回転が θ=β になった瞬間だけワールド位置が頂点 (0,R,0) に、
 * 法線がカメラ方向 (0,0,1) にそろう（three.js の行列で数値検証済み）。
 *
 * 板自身のローカル回転（-β）も、共有回転（θ）も、どちらもX軸まわりだけの回転（同一軸の合成）。
 * X軸回転だけをどれだけ組み合わせても、板の「上方向」がその軸のまわりでねじれる（ロールする）ことは
 * 原理上起こらない。実際 θ=β の瞬間、板の up ベクトルは常に (0,1,0)＝画面の真上に一致する
 * （three.js の行列で数値検証済み）。つまり左上・右上の角は必ず水平にそろう。
 *
 * 板の位置・向きはここから一切動かさない。表示の濃さ（opacity）だけを
 * 「現在の共有回転角と、この板固有の角度との差」から毎フレーム導出し、
 * 頂点付近だけなめらかに読める状態になるようにする（板自体を個別にアニメーションさせるものではない）。
 */
function TextPanel({
  radius,
  angle,
  content,
  skyWidth,
  skyHeight,
  textLiftY,
  rotatingGroupRef,
  onNavigate,
  stepIndex,
}: TextPanelProps) {
  const [opacity, setOpacity] = useState(0);
  const position: [number, number, number] = [
    0,
    radius * 1.02 * Math.cos(angle),
    -radius * 1.02 * Math.sin(angle),
  ];

  useFrame(() => {
    const group = rotatingGroupRef.current;
    if (!group) {
      return;
    }
    const diff = normalizeAngle(group.rotation.x - angle);
    const cosDiff = Math.cos(diff);
    const next = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cosDiff, PANEL_FADE_COS_MIN, PANEL_FADE_COS_MAX, 0, 1),
      0,
      1,
    );
    setOpacity((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
  });

  if (opacity <= 0.01 || !content) {
    return null;
  }

  // 背景は完全に透明。板という物体を見せるのではなく、球の回転で景色が変わることで
  // その位置にテキストだけが浮かび上がって見えるようにする。
  //
  // 取り付け点（この group の原点、dy=0）は頂点＝地面との境界にあたる。
  // ここから「上方向にだけ」コンテンツを配置し、地面側（dy<0）には絶対にはみ出させない
  // （dy<0 側は球の中心からの距離が半径を下回り、不透明な球面の裏に隠れてしまうため）。
  // 逆に上方向（dy>0）は skyHeight（＝画面上端）を超えないよう、各要素をそこへ収める。
  return (
    <group position={position} rotation={[-angle, 0, 0]}>
      <group position={[0, textLiftY, 1]}>
        {content.layout === 'welcome' && (
          <WelcomePanelLayout
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            opacity={opacity}
            onNavigate={onNavigate}
            stepIndex={stepIndex}
          />
        )}
        {content.layout === 'split-graphic' && (
          <SplitGraphicPanelLayout
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            opacity={opacity}
            onNavigate={onNavigate}
            stepIndex={stepIndex}
          />
        )}
        {content.layout === 'simple' && (
          <SimplePanelLayout
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            opacity={opacity}
            stepIndex={stepIndex}
          />
        )}
        {content.layout === 'dual-wheel' && (
          <DualWheelPanelLayout
            key={stepIndex}
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            opacity={opacity}
            stepIndex={stepIndex}
          />
        )}
      </group>
    </group>
  );
}

interface PlanetMeshProps {
  stepIndex: number;
  panelContents: (PlanetPanelContent | null)[];
  /**
   * true の場合、マウント時に「現在の stepIndex の位置」へ直接スナップする（アニメーションさせない）。
   * 深掘りページのような直接リンクでの初期表示（＝いきなり特定パネルへ着地したい場合）向け。
   * 省略時は false（従来通り、赤道位置からアニメーションして見せる。1枚目のパネルに入る瞬間の
   * 「回転が実際に見える」体験を保つため、home-introのデフォルト挙動はこちら）。
   */
  snapToInitialStep?: boolean;
  /** 球の現在の回転角（ラジアン）を毎フレーム通知する。 */
  onRotationChange?: (rotationX: number) => void;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
}

function PlanetMesh({
  stepIndex,
  panelContents,
  snapToInitialStep = false,
  onRotationChange,
  onNavigate,
}: PlanetMeshProps) {
  const rotatingRef = useRef<THREE.Group>(null);
  const panelCount = panelContents.length;
  const panelAngleStep = getRotationPerStep(panelCount);
  /**
   * 画面に見えている頂点（人物の足元）は、SphereGeometryの既定UVでは「極」にあたり、経線が1点に収束して歪む。
   * 固定のX軸オフセット（＝ちょうどパネル1枚ぶんの角度）で、開始姿勢の見える頂点を歪みの少ない
   * 「赤道」付近にずらす。パネル間隔と揃えることで、あるステップが読める位置に運ぶパネル番号が
   * 常に (stepIndex + 1) % panelCount になる（three.js の行列で数値検証済み、panelCountによらず成立）。
   */
  const baseTilt = panelAngleStep;
  const targetRotationX = useRef(baseTilt + stepIndex * panelAngleStep);
  const { size } = useThree();
  const texture = useMemo(() => createPlanetTexture(), []);

  const radius = Math.min(size.width * 0.62, 900);
  // 惑星・足元はスマホで少し下げる。文字パネルはデスクトップと同じ空の高さ基準＋リフトで位置を維持する。
  const visualHorizon = homeIntroHorizonRatio(size.width);
  const apexY = size.height / 2 - visualHorizon * size.height;
  const centerY = apexY - radius;
  const skyWidth = size.width;
  const skyHeight = HOME_INTRO_HORIZON_RATIO * size.height;
  const textLiftY = (visualHorizon - HOME_INTRO_HORIZON_RATIO) * size.height;

  // マウント直後の初期姿勢。既定は「歪みのない赤道位置」に即座にスナップし、そこから現在ステップ
  // ぶんだけアニメーションさせる（rotation.x=0=極からアニメすると歪みが一瞬見えるが、赤道からなら
  // 歪まず、かつ初回表示でも回転が目に見える）。snapToInitialStep が true のときは、直接リンクでの
  // 着地を想定し、現在の stepIndex の位置へそのままスナップする（アニメーションさせない）。
  useLayoutEffect(() => {
    if (rotatingRef.current) {
      rotatingRef.current.rotation.x = snapToInitialStep ? targetRotationX.current : baseTilt;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時の初期姿勢決定のみに使う
  }, []);

  useEffect(() => {
    targetRotationX.current = baseTilt + stepIndex * panelAngleStep;
  }, [stepIndex, baseTilt, panelAngleStep]);

  useFrame((_, delta) => {
    const group = rotatingRef.current;
    if (!group) {
      return;
    }
    const t = 1 - Math.exp(-ROTATION_LERP_SPEED * delta);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetRotationX.current, t);
    onRotationChange?.(group.rotation.x);
  });

  return (
    <group position={[0, centerY, 0]}>
      {/* 球本体とテキストパネルを同じ group にぶら下げ、同じ回転を共有させる（＝板は球にくっついたまま運ばれる） */}
      <group ref={rotatingRef}>
        <mesh>
          <sphereGeometry args={[radius, 48, 48]} />
          <meshToonMaterial map={texture} />
        </mesh>
        {panelContents.map((content, index) => (
          <TextPanel
            key={index}
            radius={radius}
            angle={index * panelAngleStep}
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            textLiftY={textLiftY}
            rotatingGroupRef={rotatingRef}
            onNavigate={onNavigate}
            stepIndex={stepIndex}
          />
        ))}
      </group>
    </group>
  );
}

interface PlanetGlobeProps {
  stepIndex: number;
  panelContents: (PlanetPanelContent | null)[];
  snapToInitialStep?: boolean;
  /** 球の現在の回転角（ラジアン）を毎フレーム通知する。 */
  onRotationChange?: (rotationX: number) => void;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
}

/** 惑星部分のみ Three.js の SphereGeometry で実装した本物の3D球体。凹凸はテクスチャで表現し、フラットなイラスト調のトゥーンマテリアルで陰影を抑える。 */
export function PlanetGlobe({
  stepIndex,
  panelContents,
  snapToInitialStep,
  onRotationChange,
  onNavigate,
}: PlanetGlobeProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 2000], near: 1, far: 10000, zoom: 1 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[0.4, 1, 1]} intensity={1} />
      <PlanetMesh
        stepIndex={stepIndex}
        panelContents={panelContents}
        snapToInitialStep={snapToInitialStep}
        onRotationChange={onRotationChange}
        onNavigate={onNavigate}
      />
    </Canvas>
  );
}
