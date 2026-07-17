import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { getBasicEmotion, getEmotionById, isBasicEmotionId } from '../../data/emotions';
import { ROUTES } from '../../routes/paths';
import type { UserPlotRow } from '../../types/userPlot';
import type { EmotionUiTheme } from '../../utils/emotionUiTheme';
import { getEmotionWordSlug } from '../../utils/emotionWordSlug';
import { wordTypeLabel } from '../../utils/emotionWordsBridge';

interface WordLandingExperienceProps {
  plot: UserPlotRow;
  uiTheme: EmotionUiTheme;
}

type LandingPanel = 'compose' | 'meaning';
const FLAG_SLOTS = [26, 34, 42, 58, 66, 74] as const;
const FLAG_SURFACE_BOTTOMS = [72, 100, 120, 120, 100, 72] as const;

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

function CloudButtonContent({ label }: { label: string }) {
  return (
    <>
      <span className="word-landing__cloud-particles" aria-hidden>
        {Array.from({ length: 22 }, (_, index) => (
          <span
            key={index}
            className="word-landing__cloud-particle"
            style={{
              '--particle-x': `${(index * 37) % 100}%`,
              '--particle-y': `${18 + ((index * 53) % 66)}%`,
              '--particle-size': `${2 + (index % 4) * 1.4}px`,
              '--particle-delay': `${-(index % 8) * 0.58}s`,
              '--particle-duration': `${3.6 + (index % 6) * 0.48}s`,
              '--particle-drift': `${-13 + ((index * 7) % 27)}px`,
            } as CSSProperties}
          />
        ))}
      </span>
      <span className="word-landing__cloud-label">{label}</span>
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
        background: `
          radial-gradient(circle at 50% 24%, ${uiTheme.accentGlow}, transparent 24%),
          radial-gradient(ellipse at 50% 100%, rgba(18,24,42,0.72), transparent 48%),
          linear-gradient(180deg, #02040b 0%, #070b17 66%, #10172a 100%)
        `,
      }}
    >
      <style>{`
        .word-landing {
          --landing-time: 3.3s;
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 620px;
          overflow: hidden;
          isolation: isolate;
        }
        .word-landing::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .55;
          background-image:
            radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,.8), transparent),
            radial-gradient(1px 1px at 27% 42%, rgba(255,255,255,.55), transparent),
            radial-gradient(1px 1px at 69% 17%, rgba(255,255,255,.7), transparent),
            radial-gradient(1.5px 1.5px at 84% 38%, rgba(255,255,255,.55), transparent),
            radial-gradient(1px 1px at 54% 9%, rgba(255,255,255,.65), transparent);
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
          bottom: calc(clamp(72px, 11vh, 105px) + 108px);
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
        .word-landing__planet {
          position: absolute;
          z-index: 1;
          left: 50%;
          bottom: 0;
          width: max(112vw, 1100px);
          aspect-ratio: 1;
          border-radius: 50%;
          transform: translate(-50%, 88%);
          box-shadow:
            0 -22px 80px var(--planet-glow),
            inset 0 22px 70px rgba(255,255,255,.1),
            inset 0 -90px 180px rgba(0,0,0,.6);
          background:
            radial-gradient(circle at 34% 15%, rgba(255,255,255,.18) 0 2%, transparent 7%),
            radial-gradient(circle at 62% 10%, rgba(0,0,0,.2) 0 4%, transparent 9%),
            radial-gradient(circle at 52% 28%, rgba(255,255,255,.08), transparent 24%),
            radial-gradient(circle at 50% 42%, var(--planet-light), var(--planet-color) 48%, #080b14 100%);
          animation: planetRise .9s cubic-bezier(.16,.72,.18,1) 1.75s both;
        }
        .word-landing__planet::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          opacity: .28;
          background: repeating-radial-gradient(
            ellipse at 48% 18%,
            transparent 0 22px,
            rgba(255,255,255,.1) 24px,
            transparent 27px
          );
          mix-blend-mode: screen;
        }
        .word-landing__rocket {
          position: absolute;
          z-index: 3;
          left: 50%;
          bottom: clamp(72px, 11vh, 105px);
          width: 76px;
          height: 116px;
          transform: translateX(-50%);
          pointer-events: none;
          filter: drop-shadow(0 12px 15px rgba(0,0,0,.35));
          animation: rocketLanding var(--landing-time) linear both;
          will-change: transform, opacity;
        }
        .word-landing__rocket::before {
          content: "";
          position: absolute;
          z-index: -1;
          left: 50%;
          bottom: 9px;
          width: 18px;
          height: 54px;
          border-radius: 50% 50% 70% 70%;
          background:
            radial-gradient(ellipse at 50% 10%, #fff 0 8%, #8feaff 22%, #4f8dff 46%, rgba(139,79,255,.62) 66%, transparent 76%);
          transform: translateX(-50%);
          transform-origin: 50% 0;
          filter: blur(.7px) drop-shadow(0 0 10px #70cfff);
          animation: landingThruster var(--landing-time) ease-out both;
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
        .word-landing__rocket-body {
          position: absolute;
          left: 18px;
          top: 0;
          width: 40px;
          height: 86px;
          border: 1px solid rgba(255,255,255,.56);
          border-radius: 50% 50% 30% 30%;
          background:
            linear-gradient(90deg, rgba(0,0,0,.2), transparent 35%, rgba(255,255,255,.32) 55%, rgba(0,0,0,.24)),
            linear-gradient(180deg, #e9edf3, #858e9d 72%, #596270);
          box-shadow: inset 0 0 12px rgba(255,255,255,.24);
        }
        .word-landing__rocket-window {
          position: absolute;
          left: 50%;
          top: 25px;
          width: 17px;
          height: 17px;
          transform: translateX(-50%);
          border: 2px solid #596270;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #ecfbff, var(--rocket-color) 48%, #17223a);
          box-shadow: 0 0 10px var(--planet-glow);
        }
        .word-landing__rocket-band {
          position: absolute;
          left: 2px;
          right: 2px;
          bottom: 17px;
          height: 8px;
          background: var(--rocket-color);
          box-shadow: 0 0 10px var(--planet-glow);
        }
        .word-landing__rocket-fin {
          position: absolute;
          bottom: 19px;
          width: 18px;
          height: 35px;
          background: linear-gradient(180deg, var(--rocket-color), #353d4c);
        }
        .word-landing__rocket-fin--left {
          left: 7px;
          clip-path: polygon(100% 0, 100% 100%, 0 100%, 35% 34%);
        }
        .word-landing__rocket-fin--right {
          right: 7px;
          clip-path: polygon(0 0, 65% 34%, 100% 100%, 0 100%);
        }
        .word-landing__rocket-leg {
          position: absolute;
          bottom: 2px;
          width: 2px;
          height: 27px;
          background: #b9c0cb;
          transform-origin: top;
        }
        .word-landing__rocket-leg--left {
          left: 24px;
          transform: rotate(24deg);
        }
        .word-landing__rocket-leg--right {
          right: 24px;
          transform: rotate(-24deg);
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
        }
        .word-landing__person {
          position: absolute;
          z-index: 3;
          left: calc(50% + 58px);
          bottom: clamp(72px, 11vh, 105px);
          width: 36px;
          height: 57px;
          pointer-events: none;
          filter: drop-shadow(0 0 9px rgba(255,255,255,.5));
          animation: personArrive .55s ease-out calc(var(--landing-time) + .2s) both;
        }
        .word-landing__person-head {
          position: absolute;
          top: 0;
          left: 7px;
          width: 22px;
          height: 22px;
          border: 2px solid #fff;
          border-radius: 50%;
          box-sizing: border-box;
          background: #fff;
        }
        .word-landing__person-body {
          position: absolute;
          top: 21px;
          left: 9px;
          width: 18px;
          height: 23px;
          border-radius: 7px 7px 5px 5px;
          background: linear-gradient(90deg, #dce8f5, #fff 58%, #cbd8e8);
        }
        .word-landing__person-arm,
        .word-landing__person-leg {
          position: absolute;
          width: 4px;
          border-radius: 999px;
          background: #fff;
          transform-origin: 50% 0;
        }
        .word-landing__person-arm {
          top: 24px;
          height: 20px;
        }
        .word-landing__person-arm--left {
          left: 9px;
          transform: rotate(31deg);
        }
        .word-landing__person-arm--right {
          right: 8px;
          transform: rotate(-31deg);
        }
        .word-landing__person-leg {
          top: 41px;
          height: 16px;
        }
        .word-landing__person-leg--left {
          left: 14px;
          transform: rotate(10deg);
        }
        .word-landing__person-leg--right {
          right: 13px;
          transform: rotate(-10deg);
        }
        .word-landing__person-held-flag {
          position: absolute;
          z-index: -1;
          top: 8px;
          left: 31px;
          width: 2px;
          height: 43px;
          border-radius: 999px;
          background: #fff;
          transform: rotate(-7deg);
          transform-origin: 50% 100%;
          box-shadow: 0 0 5px rgba(255,255,255,.45);
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
          box-shadow: 0 0 8px rgba(255,50,65,.55);
        }
        .word-landing__choice {
          position: absolute;
          z-index: 2;
          bottom: clamp(58px, 8vh, 78px);
          isolation: isolate;
          min-width: 172px;
          min-height: 64px;
          padding: 16px 28px;
          border: 0;
          border-radius: 50%;
          color: rgba(248,250,255,.96);
          background: radial-gradient(
            ellipse at 50% 50%,
            rgba(3,6,12,.7) 0 34%,
            rgba(0,0,0,.5) 42%,
            rgba(255,255,255,.14) 51%,
            rgba(0,0,0,.2) 59%,
            transparent 73%
          );
          box-shadow: none;
          font: inherit;
          font-size: .82rem;
          font-weight: 700;
          letter-spacing: .1em;
          cursor: pointer;
          transition: filter 240ms ease, box-shadow 240ms ease;
          will-change: transform;
        }
        .word-landing__choice:hover {
          filter: brightness(1.22);
          transform: scale(1.025);
        }
        .word-landing__cloud-label {
          position: relative;
          z-index: 3;
          text-shadow: 0 1px 5px rgba(0,0,0,.85);
        }
        .word-landing__cloud-particles {
          display: none;
        }
        .word-landing__cloud-particle {
          position: absolute;
          left: var(--particle-x);
          top: var(--particle-y);
          width: var(--particle-size);
          height: var(--particle-size);
          border-radius: 50%;
          background: rgba(250,253,255,.88);
          box-shadow:
            0 0 7px rgba(241,249,255,.9),
            0 0 13px var(--planet-glow);
          filter: blur(.25px);
          opacity: 0;
          animation: cloudParticleRise var(--particle-duration) ease-in-out var(--particle-delay) infinite;
        }
        .word-landing__choice::before {
          content: "";
          position: absolute;
          z-index: 0;
          inset: 16px 30px;
          border-radius: 50%;
          background:
            radial-gradient(circle at 18% 62%, rgba(255,255,255,.08) 0 2px, transparent 3px),
            radial-gradient(circle at 78% 32%, rgba(0,0,0,.36) 0 3px, transparent 4px),
            radial-gradient(circle at 58% 72%, rgba(255,255,255,.06) 0 2px, transparent 3px);
          opacity: .72;
          pointer-events: none;
        }
        .word-landing__choice::after {
          display: none;
        }
        .word-landing__choice--left {
          right: calc(50% + 76px);
          animation: uiReveal .5s ease-out calc(var(--landing-time) + .55s) both;
        }
        .word-landing__choice--right {
          left: calc(50% + 76px);
          animation: uiReveal .5s ease-out calc(var(--landing-time) + .65s) both;
        }
        .word-landing__choice.is-active {
          filter: brightness(1.18);
        }
        .word-landing__planted {
          position: absolute;
          z-index: 2;
          left: var(--flag-left);
          bottom: var(--flag-bottom);
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
        @keyframes flagPlant {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(12px) scale(.72);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }
        @keyframes cloudFloat {
          0%, 100% {
            transform: translateY(0) rotate(-.35deg);
          }
          50% {
            transform: translateY(-10px) rotate(.35deg);
          }
        }
        @keyframes cloudVapor {
          0%, 100% {
            transform: translateX(-2px) scale(1);
            opacity: .88;
          }
          50% {
            transform: translateX(3px) scale(1.035, .97);
            opacity: 1;
          }
        }
        @keyframes cloudMist {
          0%, 100% {
            transform: translateX(4px) scale(.98);
            opacity: .58;
          }
          50% {
            transform: translateX(-5px) scale(1.06);
            opacity: .8;
          }
        }
        @keyframes cloudParticleRise {
          0% {
            opacity: 0;
            transform: translate(0, 8px) scale(.35);
          }
          24% {
            opacity: .82;
          }
          64% {
            opacity: .5;
          }
          100% {
            opacity: 0;
            transform: translate(var(--particle-drift), -30px) scale(1.9);
          }
        }
        @keyframes planetRise {
          from {
            opacity: 0;
            transform: translate(-50%, 106%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 88%);
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
        @keyframes personArrive {
          from {
            opacity: 0;
            transform: translateX(-18px) scale(.82);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        @keyframes rocketLanding {
          0% {
            opacity: 0;
            transform: translateX(calc(-50% - 94vw)) translateY(-58vh) rotate(105deg) scale(.92);
          }
          4% {
            opacity: 1;
            transform: translateX(calc(-50% - 74vw)) translateY(-53vh) rotate(105deg) scale(.94);
          }
          10% {
            transform: translateX(calc(-50% - 46vw)) translateY(-45vh) rotate(106deg) scale(.96);
          }
          14% {
            transform: translateX(calc(-50% - 12vw)) translateY(-36vh) rotate(106deg) scale(.98);
          }
          17% {
            transform: translateX(calc(-50% + 20vw)) translateY(-27vh) rotate(107deg) scale(1);
          }
          19% {
            transform: translateX(calc(-50% + 25vw)) translateY(-14vh) rotate(140deg) scale(1);
          }
          21% {
            transform: translateX(calc(-50% + 29vw)) translateY(-8vh) rotate(175deg) scale(.998);
          }
          22% {
            transform: translateX(calc(-50% + 26vw)) translateY(-4vh) rotate(210deg) scale(.995);
          }
          24% {
            transform: translateX(calc(-50% + 19vw)) translateY(-2vh) rotate(245deg) scale(.99);
          }
          25% {
            transform: translateX(calc(-50% + 10vw)) translateY(-2vh) rotate(280deg) scale(.985);
          }
          26% {
            transform: translateX(calc(-50% + 3vw)) translateY(-6vh) rotate(315deg) scale(.98);
          }
          31% {
            transform: translateX(-50%) translateY(-12vh) rotate(345deg) scale(.978);
          }
          36% {
            transform: translateX(-50%) translateY(-20vh) rotate(360deg) scale(.98);
          }
          45% {
            transform: translateX(-50%) translateY(-32vh) rotate(360deg) scale(.985);
            animation-timing-function: cubic-bezier(.22,.55,.2,1);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) rotate(360deg) scale(1);
          }
        }
        @keyframes landingThruster {
          0%, 18% {
            opacity: .92;
            transform: translateX(-50%) scaleY(1);
          }
          48% {
            opacity: .8;
            transform: translateX(-50%) scaleY(.72);
          }
          74% {
            opacity: 1;
            transform: translateX(-50%) scaleY(1.18);
          }
          88% {
            opacity: .42;
            transform: translateX(-50%) scaleY(.32);
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) scaleY(0);
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
          .word-landing__planet {
            width: 1200px;
          }
          .word-landing__rocket {
            bottom: 92px;
          }
          .word-landing__person {
            left: calc(50% + 50px);
            bottom: 92px;
          }
          .word-landing__word-beam {
            bottom: 200px;
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
            bottom: 72px;
            min-width: 150px;
            min-height: 58px;
            padding: 12px 16px;
            font-size: .74rem;
          }
          .word-landing__choice--left {
            right: calc(50% + 48px);
          }
          .word-landing__choice--right {
            left: calc(50% + 48px);
          }
          .word-landing__planted {
            bottom: var(--flag-mobile-bottom);
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
          .word-landing__rocket::before,
          .word-landing__rocket::after {
            animation: none;
          }
          .word-landing__word-beam {
            display: none;
          }
        }
      `}</style>

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

      <div
        key={getEmotionWordSlug(plot)}
        className="word-landing__rocket"
        aria-label={`${plot.word_id}の星に着陸したロケット`}
        style={{
          '--rocket-color': uiTheme.accent,
          '--planet-glow': uiTheme.accentGlow,
        } as CSSProperties}
      >
        <div className="word-landing__rocket-shadow" />
        <div className="word-landing__rocket-fin word-landing__rocket-fin--left" />
        <div className="word-landing__rocket-fin word-landing__rocket-fin--right" />
        <div className="word-landing__rocket-body">
          <div className="word-landing__rocket-window" />
          <div className="word-landing__rocket-band" />
        </div>
        <div className="word-landing__rocket-leg word-landing__rocket-leg--left" />
        <div className="word-landing__rocket-leg word-landing__rocket-leg--right" />
      </div>

      <div className="word-landing__person" aria-label="ロケットの横に立つ人">
        <span className="word-landing__person-held-flag" />
        <span className="word-landing__person-head" />
        <span className="word-landing__person-body" />
        <span className="word-landing__person-arm word-landing__person-arm--left" />
        <span className="word-landing__person-arm word-landing__person-arm--right" />
        <span className="word-landing__person-leg word-landing__person-leg--left" />
        <span className="word-landing__person-leg word-landing__person-leg--right" />
      </div>

      {activePanel === null && closingPanel === null && (
        <>
          <button
            type="button"
            className="word-landing__choice word-landing__choice--left"
            onClick={() => togglePanel('compose')}
            style={{
              '--choice-border': uiTheme.accentBorderStrong,
              '--choice-panel': uiTheme.panelBackground,
              '--planet-glow': uiTheme.accentGlow,
            } as CSSProperties}
          >
            <CloudButtonContent label="旗を立てる" />
          </button>
          <button
            type="button"
            className="word-landing__choice word-landing__choice--right"
            onClick={() => togglePanel('meaning')}
            style={{
              '--choice-border': uiTheme.accentBorderStrong,
              '--choice-panel': uiTheme.panelBackground,
              '--planet-glow': uiTheme.accentGlow,
            } as CSSProperties}
          >
            <CloudButtonContent label="意味を表示" />
          </button>
        </>
      )}

      {flags.map((flag, index) => {
        const slotIndex = index % FLAG_SLOTS.length;
        const slot = FLAG_SLOTS[slotIndex];
        const row = Math.floor(index / FLAG_SLOTS.length) % 4;
        const isExpanded = expandedFlagId === flag.id;
        return (
          <button
            key={flag.id}
            type="button"
            className={`word-landing__planted${isExpanded ? ' is-expanded' : ''}${slot > 50 ? ' is-leftward' : ''}`}
            aria-expanded={isExpanded}
            aria-label={`${formatFlagDate(flag.createdAt)} ${formatFlagTime(flag.createdAt)}に立てた旗`}
            onClick={() => setExpandedFlagId((current) => current === flag.id ? null : flag.id)}
            style={{
              '--flag-left': `${slot}%`,
              '--flag-bottom': `${FLAG_SURFACE_BOTTOMS[slotIndex] + row * 8}px`,
              '--flag-mobile-bottom': `${112 + row * 8}px`,
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

      <div
        className="word-landing__planet"
        aria-hidden
        style={{
          '--planet-color': uiTheme.accent,
          '--planet-light': uiTheme.accentSoft,
          '--planet-glow': uiTheme.accentGlow,
        } as CSSProperties}
      />
    </main>
  );
}
