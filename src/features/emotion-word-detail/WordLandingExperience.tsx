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

/** 旗を立てるモーションの進行状態。
 * walk-across=ジェム横から横移動 / walk-depth=斜面を奥へ縦移動 / plant=旗を刺す動作中
 */
interface PlantingState {
  flag: PlantedFlag;
  /** いま向かっている／立っている画面位置 */
  spot: { x: number; bottom: number };
  /** 最終的に旗を刺す場所（カメラはこの地点を中央へ回す） */
  targetSpot: { x: number; bottom: number };
  phase: 'walk-across' | 'walk-depth' | 'plant';
}

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

function GemButtonContent({
  label,
  color,
  selected = false,
}: {
  label: string;
  color: string;
  selected?: boolean;
}) {
  return (
    <>
      <span className="word-landing__choice-shadow" aria-hidden />
      <span
        className={`word-landing__choice-gem${selected ? ' is-selected' : ''}`}
        aria-hidden
      >
        <OctahedronIcon color={color} size={150} active={selected} />
      </span>
      {!selected && <span className="word-landing__choice-bubble">{label}</span>}
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
  /** 旗を立てるモーション（歩いて行って刺す）の進行状態 */
  const [planting, setPlanting] = useState<PlantingState | null>(null);
  /** 文章入力後に旗を星の中央へフォーカスしているか */
  const [flagsFocused, setFlagsFocused] = useState(false);
  /** 旗からロケットの横へ歩いて戻っている最中か（移動をゆっくりにして歩きに見せる） */
  const [returningHome, setReturningHome] = useState(false);
  /** このセッション中に刺した旗。地面から生えるアニメーションを付ける
      （ページ読込時からある旗は着陸演出に合わせて遅れて現れる） */
  const sessionPlantedIdsRef = useRef(new Set<string>());
  const plantTimersRef = useRef<number[]>([]);

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
    const surfaceBottom = 0.2 * vh; // CSSの --surface-bottom: 20% と対
    const centerBottom = surfaceBottom - radius; // 惑星中心のbottom座標(px)
    /* ジェムは画面下部、中央と両端の間くらい（星の斜面上）に置く */
    const gemX = vw * (vw <= 640 ? 0.25 : 0.28); // 中央からの水平オフセット
    const gemBottom = 0.06 * vh;
    return { vw, vh, radius, surfaceBottom, centerBottom, gemX, gemBottom };
  }, []);

  /** 画面上の位置(中心からのx, bottom) → 惑星中心まわりの角度(時計回り正)と距離 */
  const toPolar = (x: number, bottomPx: number) => {
    const y = bottomPx - surface.centerBottom;
    return { angle: Math.atan2(x, y), radius: Math.hypot(x, y) };
  };

  // 演出の順序：
  //   1) ジェムが押されたら照射を「角度が狭まり一本の線→引っ込む」で閉じ、単語名も消す（0.6s）
  //   2) 閉じ終わってから星の回転を開始する（rotationPanelを遅れて反映）
  //   3) 回転が落ち着いてから、ジェム（星の中央）から「線が伸びる→角度が広がる」で照射を開く
  // 閉じるときも同じ順序で、最後に単語への照射へ戻る
  const [beamPhase, setBeamPhase] = useState<'word' | 'off' | 'panel'>('word');
  /** 回転を駆動するパネル状態。activePanelから照射の消灯アニメーションぶん遅れて追従する */
  const [rotationPanel, setRotationPanel] = useState<LandingPanel | null>(null);
  /** 消灯中(off)のビーム形状。直前に照射していた対象（null=単語）を保ち、引っ込む向きを揃える */
  const [beamOffMode, setBeamOffMode] = useState<LandingPanel | null>(null);
  /** 一度でもパネル開閉を経たか。初回着陸の照射と、パネルを閉じたあとの再照射を区別する */
  const [beamCycled, setBeamCycled] = useState(false);
  const beamPhaseInitRef = useRef(true);
  const prevPanelRef = useRef<LandingPanel | null>(null);
  useEffect(() => {
    if (beamPhaseInitRef.current) {
      beamPhaseInitRef.current = false;
      prevPanelRef.current = activePanel;
      return;
    }
    setBeamOffMode(prevPanelRef.current);
    prevPanelRef.current = activePanel;
    setBeamCycled(true);
    setBeamPhase('off');
    const rotateTimer = window.setTimeout(() => setRotationPanel(activePanel), 180);
    const beamTimer = window.setTimeout(
      () => setBeamPhase(activePanel !== null ? 'panel' : 'word'),
      950,
    );
    return () => {
      window.clearTimeout(rotateTimer);
      window.clearTimeout(beamTimer);
    };
  }, [activePanel]);

  const gemAngle = toPolar(surface.gemX, surface.gemBottom).angle;
  /** 人物の立ち位置（固定）。星が回ってもここから動かない */
  const personX = 73;
  /** 球体の回転量（画面上で時計回り正）。クリックされたジェムは必ず星の中央（頂点）に来る */
  const rotationDelta =
    rotationPanel === 'meaning' ? -gemAngle : rotationPanel === 'compose' ? gemAngle : 0;

  /** 中心からxずれた位置の、惑星の円弧上のbottom座標(px) */
  const surfaceCircleBottom = (x: number) =>
    surface.centerBottom + Math.sqrt(Math.max(0, surface.radius ** 2 - x ** 2));

  /** 旗を刺す場所。ロケット（星の中央）の左側に、旗ごとに少しずつずらして並べる */
  const flagSpot = (index: number) => {
    const steps = [0, 38, 76, 19, 57, 95] as const;
    const step = steps[index % steps.length];
    const row = Math.floor(index / steps.length) % 3;
    const x = -240 - step;
    return { x, bottom: surfaceCircleBottom(x) + row * 8 };
  };

  /** クリックで開いている旗のインデックス。通常時はこの旗を星の中央へ回す */
  const expandedFlagIndex = expandedFlagId
    ? flags.findIndex((flag) => flag.id === expandedFlagId)
    : -1;
  /** 旗を中央へ向けるための目標地点。
   * 植えモーション中は刺す予定の場所、刺したあとは実際の旗、
   * 通常時は選択（展開）されている旗。
   * これがあるあいだはメイン（ロケット）画角へ戻さない */
  const flagFocusSpot = planting
    ? planting.targetSpot
    : expandedFlagIndex >= 0
      ? flagSpot(expandedFlagIndex)
      : flagsFocused && flags.length > 0
        ? flagSpot(flags.length - 1)
        : null;
  const flagFocusAngle = flagFocusSpot
    ? toPolar(flagFocusSpot.x, flagFocusSpot.bottom).angle
    : 0;
  /** 惑星全体の回転。ジェム選択時はジェムへ、植え〜旗フォーカス中は旗へ合わせる */
  const planetRotationDelta =
    rotationPanel !== null ? rotationDelta : flagFocusSpot ? -flagFocusAngle : 0;
  const planetPitchRad = rotationPanel !== null || flagFocusSpot !== null ? -0.22 : 0;

  /** 基準位置を球体の回転ぶんだけ回した配置（位置＋傾き）を返す。liftPxで半径方向に浮かせられる */
  const placeOnSurface = (x: number, bottomPx: number, liftPx = 0, yaw = rotationDelta) => {
    const p = toPolar(x, bottomPx);
    const a = p.angle + yaw;
    const r = p.radius + liftPx;
    return {
      x: r * Math.sin(a),
      bottom: surface.centerBottom + r * Math.cos(a),
      angleRad: a,
    };
  };

  const focusedFlagPlace = flagFocusSpot
    ? placeOnSurface(flagFocusSpot.x, flagFocusSpot.bottom, 0, planetRotationDelta)
    : null;

  /** 植えモーション中の人の位置。カメラ（星の回転）に乗せて旗の場所へ歩く */
  const personPlantPlace = planting
    ? placeOnSurface(planting.spot.x, planting.spot.bottom, 0, planetRotationDelta)
    : null;

  /** 人物の画面上の立ち位置。意味表示中はジェムの左側（画面左下）へ、
      旗を立てる表示中はジェムの右側（画面右下）へ歩いて移動する。
      旗を刺しに行くときは植え場所へ。刺したあとも旗の左側に留まる */
  const personCurrentX = personPlantPlace
    ? personPlantPlace.x - 12
    : flagsFocused && focusedFlagPlace
      ? focusedFlagPlace.x - 12
      : rotationPanel === 'meaning' ? -110 : rotationPanel === 'compose' ? personX + 60 : personX;
  /** 人物の足元の高さ。植えに行くとき／旗フォーカス時は斜面（円弧）上に立つ */
  const personBottom = personPlantPlace
    ? personPlantPlace.bottom - 2
    : flagsFocused && focusedFlagPlace
      ? focusedFlagPlace.bottom - 2
      : rotationPanel !== null
        ? surface.surfaceBottom - 30
        : surface.surfaceBottom;

  // 星が回転して立ち位置が変わる間、人物に歩行モーションを付ける
  const [personWalking, setPersonWalking] = useState(false);
  const prevRotationRef = useRef(planetRotationDelta);
  useEffect(() => {
    if (prevRotationRef.current === planetRotationDelta) {
      return;
    }
    prevRotationRef.current = planetRotationDelta;
    setPersonWalking(true);
    const timer = window.setTimeout(() => setPersonWalking(false), 850);
    return () => window.clearTimeout(timer);
  }, [planetRotationDelta]);
  /** 惑星回転の歩行タイマーが終了しても、植え場所への移動中・帰り道は歩行を継続する */
  const personIsWalking =
    personWalking
    || planting?.phase === 'walk-across'
    || planting?.phase === 'walk-depth'
    || returningHome;

  const typeLabel = wordTypeLabel(plot.wordType);
  const wordBeamWidth = Math.min(620, Math.max(180, Array.from(plot.word_id).length * 82));
  const panelBeamMode = activePanel ?? closingPanel;
  /** ビームの形状（幅・高さ・根元位置）を決めるパネル。消灯中は直前の照射対象の形のまま引っ込める */
  const beamGeometryPanel =
    beamPhase === 'panel' ? panelBeamMode : beamPhase === 'off' ? beamOffMode : null;

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey(plot)) ?? '';
    setSentence('');
    setFlags(readStoredFlags(saved, plot.word_id));
    setExpandedFlagId(null);
    setActivePanel(null);
    setClosingPanel(null);
    setRotationPanel(null);
    setBeamPhase('word');
    setBeamOffMode(null);
    setBeamCycled(false);
    prevPanelRef.current = null;
    setBeamReady(false);
    setPlanting(null);
    setFlagsFocused(false);
    setReturningHome(false);
    sessionPlantedIdsRef.current = new Set();
    plantTimersRef.current.forEach((id) => window.clearTimeout(id));
    plantTimersRef.current = [];
    const timer = window.setTimeout(() => setBeamReady(true), 4800);
    return () => window.clearTimeout(timer);
  }, [plot]);

  const closePanel = (panel: LandingPanel) => {
    if (activePanel !== panel) return;
    setActivePanel(null);
    setClosingPanel(panel);
  };

  const togglePanel = (panel: LandingPanel) => {
    if (planting !== null) {
      return;
    }
    if (activePanel === panel) {
      closePanel(panel);
      return;
    }
    // 旗のそばにいる状態から離れるときは、歩きながらロケット画角へ戻す
    if (flagsFocused) {
      setFlagsFocused(false);
      setReturningHome(true);
      setPersonWalking(true);
      plantTimersRef.current.push(
        window.setTimeout(() => {
          setReturningHome(false);
          setPersonWalking(false);
        }, 1400),
      );
    }
    setClosingPanel(null);
    setActivePanel(panel);
  };

  /** 決定後のモーション（旗までで完結）：
   * パネルを閉じる（カメラはジェムのまま）→旗の場所へ歩きながら旗が中央になるよう回す
   * →旗を刺す→人は旗の右側に立つ
   */
  const plantFlag = () => {
    const next = sentence.trim();
    if (!next || !sentenceContainsWord(next, plot.word_id) || planting !== null) {
      return;
    }
    const newFlag: PlantedFlag = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sentence: next,
      createdAt: new Date().toISOString(),
    };
    const targetSpot = flagSpot(flags.length);
    // 最初は植え場所と同じ横位置まで歩く。高さはジェム横のまま保ち、ワープに見せない。
    const acrossWaypoint = {
      x: targetSpot.x,
      bottom: surface.surfaceBottom - 30,
    };
    setSentence('');
    setExpandedFlagId(null);
    setFlagsFocused(false);
    setReturningHome(false);
    // 先に planting を立ててからパネルを閉じる。
    // これで回転が「ジェム→（ロケットを経由せず）旗」になる
    setPlanting({
      flag: newFlag,
      spot: acrossWaypoint,
      targetSpot,
      phase: 'walk-across',
    });
    closePanel('compose');
    setPersonWalking(true);

    const timers = plantTimersRef.current;
    // 横移動後、同じx位置のまま斜面を奥行き方向へ縦に歩く
    timers.push(window.setTimeout(() => {
      setPlanting((current) =>
        current ? { ...current, spot: targetSpot, phase: 'walk-depth' } : current,
      );
    }, 875));
    // 刺す動作と同時に旗を確定（この時点で旗はすでに中央付近）
    timers.push(window.setTimeout(() => {
      setPlanting((current) => (current ? { ...current, phase: 'plant' } : current));
      sessionPlantedIdsRef.current.add(newFlag.id);
      setFlags((current) => {
        const nextFlags = [...current, newFlag];
        window.localStorage.setItem(storageKey(plot), JSON.stringify(nextFlags));
        return nextFlags;
      });
      setFlagsFocused(true);
    }, 1375));
    // 刺し終わったら人はそのまま旗の左側に留まる（ここで植えアクションは終了）
    timers.push(window.setTimeout(() => {
      setPlanting(null);
    }, 2050));
  };

  useEffect(
    () => () => {
      plantTimersRef.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  const deleteFlag = (flagId: string) => {
    const nextFlags = flags.filter((flag) => flag.id !== flagId);
    window.localStorage.setItem(storageKey(plot), JSON.stringify(nextFlags));
    setFlags(nextFlags);
    setExpandedFlagId((current) => (current === flagId ? null : current));
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
          /* 地平線は画面上端から80%（星の見える縦幅は画面の20%）。足元はこの高さに揃える。 */
          --surface-bottom: 20%;
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 620px;
          overflow: hidden;
          isolation: isolate;
        }
        /* 星の回転に合わせて空ごと回すため、回転して端が見えないよう一回り大きく取る。
           回転の中心は惑星の中心（インラインのtransform-originで指定） */
        .word-landing__stars {
          position: absolute;
          inset: -40%;
          z-index: 0;
          pointer-events: none;
          transition: transform .8s cubic-bezier(.25,.6,.25,1);
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
        /* 照射と同じタイミングで単語名などを消す／再表示する */
        .word-landing__identity-title {
          transition: opacity .18s ease;
        }
        .word-landing__identity-title.is-hidden {
          opacity: 0;
        }
        /* 再表示は照射の角度が広がり始めた(0.16s)より少し遅れて、中央から左右へ開く */
        .word-landing__identity-title.is-reveal {
          animation: titleCenterReveal .32s cubic-bezier(.3,.6,.25,1) .25s both;
        }
        @keyframes titleCenterReveal {
          0% {
            opacity: 0;
            clip-path: inset(0 50% 0 50%);
            filter: blur(5px);
          }
          30% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            clip-path: inset(0 0 0 0);
            filter: blur(0);
          }
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
          /* ロケット(156px)の先端あたりから放つ */
          bottom: calc(var(--surface-bottom) + 146px);
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
        /* パネル照射は星の中央に来たジェムの上端から放つ。
           開くときは一本の線がまっすぐ上に伸びてから角度を広げる */
        .word-landing__word-beam.is-meaning,
        .word-landing__word-beam.is-compose {
          opacity: .55;
          /* 星の中央に来たジェムのコア（中心）から放つ。
             ジェムは地平線+28pxに持ち上がり、選択中はラベルなしで8面体(88px)+padding(6px)のみ。
             コア＝8面体の中心は底辺から 28+6+75=109px */
          bottom: calc(var(--surface-bottom) + 78px);
          animation: beamOpen .32s cubic-bezier(.3,.6,.25,1) both;
          filter: drop-shadow(0 0 18px var(--word-beam-glow));
        }
        /* 消灯アニメーション：角度が狭まって一本の線になり、根元へ引っ込む。
           これが終わってから星の回転が始まる */
        .word-landing__word-beam.is-off {
          animation: beamClose .18s cubic-bezier(.5,.05,.7,.4) both !important;
        }
        @keyframes beamOpen {
          0% {
            opacity: 0;
            transform: translateX(-50%) scaleX(.02) scaleY(0);
          }
          18% {
            opacity: .8;
          }
          50% {
            opacity: .8;
            transform: translateX(-50%) scaleX(.02) scaleY(1);
          }
          100% {
            opacity: .55;
            transform: translateX(-50%) scaleX(1) scaleY(1);
          }
        }
        @keyframes beamClose {
          0% {
            opacity: .55;
            transform: translateX(-50%) scaleX(1) scaleY(1);
          }
          50% {
            opacity: .8;
            transform: translateX(-50%) scaleX(.02) scaleY(1);
          }
          88% {
            opacity: .8;
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) scaleX(.02) scaleY(0);
          }
        }
        .word-landing__word-beam.is-ready:not(.is-meaning):not(.is-compose) {
          animation: wordBeamIdle 3.8s ease-in-out infinite;
          opacity: .4;
        }
        /* パネルを閉じたあとの単語への再照射も「線が伸びる→角度が広がる」で開く */
        .word-landing__word-beam.is-ready.is-word-open:not(.is-meaning):not(.is-compose) {
          animation:
            beamOpenWord .32s cubic-bezier(.3,.6,.25,1) both,
            wordBeamIdle 3.8s ease-in-out .32s infinite;
        }
        @keyframes beamOpenWord {
          0% {
            opacity: 0;
            transform: translateX(-50%) scaleX(.02) scaleY(0);
          }
          18% {
            opacity: .7;
          }
          50% {
            opacity: .7;
            transform: translateX(-50%) scaleX(.02) scaleY(1);
          }
          100% {
            opacity: .4;
            transform: translateX(-50%) scaleX(1) scaleY(1);
          }
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
          /* 消灯(0.18s)→回転(約0.8s)→照射の角度が広がり始める(1.11s)より少し遅れて、
             真ん中から左右へ徐々に表示する */
          animation: projectionAppear .32s cubic-bezier(.3,.6,.25,1) 1.2s both;
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
          width: 102px;
          height: 156px;
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
          left: 12px;
          right: 12px;
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
        /* 旗を刺す動作：前かがみになり、持っている旗を地面へ突き立てる。
           personArrive をリストに残したまま追加する（外したときに登場アニメーションが
           再実行されて人が消えるのを防ぐ） */
        .word-landing__person.is-planting {
          animation:
            personArrive .55s ease-out calc(var(--landing-time) + .2s) both,
            personPlant .9s ease-in-out both;
        }
        @keyframes personPlant {
          0%, 100% {
            transform: translateX(-50%) rotate(0deg);
          }
          40%, 62% {
            transform: translateX(-50%) rotate(9deg) translateY(3px);
          }
        }
        .word-landing__person.is-planting .word-landing__person-held-flag {
          animation: personPlantFlag .9s ease-in-out both;
        }
        @keyframes personPlantFlag {
          0%, 100% {
            transform: rotate(-7deg) translateY(0);
          }
          40%, 62% {
            transform: rotate(3deg) translateY(8px);
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
        /* 星面に落ちるジェムの接地影。
           ジェムの傾きと逆向きに回し、画面中央側から外側の上（左は左上／右は右上）へ伸ばす */
        .word-landing__choice-shadow {
          position: absolute;
          top: 170px;
          left: 60%;
          width: 50px;
          height: 11px;
          border-radius: 50%;
          transform: translateX(-50%) rotate(calc(var(--gem-tilt, 0rad) * -1.8));
          background: rgba(20, 24, 52, .42);
          filter: blur(3px);
          pointer-events: none;
        }
        /* 影の左右位置の微調整（左のジェムは左へ、右のジェムは右へ寄せている） */
        .word-landing__choice--left .word-landing__choice-shadow {
          margin-left: -6px;
        }
        .word-landing__choice--right .word-landing__choice-shadow {
          margin-left: 22px;
        }
        .word-landing__choice-gem {
          position: relative;
          width: 150px;
          height: 150px;
          filter: drop-shadow(0 8px 10px rgba(0,0,0,.4)) drop-shadow(0 0 12px var(--planet-glow));
          /* 軸が惑星（球体）の中心を向くように傾ける */
          transform: rotate(var(--gem-tilt, 0deg));
          transition: transform 240ms ease, translate 300ms ease;
        }
        .word-landing__choice:hover .word-landing__choice-gem {
          transform: rotate(var(--gem-tilt, 0deg)) scale(1.12) translateY(-3px);
        }
        /* 選択中のジェムの特別演出：強い光背が脈打ち、波紋リングが広がり続ける。
           キャンバス描画が右へ約27pxずれるぶん、左へ寄せて照射の中心に合わせる */
        .word-landing__choice-gem.is-selected {
          translate: -27px 0;
          filter:
            drop-shadow(0 8px 10px rgba(0,0,0,.4))
            drop-shadow(0 0 20px var(--planet-glow))
            drop-shadow(0 0 42px var(--planet-glow));
        }
        .word-landing__choice-gem.is-selected::before {
          content: "";
          position: absolute;
          inset: -22px;
          z-index: -1;
          border-radius: 50%;
          background: radial-gradient(circle, var(--planet-glow) 0%, transparent 62%);
          animation: gemGlowPulse 1.4s ease-in-out infinite;
        }
        @keyframes gemGlowPulse {
          0%, 100% {
            opacity: .45;
            transform: scale(.92);
          }
          50% {
            opacity: .85;
            transform: scale(1.08);
          }
        }
        /* ラベルはジェムの上に浮かぶ、とんがりなしの楕円の吹き出し */
        .word-landing__choice-bubble {
          position: absolute;
          left: 50%;
          bottom: calc(100% - 6px);
          transform: translateX(-50%);
          /* 角が丸くフィレットされた長方形 */
          padding: 8px 16px;
          border-radius: 12px;
          background: rgba(16, 22, 46, .84);
          border: 1px solid rgba(244, 236, 247, .35);
          box-shadow: 0 0 14px var(--planet-glow);
          white-space: nowrap;
          text-shadow: 0 1px 5px rgba(0,0,0,.85);
          pointer-events: none;
          animation: bubbleFloat 3s ease-in-out infinite;
        }
        @keyframes bubbleFloat {
          0%, 100% {
            translate: 0 0;
          }
          50% {
            translate: 0 -4px;
          }
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
        /* このセッションで刺したばかりの旗は、着陸演出を待たずその場で地面から生える */
        .word-landing__planted.is-new {
          animation: flagRise .5s cubic-bezier(.2,.9,.2,1) both;
        }
        /* 旗本体はPlanetSphereの3Dシーン内で描画され、ポール（円柱）が
           月のメッシュに実際にめり込んでいる。この要素はクリック領域と
           延長ポール・吹き出し・接地影だけを受け持つ */
        /* クリックで棒（延長ポール）が上へ伸びる。
           閉じるときは布が畳まれてから縮む（transitionのdelayで順序を作る） */
        .word-landing__planted-ext {
          position: absolute;
          left: calc(50% - 1.5px);
          bottom: 74px;
          width: 3px;
          height: 96px;
          border-radius: 999px;
          background: linear-gradient(to top, #e9edf3, #ffffff);
          transform: scaleY(0);
          transform-origin: 50% 100%;
          pointer-events: none;
          transition: transform .24s ease-in .18s;
        }
        .word-landing__planted-ext::after {
          content: "";
          position: absolute;
          top: -4px;
          left: 50%;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--planted-flag);
          transform: translateX(-50%);
        }
        .word-landing__planted.is-expanded .word-landing__planted-ext {
          transform: scaleY(1);
          transition: transform .26s cubic-bezier(.2,.8,.3,1);
        }
        /* 伸びた棒の先端から、布が横へ広がって文章を見せる */
        .word-landing__planted-bubble {
          position: absolute;
          top: -88px;
          left: calc(50% + 1px);
          width: min(250px, 66vw);
          box-sizing: border-box;
          padding: 12px 36px 12px 14px;
          color: #fff;
          font-size: clamp(.62rem, 1.2vw, .76rem);
          font-weight: 650;
          line-height: 1.5;
          letter-spacing: .04em;
          text-align: left;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
          text-shadow: 0 1px 4px rgba(0,0,0,.65);
          background: linear-gradient(135deg, var(--planted-flag), rgba(255,255,255,.18));
          border-radius: 0 10px 10px 4px;
          box-shadow: 0 0 14px var(--planet-glow);
          transform: scaleX(0);
          transform-origin: 0 0;
          opacity: 0;
          pointer-events: none;
          transition: transform .26s cubic-bezier(.4,0,.7,.4), opacity .18s ease .08s;
        }
        .word-landing__planted.is-expanded .word-landing__planted-bubble {
          opacity: 1;
          transform: scaleX(1);
          pointer-events: auto;
          transition: transform .32s cubic-bezier(.2,.8,.2,1) .22s, opacity .16s ease .22s;
        }
        .word-landing__planted-delete {
          position: absolute;
          top: 6px;
          right: 6px;
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          padding: 0;
          border: 0;
          border-radius: 6px;
          color: rgba(255,255,255,.88);
          background: rgba(0,0,0,.28);
          cursor: pointer;
        }
        .word-landing__planted-delete:hover {
          color: #fff;
          background: rgba(0,0,0,.46);
        }
        .word-landing__planted-delete svg {
          width: 14px;
          height: 14px;
          display: block;
        }
        /* ポールの根元に落ちる接地影 */
        .word-landing__planted-base {
          position: absolute;
          left: calc(50% - 22px);
          bottom: -1px;
          width: 14px;
          height: 4px;
          border-radius: 999px;
          background: rgba(0,0,0,.35);
          filter: blur(1px);
          transform: translateX(-50%);
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
        /* 刺した旗が地面から生える（100%側は同じくインラインのtransformに戻す） */
        @keyframes flagRise {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(10px) scaleY(.15);
          }
          70% {
            opacity: 1;
            transform: translateX(-50%) translateY(-3px) scaleY(1.06);
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
        /* 照射の角度が広がるのに合わせて、UIを中央から左右へ開くように表示する */
        @keyframes projectionAppear {
          0% {
            opacity: 0;
            clip-path: inset(0 50% 0 50%);
            filter: blur(5px);
          }
          30% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            clip-path: inset(0 0 0 0);
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

      {/* 星（惑星）の回転に合わせて、空も惑星中心まわりに一緒に回す */}
      <div
        className="word-landing__stars"
        aria-hidden
        style={{
          transform: `rotate(${planetRotationDelta}rad)`,
          transformOrigin: `50% ${1.4 * surface.vh - surface.centerBottom}px`,
        }}
      >
        {BACKDROP_STARS.map((star, index) => (
          <span
            key={index}
            style={{
              top: `${star.topPercent}%`,
              left: `${star.leftVw}%`,
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
        <div
          className={[
            'word-landing__identity-title',
            beamPhase === 'off' ? 'is-hidden' : '',
            beamPhase !== 'off' && beamCycled ? 'is-reveal' : '',
          ].filter(Boolean).join(' ')}
          aria-hidden={beamPhase === 'off'}
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
        </div>

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
          beamPhase === 'off' ? 'is-off' : '',
          beamPhase === 'word' && beamCycled ? 'is-word-open' : '',
          beamGeometryPanel ? `is-${beamGeometryPanel}` : '',
        ].filter(Boolean).join(' ')}
        aria-hidden
        style={{
          width: beamGeometryPanel ? undefined : `min(82vw, ${wordBeamWidth}px)`,
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
          rotationPanel === 'compose' ? gemLift : 0,
        );
        const rightGemPlace = placeOnSurface(
          surface.gemX,
          surface.gemBottom,
          rotationPanel === 'meaning' ? gemLift : 0,
        );
        return (
          <>
            {/* ロケットは3D側で星の奥へ回り込むため、接地影は定位置のままフェードさせる */}
            <div
              className="word-landing__rocket"
              aria-label={`${plot.word_id}の星に着陸したロケット`}
              style={{
                opacity: rotationPanel !== null || flagFocusSpot !== null ? 0 : 1,
                transition: 'opacity .45s ease',
              }}
            >
              <div className="word-landing__rocket-shadow" />
            </div>

            <RocketModel
              key={getEmotionWordSlug(plot)}
              accent={uiTheme.accent}
              heightPx={156}
              feetBottom={(viewportHeight) => viewportHeight * 0.2}
              surfaceAngleRad={planetRotationDelta}
              surfacePitchRad={rotationPanel !== null || flagFocusSpot !== null ? -0.5 : 0}
            />

            {/* 人物は直立のまま。移動が必要なときは歩行モーションで横へ移動する */}
            <div
              className={[
                'word-landing__person',
                personIsWalking ? 'is-walking' : '',
                planting?.phase === 'plant' ? 'is-planting' : '',
              ].filter(Boolean).join(' ')}
              aria-label="ロケットの横に立つ人"
              style={{
                left: `calc(50% + ${personCurrentX}px)`,
                bottom: personBottom,
                transform: 'translateX(-50%)',
                /* 旗を刺しに行く間・戻る間は歩幅に合わせて移動し、ワープに見せない */
                transition: planting
                  ? 'left .8s cubic-bezier(.35,.5,.3,1), bottom .45s cubic-bezier(.25,.6,.25,1), transform .8s cubic-bezier(.25,.6,.25,1)'
                  : returningHome
                    ? 'left 1.4s cubic-bezier(.35,.5,.3,1), bottom .8s cubic-bezier(.25,.6,.25,1), transform .8s cubic-bezier(.25,.6,.25,1)'
                    : undefined,
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
                zIndex: rotationPanel === 'compose' ? 5 : undefined,
                '--planet-glow': uiTheme.accentGlow,
                '--gem-tilt': `${leftGemPlace.angleRad}rad`,
              } as CSSProperties}
            >
              <GemButtonContent
                label="旗を立てる"
                color={uiTheme.accent}
                selected={
                  activePanel === 'compose' ||
                  closingPanel === 'compose' ||
                  rotationPanel === 'compose'
                }
              />
            </button>
            <button
              type="button"
              className="word-landing__choice word-landing__choice--right"
              onClick={() => togglePanel('meaning')}
              style={{
                left: `calc(50% + ${rightGemPlace.x}px)`,
                bottom: rightGemPlace.bottom,
                transform: 'translateX(-50%)',
                zIndex: rotationPanel === 'meaning' ? 5 : undefined,
                '--planet-glow': uiTheme.accentGlow,
                '--gem-tilt': `${rightGemPlace.angleRad}rad`,
              } as CSSProperties}
            >
              <GemButtonContent
                label="意味を表示"
                color={uiTheme.accent}
                selected={
                  activePanel === 'meaning' ||
                  closingPanel === 'meaning' ||
                  rotationPanel === 'meaning'
                }
              />
            </button>
          </>
        );
      })()}

      {flags.map((flag, index) => {
        const isExpanded = expandedFlagId === flag.id;
        const spot = flagSpot(index);
        // 旗は星の表面に固定されている想定。ロケットと同じく星の回転に乗せて動かす
        const flagPlace = placeOnSurface(spot.x, spot.bottom, 0, planetRotationDelta);
        const isNew = sessionPlantedIdsRef.current.has(flag.id);
        return (
          <div
            key={flag.id}
            role="button"
            tabIndex={0}
            className={[
              'word-landing__planted',
              isExpanded ? 'is-expanded' : '',
              isNew ? 'is-new' : '',
            ].filter(Boolean).join(' ')}
            aria-expanded={isExpanded}
            aria-label="立てた旗"
            onClick={() => setExpandedFlagId((current) => (current === flag.id ? null : flag.id))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setExpandedFlagId((current) => (current === flag.id ? null : flag.id));
              }
            }}
            style={{
              left: `calc(50% + ${flagPlace.x}px)`,
              bottom: flagPlace.bottom,
              transform: `translateX(-50%) rotate(${flagPlace.angleRad}rad)`,
              '--planted-flag': uiTheme.accent,
              '--planet-glow': uiTheme.accentGlow,
            } as CSSProperties}
          >
            {/* クリックで上に伸びる延長ポールと、そこから横へ広がる布（文章） */}
            <span className="word-landing__planted-ext" aria-hidden />
            <span className="word-landing__planted-bubble">
              {flag.sentence}
              {isExpanded && (
                <button
                  type="button"
                  className="word-landing__planted-delete"
                  aria-label="この旗を削除"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteFlag(flag.id);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              )}
            </span>
            <span className="word-landing__planted-base" />
          </div>
        );
      })}

      {/* 画面上で時計回り正の回転量を、Three.js（反時計回り正）の角度に変換して渡す。
          パネル表示中・旗フォーカス中は手前の面がせり上がる方向（負のピッチ）にも回す。
          旗は惑星と同じ3Dシーン内で描画し、ポールを月のメッシュに実際に刺す */}
      <div className="word-landing__planet" aria-hidden>
        <PlanetSphere
          accent={uiTheme.accent}
          rotationRad={-planetRotationDelta}
          pitchRad={planetPitchRad}
          flags={flags.map((flag, index) => {
            const spot = flagSpot(index);
            const polar = toPolar(spot.x, spot.bottom);
            return { id: flag.id, angleRad: polar.angle, radiusPx: polar.radius };
          })}
        />
      </div>
    </main>
  );
}
