import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { getBasicEmotion, getEmotionById, isBasicEmotionId } from '../../data/emotions';
import { ROUTES } from '../../routes/paths';
import type { UserPlotRow } from '../../types/userPlot';
import type { EmotionUiTheme } from '../../utils/emotionUiTheme';
import { getEmotionWordSlug } from '../../utils/emotionWordSlug';
import { wordTypeLabel } from '../../utils/emotionWordsBridge';
import { OctahedronIcon } from './OctahedronIcon';
import { PlanetSphere, wordPlanetRadius } from './PlanetSphere';
import { RocketModel } from './RocketModel';

interface WordLandingExperienceProps {
  plot: UserPlotRow;
  uiTheme: EmotionUiTheme;
}

type LandingPanel = 'compose' | 'meaning';
const FLAG_SLOTS = [26, 34, 42, 58, 66, 74] as const;
/* 地平線(--surface-bottom)からの沈み込み量(vw)。惑星の曲面に沿わせるため端ほど大きい。 */
const FLAG_SURFACE_DROPS = [4.9, 2.1, 0.5, 0.5, 2.1, 4.9] as const;

/* 背景の星空。ホーム(WalkScene)と同じ生成規則で決定的に配置する。ロード画面でも使う。 */
export const BACKDROP_STARS = Array.from({ length: 60 }, (_, i) => ({
  topPercent: (i * 13) % 70,
  leftVw: (i * 37) % 100,
  size: 1 + (i % 3),
  opacity: 0.35 + ((i * 7) % 5) * 0.12,
}));

interface PlantedFlag {
  id: string;
  sentence: string;
  createdAt: string;
}

function storageKey(plot: UserPlotRow): string {
  return `plutchika:word-sentence:${getEmotionWordSlug(plot)}`;
}

function readStoredFlags(raw: string, word: string): PlantedFlag[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (flag): flag is PlantedFlag =>
          typeof flag === 'object'
          && flag !== null
          && typeof (flag as PlantedFlag).id === 'string'
          && typeof (flag as PlantedFlag).sentence === 'string'
          && typeof (flag as PlantedFlag).createdAt === 'string'
          && !Number.isNaN(Date.parse((flag as PlantedFlag).createdAt)),
      );
    }
  } catch {
    // 旧形式では文章をそのまま保存していたため、最初の旗として引き継ぐ。
  }
  return sentenceContainsWord(raw, word)
    ? [{ id: `legacy-${Date.now()}`, sentence: raw, createdAt: new Date().toISOString() }]
    : [];
}

function formatFlagDate(createdAt: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(createdAt));
}

function formatFlagTime(createdAt: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(createdAt));
}

function emotionLabel(plot: UserPlotRow, which: 'primary' | 'secondary'): string {
  if (which === 'primary') {
    return plot.primaryLabel?.trim() || getEmotionById(plot.primaryId).label;
  }
  return plot.secondaryLabel?.trim() || getEmotionById(plot.secondaryId).label;
}

function compositionLine(plot: UserPlotRow): string | null {
  const primary = getEmotionById(plot.primaryId);
  if (isBasicEmotionId(plot.primaryId) || !('components' in primary)) {
    return null;
  }
  const [a, b] = primary.components;
  return `${getBasicEmotion(a).label}＋${getBasicEmotion(b).label}`;
}

function sentenceContainsWord(sentence: string, word: string): boolean {
  return sentence.includes(word);
}

function GemButtonContent({ label, color }: { label: string; color: string }) {
  return (
    <>
      <span className="word-landing__choice-shadow" aria-hidden />
      <span className="word-landing__choice-gem" aria-hidden>
        <OctahedronIcon color={color} size={64} />
      </span>
      <span className="word-landing__choice-label">{label}</span>
    </>
  );
}

/**
 * 全単語で共用する学習ページ。
 * 単語ごとの差分は plot とテーマ色だけに限定する。
 */
export function WordLandingExperience({
  plot,
  uiTheme,
}: WordLandingExperienceProps) {
  const [sentence, setSentence] = useState('');
  const [flags, setFlags] = useState<PlantedFlag[]>([]);
  const [expandedFlagId, setExpandedFlagId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<LandingPanel | null>(null);
  const [closingPanel, setClosingPanel] = useState<LandingPanel | null>(null);
  const [beamReady, setBeamReady] = useState(false);

  const containsWord = useMemo(
    () => sentenceContainsWord(sentence, plot.word_id),
    [sentence, plot.word_id],
  );
  const composition = useMemo(() => compositionLine(plot), [plot]);

  // 星（球体）の上に立つオブジェクトの配置。惑星中心まわりの極座標で管理し、
  // 球体の回転に合わせて位置と傾きを一緒に動かす
  const surface = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const radius = wordPlanetRadius(vw);
    const surfaceBottom = 0.14 * vh; // CSSの --surface-bottom: 14% と対
    const centerBottom = surfaceBottom - radius; // 惑星中心のbottom座標(px)
    const gemX = vw <= 640 ? 90 : 140; // ジェム（ボタン中心）の水平オフセット
    const gemBottom = (vw <= 640 ? 0.02 : 0.03) * vh;
    return { vw, radius, surfaceBottom, centerBottom, gemX, gemBottom };
  }, []);

  /** 画面上の位置(中心からのx, bottom) → 惑星中心まわりの角度(時計回り正)と距離 */
  const toPolar = (x: number, bottomPx: number) => {
    const y = bottomPx - surface.centerBottom;
    return { angle: Math.atan2(x, y), radius: Math.hypot(x, y) };
  };

  const gemAngle = toPolar(surface.gemX, surface.gemBottom).angle;
  /** 人物の立ち位置（固定）。星が回ってもここから動かない */
  const personX = 73;
  /** 球体の回転量（画面上で時計回り正）。クリックされたジェムは必ず星の中央（頂点）に来る */
  const rotationDelta =
    activePanel === 'meaning' ? -gemAngle : activePanel === 'compose' ? gemAngle : 0;
  /** 人物の画面上の立ち位置。意味表示中はジェムの左側（画面左）へ歩いて移動する */
  const personCurrentX = activePanel === 'meaning' ? -62 : personX;

  // 星が回転して立ち位置が変わる間、人物に歩行モーションを付ける
  const [personWalking, setPersonWalking] = useState(false);
  const prevRotationRef = useRef(rotationDelta);
  useEffect(() => {
    if (prevRotationRef.current === rotationDelta) {
      return;
    }
    prevRotationRef.current = rotationDelta;
    setPersonWalking(true);
    const timer = window.setTimeout(() => setPersonWalking(false), 850);
    return () => window.clearTimeout(timer);
  }, [rotationDelta]);

  /** 基準位置を球体の回転ぶんだけ回した配置（位置＋傾き）を返す。liftPxで半径方向に浮かせられる */
  const placeOnSurface = (x: number, bottomPx: number, liftPx = 0) => {
    const p = toPolar(x, bottomPx);
    const a = p.angle + rotationDelta;
    const r = p.radius + liftPx;
    return {
      x: r * Math.sin(a),
      bottom: surface.centerBottom + r * Math.cos(a),
      angleRad: a,
    };
  };

  const typeLabel = wordTypeLabel(plot.wordType);
  const wordBeamWidth = Math.min(620, Math.max(180, Array.from(plot.word_id).length * 82));
  const panelBeamMode = activePanel ?? closingPanel;

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey(plot)) ?? '';
    setSentence('');
    setFlags(readStoredFlags(saved, plot.word_id));
    setExpandedFlagId(null);
    setActivePanel(null);
    setClosingPanel(null);
    setBeamReady(false);
    const timer = window.setTimeout(() => setBeamReady(true), 4800);
    return () => window.clearTimeout(timer);
  }, [plot]);

  const closePanel = (panel: LandingPanel) => {
    if (activePanel !== panel) return;
    setActivePanel(null);
    setClosingPanel(panel);
  };

  const togglePanel = (panel: LandingPanel) => {
    if (activePanel === panel) {
      closePanel(panel);
      return;
    }
    setClosingPanel(null);
    setActivePanel(panel);
  };

  const plantFlag = () => {
    const next = sentence.trim();
    if (!next || !sentenceContainsWord(next, plot.word_id)) {
      return;
    }
    const newFlag: PlantedFlag = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sentence: next,
      createdAt: new Date().toISOString(),
    };
    const nextFlags = [...flags, newFlag];
    window.localStorage.setItem(storageKey(plot), JSON.stringify(nextFlags));
    setFlags(nextFlags);
    setSentence('');
    setExpandedFlagId(newFlag.id);
    closePanel('compose');
  };

  return (
    <main
      className="word-landing"
      style={{
        color: uiTheme.uiText,
        background: 'radial-gradient(circle at 50% 20%, #141c40 0%, #0a0f26 55%, #05070f 100%)',
      }}
    >
      <style>{`
        .word-landing {
          --landing-time: 3.3s;
          /* 地平線は画面上端から86%。足元はこの高さに揃える。 */
          --surface-bottom: 14%;
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 620px;
          overflow: hidden;
          isolation: isolate;
        }
        .word-landing__stars {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .word-landing__stars span {
          position: absolute;
          border-radius: 50%;
          background: #ffffff;
        }
        .word-landing__header {
          position: absolute;
          inset: 22px 24px auto;
          z-index: 5;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          animation: uiReveal .5s ease-out calc(var(--landing-time) + .3s) both;
        }
        .word-landing__identity {
          position: absolute;
          z-index: 4;
          top: clamp(160px, 28vh, 260px);
          left: 50%;
          width: min(86vw, 640px);
          transform: translateX(-50%);
          text-align: center;
          pointer-events: none;
          transform-origin: 50% 100%;
          transition: top .46s cubic-bezier(.2,.72,.2,1);
          animation: wordProjectionReveal .72s cubic-bezier(.18,.72,.2,1) calc(var(--landing-time) + .12s) both;
        }
        .word-landing__identity.has-panel {
          top: clamp(88px, 12vh, 140px);
        }
        .word-landing__identity.has-panel h1 {
          text-shadow: none !important;
        }
        .word-landing__dismiss {
          position: absolute;
          inset: 0;
          z-index: 3;
          margin: 0;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: default;
        }
        .word-landing__word-beam {
          position: absolute;
          z-index: 2;
          left: 50%;
          bottom: calc(var(--surface-bottom) + 108px);
          width: min(82vw, 620px);
          height: clamp(270px, 43vh, 400px);
          transform: translateX(-50%);
          transform-origin: 50% 100%;
          pointer-events: none;
          opacity: 0;
          clip-path: polygon(49.2% 100%, 50.8% 100%, 100% 0, 0 0);
          background:
            radial-gradient(ellipse at 50% 100%, rgba(255,255,255,.9), transparent 12%),
            linear-gradient(to top, var(--word-beam-core), var(--word-beam-glow) 52%, transparent);
          filter: drop-shadow(0 0 20px var(--word-beam-glow));
          transition:
            width .36s cubic-bezier(.2,.72,.2,1),
            height .36s cubic-bezier(.2,.72,.2,1);
          animation:
            wordBeamProjection 1.5s ease-out var(--landing-time) both,
            wordBeamIdle 3.8s ease-in-out calc(var(--landing-time) + 1.5s) infinite;
        }
        .word-landing__word-beam.is-meaning,
        .word-landing__word-beam.is-compose {
          opacity: .55;
          animation: none;
          filter: drop-shadow(0 0 18px var(--word-beam-glow));
        }
        .word-landing__word-beam.is-ready:not(.is-meaning):not(.is-compose) {
          animation: wordBeamIdle 3.8s ease-in-out infinite;
          opacity: .4;
        }
        .word-landing__word-beam.is-meaning {
          width: min(108vw, 860px);
          height: clamp(70px, 11vh, 110px);
        }
        .word-landing__word-beam.is-compose {
          width: min(108vw, 860px);
          height: clamp(70px, 11vh, 110px);
        }
        .word-landing__word-beam::after {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0 12px,
            rgba(255,255,255,.12) 13px,
            transparent 14px
          );
          animation: projectorDust 2.4s linear infinite;
        }
        .word-landing__identity-panel {
          pointer-events: auto;
          margin: 18px auto 0;
          width: min(100%, 620px);
          max-height: min(34vh, 280px);
          overflow: auto;
          text-align: left;
          padding: 18px 4px 0;
          box-sizing: border-box;
          border-top: 1px solid var(--panel-border);
        }
        .word-landing__identity-panel--projected {
          border-top-color: var(--projector-line);
          background:
            radial-gradient(
              ellipse at 50% 48%,
              var(--projector-glow) 0%,
              rgba(10,16,32,.28) 42%,
              transparent 76%
            );
          box-shadow: 0 18px 70px -24px var(--projector-glow);
          backdrop-filter: blur(7px);
          animation: projectionAppear .48s ease-out both;
        }
        .word-landing__identity-panel--projected.is-closing {
          pointer-events: none;
          animation: projectionDisappear .4s ease-in both;
        }
        .word-landing__textarea {
          width: 100%;
          min-height: 88px;
          resize: none;
          box-sizing: border-box;
          border: 1px solid var(--panel-border);
          border-radius: 8px;
          outline: none;
          margin-top: 10px;
          padding: 10px 12px;
          color: #f7f4fa;
          background: rgba(0,0,0,.22);
          font: inherit;
          font-size: clamp(.9rem, 2vw, 1.02rem);
          line-height: 1.75;
          letter-spacing: .04em;
        }
        .word-landing__textarea::placeholder {
          color: rgba(232,226,240,.42);
        }
        .word-landing__actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
        }
        .word-landing__meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 24px;
          align-items: baseline;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,.1);
        }
        .word-landing__meta-row {
          display: flex;
          gap: 8px;
          align-items: baseline;
          font-size: .86rem;
          letter-spacing: .05em;
        }
        .word-landing__meta-row span:first-child {
          opacity: .55;
          flex-shrink: 0;
        }
        .word-landing__composition {
          margin-left: 3px;
          opacity: .72;
          white-space: nowrap;
        }
        .word-landing__panel-close {
          float: right;
          width: 28px;
          height: 28px;
          margin: -4px -4px 0 8px;
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 50%;
          color: rgba(255,255,255,.72);
          background: rgba(0,0,0,.2);
          cursor: pointer;
        }
        /* 惑星本体はPlanetSphere（Three.jsの3Dスフィア）が描画する。この要素は登場アニメーションの入れ物 */
        .word-landing__planet {
          position: absolute;
          z-index: 1;
          inset: 0;
          pointer-events: none;
          animation: planetRise .9s cubic-bezier(.16,.72,.18,1) 1.75s both;
        }
        /* ロケット本体はRocketModel（3Dキャンバス）が描画する。この要素は砂埃・接地影のアンカー */
        .word-landing__rocket {
          position: absolute;
          z-index: 3;
          left: 50%;
          bottom: var(--surface-bottom);
          width: 76px;
          height: 116px;
          transform: translateX(-50%);
          pointer-events: none;
          transition:
            left .8s cubic-bezier(.25,.6,.25,1),
            bottom .8s cubic-bezier(.25,.6,.25,1),
            transform .8s cubic-bezier(.25,.6,.25,1);
        }
        .word-landing__rocket::after {
          content: "";
          position: absolute;
          z-index: -1;
          left: 50%;
          bottom: -13px;
          width: 150px;
          height: 34px;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(221,232,255,.5), rgba(139,157,193,.18) 40%, transparent 70%);
          transform: translateX(-50%) scale(.2);
          filter: blur(5px);
          opacity: 0;
          animation: landingDust var(--landing-time) ease-out both;
        }
        .word-landing__rocket-shadow {
          position: absolute;
          left: 9px;
          right: 9px;
          bottom: -3px;
          height: 8px;
          border-radius: 50%;
          background: rgba(0,0,0,.35);
          filter: blur(3px);
          /* 接地の直前にフェードインさせる */
          animation: uiReveal .3s ease-out calc(var(--landing-time) - .25s) both;
        }
        .word-landing__person {
          position: absolute;
          z-index: 3;
          left: calc(50% + 58px);
          bottom: var(--surface-bottom);
          width: 30px;
          height: 58px;
          pointer-events: none;
          animation: personArrive .55s ease-out calc(var(--landing-time) + .2s) both;
          transition:
            left .8s cubic-bezier(.25,.6,.25,1),
            bottom .8s cubic-bezier(.25,.6,.25,1),
            transform .8s cubic-bezier(.25,.6,.25,1);
        }
        .word-landing__person-head {
          position: absolute;
          top: 0;
          left: 50%;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #f4ecf7;
          transform: translateX(-50%);
          animation: personIdleBob 2.2s ease-in-out calc(var(--landing-time) + 1s) infinite;
        }
        @keyframes personIdleBob {
          0%, 100% {
            transform: translateX(-50%) translateY(0);
          }
          50% {
            transform: translateX(-50%) translateY(-2px);
          }
        }
        .word-landing__person-body {
          position: absolute;
          top: 16px;
          left: 50%;
          width: 26px;
          height: 30px;
          border-radius: 13px 13px 6px 6px;
          background: #e4d9ea;
          transform: translateX(-50%);
        }
        .word-landing__person-arm {
          display: none;
        }
        .word-landing__person-leg {
          position: absolute;
          top: 42px;
          width: 7px;
          height: 16px;
          border-radius: 3px;
          background: #f4ecf7;
          transform-origin: top center;
        }
        .word-landing__person-leg--left {
          left: 6px;
          transform: none;
        }
        .word-landing__person-leg--right {
          left: 16px;
          transform: none;
        }
        /* 星の回転で立ち位置が動く間の歩行モーション（ホームのwalkerと同じ振り方） */
        .word-landing__person.is-walking .word-landing__person-head {
          animation: personWalkHead .4s ease-in-out infinite;
        }
        .word-landing__person.is-walking .word-landing__person-leg--left {
          animation: personWalkLegLeft .4s ease-in-out infinite;
        }
        .word-landing__person.is-walking .word-landing__person-leg--right {
          animation: personWalkLegRight .4s ease-in-out infinite;
        }
        @keyframes personWalkHead {
          0%, 100% {
            transform: translateX(-50%) translateY(0);
          }
          50% {
            transform: translateX(-50%) translateY(-3px);
          }
        }
        @keyframes personWalkLegLeft {
          0%, 100% {
            transform: rotate(22deg);
          }
          50% {
            transform: rotate(-22deg);
          }
        }
        @keyframes personWalkLegRight {
          0%, 100% {
            transform: rotate(-22deg);
          }
          50% {
            transform: rotate(22deg);
          }
        }
        .word-landing__person-held-flag {
          position: absolute;
          z-index: -1;
          top: 6px;
          left: 27px;
          width: 2px;
          height: 44px;
          border-radius: 999px;
          background: #f4ecf7;
          transform: rotate(-7deg);
          transform-origin: 50% 100%;
        }
        .word-landing__person-held-flag::after {
          content: "";
          position: absolute;
          top: 1px;
          left: 2px;
          width: 22px;
          height: 14px;
          background: linear-gradient(135deg, #ff4b4b, #b80f22);
          clip-path: polygon(0 0, 100% 10%, 84% 50%, 100% 90%, 0 100%);
        }
        /* 月面（ロケットより手前）に置かれた8面体のジェムボタン。位置と傾きはインラインで計算する */
        .word-landing__choice {
          position: absolute;
          z-index: 4;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 6px 10px;
          border: 0;
          background: transparent;
          color: #f4ecf7;
          font: inherit;
          font-size: .8rem;
          font-weight: 700;
          letter-spacing: .1em;
          cursor: pointer;
          transition:
            left .8s cubic-bezier(.25,.6,.25,1),
            bottom .8s cubic-bezier(.25,.6,.25,1),
            transform .8s cubic-bezier(.25,.6,.25,1);
        }
        /* 星面に落ちるジェムの影 */
        .word-landing__choice-shadow {
          position: absolute;
          top: 60px;
          left: 50%;
          width: 46px;
          height: 11px;
          border-radius: 50%;
          transform: translateX(-50%);
          background: rgba(20, 24, 52, .42);
          filter: blur(3px);
          pointer-events: none;
        }
        .word-landing__choice-gem {
          position: relative;
          width: 64px;
          height: 64px;
          filter: drop-shadow(0 8px 10px rgba(0,0,0,.4)) drop-shadow(0 0 12px var(--planet-glow));
          /* 軸が惑星（球体）の中心を向くように傾ける */
          transform: rotate(var(--gem-tilt, 0deg));
          transition: transform 240ms ease;
        }
        .word-landing__choice:hover .word-landing__choice-gem {
          transform: rotate(var(--gem-tilt, 0deg)) scale(1.12) translateY(-3px);
        }
        .word-landing__choice-label {
          text-shadow: 0 1px 5px rgba(0,0,0,.85);
        }
        .word-landing__choice--left {
          animation: uiReveal .5s ease-out calc(var(--landing-time) + .55s) both;
        }
        .word-landing__choice--right {
          animation: uiReveal .5s ease-out calc(var(--landing-time) + .65s) both;
        }
        .word-landing__choice.is-active {
          filter: brightness(1.18);
        }
        .word-landing__planted {
          position: absolute;
          z-index: 2;
          width: 36px;
          height: 82px;
          padding: 0;
          border: 0;
          color: #fff;
          background: transparent;
          font: inherit;
          cursor: pointer;
          transform: translateX(-50%);
          transform-origin: 50% 100%;
          animation: flagPlant .5s cubic-bezier(.2,.9,.2,1) calc(var(--landing-time) + .65s) both;
          transition:
            left .8s cubic-bezier(.25,.6,.25,1),
            bottom .8s cubic-bezier(.25,.6,.25,1),
            transform .8s cubic-bezier(.25,.6,.25,1);
        }
        .word-landing__planted.is-expanded {
          z-index: 6;
        }
        .word-landing__planted-pole {
          position: absolute;
          left: 14px;
          bottom: 0;
          width: 2.5px;
          height: 76px;
          border-radius: 999px;
          background: linear-gradient(90deg, #6d7484, #f4f7ff 52%, #555d6b);
          box-shadow: 0 0 8px rgba(255,255,255,.35);
          transition: height .46s cubic-bezier(.2,.8,.2,1);
        }
        .word-landing__planted.is-expanded .word-landing__planted-pole {
          height: 280px;
        }
        .word-landing__planted-cloth {
          position: absolute;
          left: 16px;
          bottom: 37px;
          width: 96px;
          height: 42px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          padding: 0 10px 0 6px;
          overflow: hidden;
          background: linear-gradient(135deg, var(--planted-flag), rgba(255,255,255,.18));
          clip-path: polygon(0 0, 100% 12%, 88% 50%, 100% 88%, 0 100%);
          box-shadow: 0 0 14px var(--planet-glow);
          transform-origin: left center;
          transition:
            width .46s cubic-bezier(.2,.8,.2,1),
            height .46s cubic-bezier(.2,.8,.2,1),
            bottom .46s cubic-bezier(.2,.8,.2,1),
            padding .46s ease;
        }
        .word-landing__planted.is-leftward .word-landing__planted-cloth {
          right: 16px;
          left: auto;
          align-items: flex-end;
          padding: 0 6px 0 10px;
          clip-path: polygon(100% 0, 0 12%, 12% 50%, 0 88%, 100% 100%);
          transform-origin: right center;
        }
        .word-landing__planted.is-expanded .word-landing__planted-cloth {
          bottom: 158px;
          width: min(250px, 66vw);
          height: 118px;
          padding: 12px 30px 12px 15px;
        }
        .word-landing__planted.is-expanded.is-leftward .word-landing__planted-cloth {
          padding: 12px 15px 12px 30px;
        }
        .word-landing__planted-text {
          width: 100%;
          max-height: 0;
          overflow: hidden;
          color: #fff;
          font-size: clamp(.62rem, 1.2vw, .76rem);
          font-weight: 650;
          line-height: 1.5;
          letter-spacing: .04em;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
          text-shadow: 0 1px 4px rgba(0,0,0,.65);
          opacity: 0;
          transition: opacity .18s ease, max-height .3s ease;
        }
        .word-landing__planted.is-expanded .word-landing__planted-text {
          max-height: 68px;
          opacity: 1;
          transition-delay: .28s;
        }
        .word-landing__planted-date {
          display: block;
          color: rgba(255,255,255,.88);
          font-size: .54rem;
          font-weight: 700;
          line-height: 1.3;
          letter-spacing: .02em;
          white-space: nowrap;
          text-shadow: 0 1px 4px rgba(0,0,0,.8);
          transition: font-size .3s ease, margin-bottom .3s ease;
        }
        .word-landing__planted-date span {
          display: block;
        }
        .word-landing__planted.is-expanded .word-landing__planted-date {
          display: none;
        }
        .word-landing__planted-base {
          position: absolute;
          left: 9px;
          bottom: -1px;
          width: 12px;
          height: 4px;
          border-radius: 999px;
          background: rgba(0,0,0,.35);
          filter: blur(1px);
        }
        /* 100%側でtransformを保持しない（星の回転による傾きをインラインで当てるため） */
        @keyframes flagPlant {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(12px) scale(.72);
          }
          100% {
            opacity: 1;
          }
        }
        @keyframes planetRise {
          from {
            opacity: 0;
            transform: translateY(26vh);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes wordBeamProjection {
          0% {
            opacity: 0;
            transform: translateX(-50%) scaleX(.04) scaleY(.1);
          }
          18% {
            opacity: .84;
          }
          65% {
            opacity: .56;
            transform: translateX(-50%) scaleX(1) scaleY(1);
          }
          100% {
            opacity: .4;
            transform: translateX(-50%) scaleX(1.04) scaleY(1);
          }
        }
        @keyframes wordBeamIdle {
          0%, 100% {
            opacity: .32;
            transform: translateX(-50%) scaleX(1) scaleY(1);
          }
          50% {
            opacity: .5;
            transform: translateX(-50%) scaleX(1.035) scaleY(1);
          }
        }
        @keyframes wordProjectionReveal {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(120px) scale(.72);
            filter: blur(8px);
            clip-path: inset(100% 0 0);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
            filter: blur(0);
            clip-path: inset(0 0 0);
          }
        }
        @keyframes uiReveal {
          from {
            opacity: 0;
            filter: blur(5px);
          }
          to {
            opacity: 1;
            filter: blur(0);
          }
        }
        /* 終値のtransformをアニメーションが保持し続けないよう、toはopacityのみにする
           （星の回転による傾きをインラインのtransformで当てるため） */
        @keyframes personArrive {
          from {
            opacity: 0;
            transform: translateX(-50%) translateX(-18px) scale(.82);
          }
          to {
            opacity: 1;
          }
        }
        @keyframes landingDust {
          0%, 94% {
            opacity: 0;
            transform: translateX(-50%) scale(.2);
          }
          98% {
            opacity: .65;
            transform: translateX(-50%) scale(.72);
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) scale(1.15);
          }
        }
        @keyframes projectorBeam {
          from {
            opacity: 0;
            transform: translateX(-50%) scaleX(.08) scaleY(.35);
          }
          to {
            opacity: .72;
            transform: translateX(-50%) scaleX(1) scaleY(1);
          }
        }
        @keyframes projectionAppear {
          from {
            opacity: 0;
            transform: translateY(10px);
            filter: blur(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
        @keyframes projectionDisappear {
          from {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
          to {
            opacity: 0;
            transform: translateY(8px);
            filter: blur(5px);
          }
        }
        @keyframes projectorBeamOut {
          from {
            opacity: .72;
            transform: translateX(-50%) scaleX(1) scaleY(1);
          }
          to {
            opacity: 0;
            transform: translateX(-50%) scaleX(.08) scaleY(.35);
          }
        }
        @keyframes projectorDust {
          from { background-position: 0 0, 0 0, 0 0; }
          to { background-position: 0 -76px, 0 -94px, 0 -106px; }
        }
        @media (max-width: 640px) {
          .word-landing__header {
            inset: 16px 16px auto;
          }
          .word-landing__identity {
            top: clamp(150px, 24vh, 210px);
            width: calc(100vw - 28px);
          }
          .word-landing__identity.has-panel {
            top: clamp(72px, 10vh, 110px);
          }
          .word-landing__identity-panel {
            max-height: 28vh;
          }
          .word-landing__person {
            left: calc(50% + 50px);
          }
          .word-landing__word-beam {
            height: min(44vh, 365px);
          }
          .word-landing__word-beam.is-meaning {
            width: calc(100vw + 80px);
            height: min(11vh, 95px);
          }
          .word-landing__word-beam.is-compose {
            width: calc(100vw + 80px);
            height: min(11vh, 95px);
          }
          .word-landing__choice {
            font-size: .72rem;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .word-landing__header,
          .word-landing__identity,
          .word-landing__planet,
          .word-landing__choice,
          .word-landing__planted,
          .word-landing__person,
          .word-landing__rocket,
          .word-landing__rocket::after,
          .word-landing__rocket-shadow {
            animation: none;
          }
          .word-landing__word-beam {
            display: none;
          }
        }
      `}</style>

      <div className="word-landing__stars" aria-hidden>
        {BACKDROP_STARS.map((star, index) => (
          <span
            key={index}
            style={{
              top: `${star.topPercent}%`,
              left: `${star.leftVw}vw`,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
            }}
          />
        ))}
      </div>

      <header className="word-landing__header">
        <div>
          <p
            style={{
              margin: 0,
              fontSize: '0.68rem',
              letterSpacing: '0.2em',
              opacity: 0.52,
            }}
          >
            WORD LANDING · 学習地点
          </p>
          <p
            style={{
              margin: '7px 0 0',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              color: uiTheme.textMuted,
            }}
          >
            /map/{getEmotionWordSlug(plot)}
          </p>
        </div>
        <Link
          to={ROUTES.emotionMap}
          style={{
            padding: '8px 13px',
            border: `1px solid ${uiTheme.accentBorder}`,
            borderRadius: 8,
            color: uiTheme.textPrimary,
            textDecoration: 'none',
            fontSize: '0.76rem',
            letterSpacing: '0.06em',
            background: uiTheme.panelBackground,
            backdropFilter: 'blur(8px)',
          }}
        >
          Map に戻る
        </Link>
      </header>

      <section
        className={`word-landing__identity${activePanel !== null || closingPanel !== null ? ' has-panel' : ''}`}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.7rem',
            letterSpacing: '0.18em',
            color: uiTheme.textMuted,
          }}
        >
          あなたの感情
        </p>
        <h1
          style={{
            margin: '9px 0 0',
            fontSize: 'clamp(2.2rem, 7vw, 4.2rem)',
            fontWeight: 620,
            letterSpacing: '0.12em',
            color: uiTheme.textPrimary,
            textShadow: `0 0 24px ${uiTheme.accentGlow}`,
          }}
        >
          {plot.word_id}
        </h1>
        {plot.ruby?.trim() && (
          <p
            style={{
              margin: '7px 0 0',
              fontSize: 'clamp(.82rem, 2vw, 1rem)',
              letterSpacing: '0.15em',
              color: uiTheme.textMuted,
            }}
          >
            {plot.ruby.trim()}
          </p>
        )}

        {(activePanel === 'meaning' || closingPanel === 'meaning') && (
          <div
            className={`word-landing__identity-panel word-landing__identity-panel--projected${closingPanel === 'meaning' ? ' is-closing' : ''}`}
            aria-label={`${plot.word_id}の意味`}
            onClick={(event) => event.stopPropagation()}
            onAnimationEnd={() => {
              if (closingPanel === 'meaning') setClosingPanel(null);
            }}
            style={{
              '--panel-border': uiTheme.accentBorderStrong,
              '--panel-bg': uiTheme.panelBackground,
              '--planet-glow': uiTheme.accentGlow,
              '--projector-line': uiTheme.accentBorderStrong,
              '--projector-glow': uiTheme.accentGlow,
            } as CSSProperties}
          >
            {typeLabel && (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.74rem',
                  letterSpacing: '0.1em',
                  color: uiTheme.textMuted,
                }}
              >
                {typeLabel}
              </p>
            )}
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 'clamp(.92rem, 2vw, 1.05rem)',
                lineHeight: 1.85,
                letterSpacing: '0.04em',
                color: uiTheme.textSecondary,
                whiteSpace: 'pre-wrap',
              }}
            >
              {plot.meaning?.trim() || 'この単語の意味はまだ登録されていません。'}
            </p>
            {plot.usageExample?.trim() && (
              <div style={{ marginTop: 14 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.68rem',
                    letterSpacing: '0.14em',
                    color: uiTheme.textMuted,
                  }}
                >
                  用例
                </p>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '0.9rem',
                    lineHeight: 1.75,
                    color: uiTheme.textSecondary,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {plot.usageExample.trim()}
                </p>
              </div>
            )}
            <div className="word-landing__meta">
              <div className="word-landing__meta-row">
                <span>主感情</span>
                <span>
                  {emotionLabel(plot, 'primary')}
                  {composition && (
                    <span className="word-landing__composition">（{composition}）</span>
                  )}
                </span>
              </div>
              <div className="word-landing__meta-row">
                <span>副感情</span>
                <span>{emotionLabel(plot, 'secondary')}</span>
              </div>
              <div className="word-landing__meta-row">
                <span>強度</span>
                <span>{plot.intensity}</span>
              </div>
            </div>
          </div>
        )}

        {(activePanel === 'compose' || closingPanel === 'compose') && (
          <div
            className={`word-landing__identity-panel word-landing__identity-panel--projected${closingPanel === 'compose' ? ' is-closing' : ''}`}
            aria-label={`${plot.word_id}を使った文章`}
            onClick={(event) => event.stopPropagation()}
            onAnimationEnd={() => {
              if (closingPanel === 'compose') setClosingPanel(null);
            }}
            style={{
              '--panel-border': uiTheme.accentBorderStrong,
              '--panel-bg': uiTheme.panelBackground,
              '--planet-glow': uiTheme.accentGlow,
              '--projector-line': uiTheme.accentBorderStrong,
              '--projector-glow': uiTheme.accentGlow,
            } as CSSProperties}
          >
            <label
              htmlFor="word-learning-sentence"
              style={{
                display: 'block',
                fontSize: '0.68rem',
                letterSpacing: '0.14em',
                color: uiTheme.textMuted,
              }}
            >
              「{plot.word_id}」を使って文章を書いてください
            </label>
            <textarea
              id="word-learning-sentence"
              className="word-landing__textarea"
              value={sentence}
              maxLength={240}
              autoFocus
              placeholder={
                plot.usageExample?.trim()
                  ? `例：${plot.usageExample.trim()}`
                  : `例：${plot.word_id}を使った文章`
              }
              onChange={(event) => setSentence(event.target.value)}
            />
            <div className="word-landing__actions">
              <span
                role="status"
                style={{
                  minHeight: '1em',
                  fontSize: '0.7rem',
                  letterSpacing: '0.06em',
                  color: uiTheme.textMuted,
                }}
              >
                {!sentence.trim()
                  ? `${sentence.length} / 240`
                  : !containsWord
                    ? `「${plot.word_id}」を含めてください`
                    : `${sentence.length} / 240`}
              </span>
              <button
                type="button"
                disabled={!sentence.trim() || !containsWord}
                onClick={plantFlag}
                style={{
                  padding: '9px 16px',
                  border: `1px solid ${uiTheme.accentBorderStrong}`,
                  borderRadius: 999,
                  color: uiTheme.textPrimary,
                  background: uiTheme.controlBackground,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  cursor: sentence.trim() && containsWord ? 'pointer' : 'default',
                  opacity: sentence.trim() && containsWord ? 1 : 0.45,
                }}
              >
                この文章で立てる
              </button>
            </div>
          </div>
        )}
      </section>

      <div
        className={[
          'word-landing__word-beam',
          beamReady ? 'is-ready' : '',
          panelBeamMode ? `is-${panelBeamMode}` : '',
        ].filter(Boolean).join(' ')}
        aria-hidden
        style={{
          width: panelBeamMode ? undefined : `min(82vw, ${wordBeamWidth}px)`,
          '--word-beam-core': uiTheme.accentSoft,
          '--word-beam-glow': uiTheme.accentGlow,
        } as CSSProperties}
      />

      {(activePanel !== null || closingPanel !== null) && (
        <button
          type="button"
          className="word-landing__dismiss"
          aria-label="表示を閉じる"
          onClick={() => {
            if (activePanel) closePanel(activePanel);
          }}
        />
      )}

      {(() => {
        // 手前奥方向の回転で乗り越えてきたぶん、フォーカスされたジェムは
        // 地平線より少し上（星から離れた位置）まで持ち上げる
        const gemLift =
          surface.radius + 28 - toPolar(surface.gemX, surface.gemBottom).radius;
        const leftGemPlace = placeOnSurface(
          -surface.gemX,
          surface.gemBottom,
          activePanel === 'compose' ? gemLift : 0,
        );
        const rightGemPlace = placeOnSurface(
          surface.gemX,
          surface.gemBottom,
          activePanel === 'meaning' ? gemLift : 0,
        );
        return (
          <>
            {/* ロケットは3D側で星の奥へ回り込むため、接地影は定位置のままフェードさせる */}
            <div
              className="word-landing__rocket"
              aria-label={`${plot.word_id}の星に着陸したロケット`}
              style={{
                opacity: activePanel !== null ? 0 : 1,
                transition: 'opacity .45s ease',
              }}
            >
              <div className="word-landing__rocket-shadow" />
            </div>

            <RocketModel
              key={getEmotionWordSlug(plot)}
              accent={uiTheme.accent}
              heightPx={116}
              feetBottom={(viewportHeight) => viewportHeight * 0.14}
              surfaceAngleRad={rotationDelta}
              surfacePitchRad={activePanel !== null ? -0.5 : 0}
            />

            {/* 人物は直立のまま。移動が必要なとき（意味表示）は歩行モーションで横へ移動する */}
            <div
              className={`word-landing__person${personWalking ? ' is-walking' : ''}`}
              aria-label="ロケットの横に立つ人"
              style={{
                left: `calc(50% + ${personCurrentX}px)`,
                bottom: surface.surfaceBottom,
                transform: 'translateX(-50%)',
              }}
            >
              <span className="word-landing__person-held-flag" />
              <span className="word-landing__person-head" />
              <span className="word-landing__person-body" />
              <span className="word-landing__person-arm word-landing__person-arm--left" />
              <span className="word-landing__person-arm word-landing__person-arm--right" />
              <span className="word-landing__person-leg word-landing__person-leg--left" />
              <span className="word-landing__person-leg word-landing__person-leg--right" />
            </div>

            <button
              type="button"
              className="word-landing__choice word-landing__choice--left"
              onClick={() => togglePanel('compose')}
              style={{
                left: `calc(50% + ${leftGemPlace.x}px)`,
                bottom: leftGemPlace.bottom,
                transform: 'translateX(-50%)',
                zIndex: activePanel === 'compose' ? 5 : undefined,
                '--planet-glow': uiTheme.accentGlow,
                '--gem-tilt': `${leftGemPlace.angleRad}rad`,
              } as CSSProperties}
            >
              <GemButtonContent label="旗を立てる" color={uiTheme.accent} />
            </button>
            <button
              type="button"
              className="word-landing__choice word-landing__choice--right"
              onClick={() => togglePanel('meaning')}
              style={{
                left: `calc(50% + ${rightGemPlace.x}px)`,
                bottom: rightGemPlace.bottom,
                transform: 'translateX(-50%)',
                zIndex: activePanel === 'meaning' ? 5 : undefined,
                '--planet-glow': uiTheme.accentGlow,
                '--gem-tilt': `${rightGemPlace.angleRad}rad`,
              } as CSSProperties}
            >
              <GemButtonContent label="意味を表示" color={uiTheme.accent} />
            </button>
          </>
        );
      })()}

      {flags.map((flag, index) => {
        const slotIndex = index % FLAG_SLOTS.length;
        const slot = FLAG_SLOTS[slotIndex];
        const row = Math.floor(index / FLAG_SLOTS.length) % 4;
        const isExpanded = expandedFlagId === flag.id;
        const flagPlace = placeOnSurface(
          ((slot - 50) / 100) * surface.vw,
          surface.surfaceBottom - (FLAG_SURFACE_DROPS[slotIndex] / 100) * surface.vw + row * 8,
        );
        return (
          <button
            key={flag.id}
            type="button"
            className={`word-landing__planted${isExpanded ? ' is-expanded' : ''}${slot > 50 ? ' is-leftward' : ''}`}
            aria-expanded={isExpanded}
            aria-label={`${formatFlagDate(flag.createdAt)} ${formatFlagTime(flag.createdAt)}に立てた旗`}
            onClick={() => setExpandedFlagId((current) => current === flag.id ? null : flag.id)}
            style={{
              left: `calc(50% + ${flagPlace.x}px)`,
              bottom: flagPlace.bottom,
              transform: `translateX(-50%) rotate(${flagPlace.angleRad}rad)`,
              '--planted-flag': uiTheme.accent,
              '--planet-glow': uiTheme.accentGlow,
            } as CSSProperties}
          >
            <span className="word-landing__planted-cloth">
              <time className="word-landing__planted-date" dateTime={flag.createdAt}>
                <span>{formatFlagDate(flag.createdAt)}</span>
                <span>{formatFlagTime(flag.createdAt)}</span>
              </time>
              <span className="word-landing__planted-text">{flag.sentence}</span>
            </span>
            <span className="word-landing__planted-pole" />
            <span className="word-landing__planted-base" />
          </button>
        );
      })}

      {/* 画面上で時計回り正のrotationDeltaを、Three.js（反時計回り正）の角度に変換して渡す。
          パネル表示中は手前の面がせり上がる方向（負のピッチ）にも回す */}
      <div className="word-landing__planet" aria-hidden>
        <PlanetSphere
          rotationRad={-rotationDelta}
          pitchRad={activePanel !== null ? -0.18 : 0}
        />
      </div>
    </main>
  );
}
