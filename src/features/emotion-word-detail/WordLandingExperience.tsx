import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { getBasicEmotion, getEmotionById, isBasicEmotionId } from '../../data/emotions';
import { ROUTES } from '../../routes/paths';
import type { UserPlotRow } from '../../types/userPlot';
import type { EmotionUiTheme } from '../../utils/emotionUiTheme';
import { getEmotionWordSlug } from '../../utils/emotionWordSlug';
import { wordTypeLabel } from '../../utils/emotionWordsBridge';
import { OctahedronIcon } from './OctahedronIcon';
import { PlanetSphere, wordPlanetRadius, FLAG_POLE_EXTEND_DURATION, FLAG_SIZE_DESKTOP, FLAG_SIZE_MOBILE } from './PlanetSphere';
import { FLAG_EXPAND_POLE_SCALE } from './FlagModel';
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

/** 旗枠内の文章フォント。Maxは現行の上限(1.76rem)、文字数に応じて小さくする */
function flagScrollFontSize(sentence: string): string {
  const length = Array.from(sentence).length;
  const maxRem = 1.76;
  const minRem = 0.7;
  /** この文字数までは最大サイズのまま収まる想定 */
  const fitAtMax = 40;
  if (length <= fitAtMax) {
    return `${maxRem}rem`;
  }
  const rem = Math.max(minRem, maxRem * (fitAtMax / length));
  return `${rem.toFixed(3)}rem`;
}

function GemButtonContent({
  label,
  color,
  selected = false,
  size = 150,
}: {
  label: string;
  color: string;
  selected?: boolean;
  size?: number;
}) {
  return (
    <>
      <span className="word-landing__choice-shadow" aria-hidden />
      <span
        className={`word-landing__choice-gem${selected ? ' is-selected' : ''}`}
        aria-hidden
      >
        <OctahedronIcon color={color} size={size} active={selected} />
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
  /** ポール伸長が終わり、巻物の文章枠を出してよいか */
  const [flagScrollReady, setFlagScrollReady] = useState(false);
  const flagScrollTimerRef = useRef<number | null>(null);
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
  // 球体の回転に合わせて位置と傾きを一緒に動かす。リサイズでスマホ幅にも追従する
  const [viewport, setViewport] = useState(() => ({
    vw: typeof window !== 'undefined' ? window.innerWidth : 1024,
    vh: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const onResize = () => {
      setViewport({ vw: window.innerWidth, vh: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const surface = useMemo(() => {
    const { vw, vh } = viewport;
    const radius = wordPlanetRadius(vw);
    const surfaceBottom = 0.2 * vh; // CSSの --surface-bottom: 20% と対
    const centerBottom = surfaceBottom - radius; // 惑星中心のbottom座標(px)
    const isMobile = vw <= 640;
    /* 表示領域に合わせてジェムサイズを変える（狭い画面でも最低112、広い画面は最大200） */
    const gemSize = Math.round(Math.min(200, Math.max(112, vw * 0.145)));
    const gemHalf = gemSize / 2;
    /* ジェムは画面内・星の弧上に収まる範囲で、できるだけ外側へ置く */
    const desiredGemX = vw * (isMobile ? 0.26 : 0.36);
    const maxByViewport = vw / 2 - gemHalf - (isMobile ? 8 : 16);
    const maxBySphere = radius * (isMobile ? 0.4 : 0.55);
    const gemX = Math.max(36, Math.min(desiredGemX, maxByViewport, maxBySphere));
    /* 星の円弧上に載せる（画面外や星から浮くのを防ぐ） */
    const gemBottom = centerBottom + Math.sqrt(Math.max(0, radius ** 2 - gemX ** 2));
    return {
      vw,
      vh,
      radius,
      surfaceBottom,
      centerBottom,
      gemX,
      gemBottom,
      gemSize,
      isMobile,
    };
  }, [viewport]);

  /** 画面上の位置(中心からのx, bottom) → 惑星中心まわりの角度(時計回り正)と距離 */
  const toPolar = (x: number, bottomPx: number) => {
    const y = bottomPx - surface.centerBottom;
    return { angle: Math.atan2(x, y), radius: Math.hypot(x, y) };
  };

  // 演出の順序：
  //   1) ジェムが押されたら照射を「角度が狭まり一本の線→引っ込む」で閉じ、単語名も消す（0.6s）
  //   2) 閉じ終わってから星の回転を開始する（rotationPanelを遅れて反映）
  //   3) 回転が落ち着いてから、ジェム（星の中央）から「線が伸びる→角度が広がる」で照射を開く
  // 閉じるときも同じ順序で、ロケット／画角が戻ってから単語への照射へ戻る
  const [beamPhase, setBeamPhase] = useState<'word' | 'off' | 'panel'>('word');
  /** 回転を駆動するパネル状態。activePanelから照射の消灯アニメーションぶん遅れて追従する */
  const [rotationPanel, setRotationPanel] = useState<LandingPanel | null>(null);
  /** 消灯中(off)のビーム形状。直前に照射していた対象（null=単語）を保ち、引っ込む向きを揃える */
  const [beamOffMode, setBeamOffMode] = useState<LandingPanel | null>(null);
  /** 一度でもパネル開閉を経たか。初回着陸の照射と、パネルを閉じたあとの再照射を区別する */
  const [beamCycled, setBeamCycled] = useState(false);
  /** 旗／ジェムからの復帰中、画角が戻るまで単語照射を抑止する */
  const [wordBeamSuppressed, setWordBeamSuppressed] = useState(false);
  const wordBeamSuppressTimerRef = useRef<number | null>(null);
  const beamPhaseInitRef = useRef(true);
  const prevPanelRef = useRef<LandingPanel | null>(null);

  /** 星の回転が落ち着くまで単語照射を遅らせる（着陸初回には使わない） */
  const suppressWordBeamUntilSettled = () => {
    setWordBeamSuppressed(true);
    if (wordBeamSuppressTimerRef.current !== null) {
      window.clearTimeout(wordBeamSuppressTimerRef.current);
    }
    wordBeamSuppressTimerRef.current = window.setTimeout(() => {
      setWordBeamSuppressed(false);
      wordBeamSuppressTimerRef.current = null;
    }, 1100);
  };

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
    // 単語へ戻るときは星／ロケットの移動が終わってから照射を再開する
    const beamDelay = activePanel !== null ? 950 : 1400;
    const beamTimer = window.setTimeout(
      () => setBeamPhase(activePanel !== null ? 'panel' : 'word'),
      beamDelay,
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

  /** 旗を刺す場所。
   * 1本目はロケット左、2本目は右（奥行き＝|x|は1本目と同じ）。
   * 3本目以降は左右交互に少しずつずらす。スマホでは星の半径に合わせて縮める */
  const flagSpot = (index: number) => {
    const scale = Math.min(1, surface.radius / 520);
    const maxOffset = surface.radius * (surface.isMobile ? 0.36 : 0.5);
    const firstOffset = Math.min(maxOffset, 240 * scale);

    if (index === 0) {
      const x = -firstOffset;
      return { x, bottom: surfaceCircleBottom(x) };
    }
    if (index === 1) {
      const x = firstOffset;
      return { x, bottom: surfaceCircleBottom(x) };
    }

    const pair = Math.floor(index / 2);
    const steps = [0, 38, 76, 19, 57, 95] as const;
    const step = steps[pair % steps.length];
    const row = Math.floor(pair / steps.length) % 3;
    const offset = Math.min(maxOffset, (240 + step) * scale);
    const x = index % 2 === 0 ? -offset : offset;
    return { x, bottom: surfaceCircleBottom(x) + row * 6 * scale };
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
  /** 惑星全体の回転。
   * 旗を選択中／植えモーション中は旗を中央に（ジェム選択中でも旗を優先）。
   * それ以外でジェム選択中ならジェムへ。刺しあとの旗フォーカスも旗へ合わせる */
  const flagCameraActive = planting !== null || expandedFlagIndex >= 0;
  const planetRotationDelta = flagCameraActive && flagFocusSpot
    ? -flagFocusAngle
    : rotationPanel !== null
      ? rotationDelta
      : flagFocusSpot
        ? -flagFocusAngle
        : 0;
  const planetPitchRad = rotationPanel !== null || flagFocusSpot !== null ? -0.22 : 0;

  /** 基準位置を球体の回転ぶんだけ回した配置（位置＋傾き）を返す。liftPxで半径方向に浮かせられる */
  const placeOnSurface = (x: number, bottomPx: number, liftPx = 0, yaw = planetRotationDelta) => {
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
  /** 人物の足元の高さ。
   * 旗選択中・植え後フォーカス中は、刺さった旗の根元に合わせて一段下げる
   * （expandedFlagId だけでは flagsFocused が立たないため、選択中もここで下げる） */
  const personBottom = personPlantPlace
    ? personPlantPlace.bottom - 20
    : (flagsFocused || expandedFlagIndex >= 0) && focusedFlagPlace
      ? focusedFlagPlace.bottom - 20
      : expandedFlagIndex >= 0
        ? surface.surfaceBottom - 20
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

  /** 単語の照射を隠すべきか（旗選択・植えモーション・旗そばにいるあいだ） */
  const hideWordBeam =
    expandedFlagId !== null
    || wordBeamSuppressed
    || planting !== null
    || flagsFocused;

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
    setFlagScrollReady(false);
    if (flagScrollTimerRef.current !== null) {
      window.clearTimeout(flagScrollTimerRef.current);
      flagScrollTimerRef.current = null;
    }
    setActivePanel(null);
    setClosingPanel(null);
    setRotationPanel(null);
    setBeamPhase('word');
    setBeamOffMode(null);
    setBeamCycled(false);
    prevPanelRef.current = null;
    setBeamReady(false);
    setWordBeamSuppressed(false);
    if (wordBeamSuppressTimerRef.current !== null) {
      window.clearTimeout(wordBeamSuppressTimerRef.current);
      wordBeamSuppressTimerRef.current = null;
    }
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

  /** 旗フォーカス／旗のそばにいる状態から、歩きながらロケット画角へ戻す */
  const returnToRocket = () => {
    const wasFlagView = expandedFlagId !== null || flagsFocused;
    setExpandedFlagId(null);
    setFlagScrollReady(false);
    if (flagScrollTimerRef.current !== null) {
      window.clearTimeout(flagScrollTimerRef.current);
      flagScrollTimerRef.current = null;
    }
    if (wasFlagView) {
      suppressWordBeamUntilSettled();
    }
    if (!flagsFocused) {
      return;
    }
    setFlagsFocused(false);
    setReturningHome(true);
    setPersonWalking(true);
    plantTimersRef.current.push(
      window.setTimeout(() => {
        setReturningHome(false);
        setPersonWalking(false);
      }, 1400),
    );
  };

  /** 旗を選択する。ジェムパネル表示中でもパネルを閉じて旗を中央へ回す。
   * ポールが伸び終わってから巻物の文章枠を出す */
  const selectFlag = (flagId: string) => {
    if (planting !== null) {
      return;
    }
    const nextId = expandedFlagId === flagId ? null : flagId;
    if (flagScrollTimerRef.current !== null) {
      window.clearTimeout(flagScrollTimerRef.current);
      flagScrollTimerRef.current = null;
    }
    setFlagScrollReady(false);
    if (nextId !== null && activePanel !== null) {
      closePanel(activePanel);
      setRotationPanel(null);
    }
    setExpandedFlagId(nextId);
    if (nextId !== null) {
      flagScrollTimerRef.current = window.setTimeout(() => {
        setFlagScrollReady(true);
        flagScrollTimerRef.current = null;
      }, Math.round(FLAG_POLE_EXTEND_DURATION * 1000));
    } else {
      // 旗を閉じたあとは画角がロケットへ戻ってから単語照射を再開
      suppressWordBeamUntilSettled();
    }
  };

  const togglePanel = (panel: LandingPanel) => {
    if (planting !== null) {
      return;
    }
    if (activePanel === panel) {
      closePanel(panel);
      return;
    }
    // 旗選択中／旗のそばからジェムへ移るときは、ロケット画角を挟まず直接ジェムへ回す
    if (flagsFocused || expandedFlagId !== null) {
      setExpandedFlagId(null);
      setFlagScrollReady(false);
      if (flagScrollTimerRef.current !== null) {
        window.clearTimeout(flagScrollTimerRef.current);
        flagScrollTimerRef.current = null;
      }
      setFlagsFocused(false);
      setReturningHome(false);
      // 回転目標を先にジェムへ向け、旗解除の瞬間にロケットへ戻るのを防ぐ
      setRotationPanel(panel);
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
      if (flagScrollTimerRef.current !== null) {
        window.clearTimeout(flagScrollTimerRef.current);
      }
      if (wordBeamSuppressTimerRef.current !== null) {
        window.clearTimeout(wordBeamSuppressTimerRef.current);
      }
    },
    [],
  );

  const deleteFlag = (flagId: string) => {
    const nextFlags = flags.filter((flag) => flag.id !== flagId);
    window.localStorage.setItem(storageKey(plot), JSON.stringify(nextFlags));
    setFlags(nextFlags);
    setExpandedFlagId((current) => (current === flagId ? null : current));
    if (expandedFlagId === flagId) {
      setFlagScrollReady(false);
      if (flagScrollTimerRef.current !== null) {
        window.clearTimeout(flagScrollTimerRef.current);
        flagScrollTimerRef.current = null;
      }
      suppressWordBeamUntilSettled();
    }
  };

  return (
    <main
      className="word-landing"
      style={{
        color: uiTheme.uiText,
        background: 'radial-gradient(circle at 50% 20%, #141c40 0%, #0a0f26 55%, #05070f 100%)',
        '--gem-size': `${surface.gemSize}px`,
        '--gem-shadow-top': `${Math.round(surface.gemSize * 1.13)}px`,
        '--gem-shadow-width': `${Math.round(surface.gemSize * 0.33)}px`,
        '--gem-shadow-height': `${Math.max(8, Math.round(surface.gemSize * 0.07))}px`,
        '--gem-selected-shift': `${Math.round(-surface.gemSize * 0.18)}px`,
        '--gem-glow-inset': `${Math.round(-surface.gemSize * 0.15)}px`,
      } as CSSProperties}
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
            transform: rotate(28deg) translateY(0);
          }
          40%, 62% {
            transform: rotate(8deg) translateY(8px);
          }
        }
        .word-landing__person-held-flag {
          position: absolute;
          z-index: -1;
          top: 8px;
          left: 18px;
          width: 2px;
          height: 44px;
          border-radius: 999px;
          background: #f4ecf7;
          transform: rotate(28deg);
          transform-origin: 50% 100%;
        }
        .word-landing__person-held-flag::after {
          content: "";
          position: absolute;
          top: 1px;
          left: 2px;
          width: 22px;
          height: 14px;
          background: linear-gradient(135deg, var(--held-flag), color-mix(in srgb, var(--held-flag) 55%, #1a1020));
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
          top: var(--gem-shadow-top, 170px);
          left: 60%;
          width: var(--gem-shadow-width, 50px);
          height: var(--gem-shadow-height, 11px);
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
          width: var(--gem-size, 150px);
          height: var(--gem-size, 150px);
          filter: drop-shadow(0 8px 10px rgba(0,0,0,.4)) drop-shadow(0 0 12px var(--planet-glow));
          /* 軸が惑星（球体）の中心を向くように傾ける */
          transform: rotate(var(--gem-tilt, 0deg));
          transition: transform 240ms ease, translate 300ms ease;
        }
        .word-landing__choice:hover .word-landing__choice-gem {
          transform: rotate(var(--gem-tilt, 0deg)) scale(1.12) translateY(-3px);
        }
        /* 選択中のジェムの特別演出：強い光背が脈打ち、波紋リングが広がり続ける。
           キャンバス描画のわずかなズレを左へ寄せて照射の中心に合わせる */
        .word-landing__choice-gem.is-selected {
          translate: var(--gem-selected-shift, -27px) 0;
          filter:
            drop-shadow(0 8px 10px rgba(0,0,0,.4))
            drop-shadow(0 0 20px var(--planet-glow))
            drop-shadow(0 0 42px var(--planet-glow));
        }
        .word-landing__choice-gem.is-selected::before {
          content: "";
          position: absolute;
          top: var(--gem-glow-inset, -22px);
          bottom: var(--gem-glow-inset, -22px);
          /* キャンバス描画のズレに合わせ、光背を少し右へ */
          left: calc(var(--gem-glow-inset, -22px) + 20px);
          right: calc(var(--gem-glow-inset, -22px) - 20px);
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
          /* dismiss(z-index:3)より手前にして、旗クリックを優先する */
          z-index: 4;
          /* ポール中心＋右側の布まで覆うクリック領域（3D旗の布幅に合わせる） */
          width: var(--flag-hit-w, 96px);
          height: var(--flag-hit-h, 82px);
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
            transform .8s cubic-bezier(.25,.6,.25,1),
            height .55s cubic-bezier(.25,.7,.2,1);
        }
        .word-landing__planted.is-expanded {
          z-index: 6;
          /* 3Dポールの地上に見える高さ（根元固定で3倍伸長）に合わせる */
          height: var(--expanded-pole-h, 246px);
          transform: translateX(-50%) rotate(0rad);
        }
        /* このセッションで刺したばかりの旗は、着陸演出を待たずその場で地面から生える */
        .word-landing__planted.is-new {
          animation: flagRise .5s cubic-bezier(.2,.9,.2,1) both;
        }
        /* 旗本体はPlanetSphereの3Dシーン内で描画される。
           選択後ポール伸長が終わると、棒の右から巻物のように旗形の枠が開く。
           枠は塗りつぶさず、グローのある線だけで描く */
        .word-landing__planted-scroll {
          position: absolute;
          left: calc(50% - 2px);
          top: 8px;
          bottom: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: min(336px, 86.4vw);
          height: var(--flag-scroll-h, 210px);
          box-sizing: border-box;
          padding: 14px 42px 14px 20px;
          color: #fff;
          font-size: var(--flag-scroll-font, 1.76rem);
          font-weight: 650;
          line-height: 1.55;
          letter-spacing: .04em;
          text-align: center;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
          overflow: visible;
          text-shadow: 0 0 12px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.45);
          background: transparent;
          transform: scaleX(0);
          transform-origin: 0 0;
          opacity: 0;
          pointer-events: none;
        }
        .word-landing__planted-scroll-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
          color: var(--planted-flag);
          filter:
            drop-shadow(0 0 3px var(--planet-glow))
            drop-shadow(0 0 10px var(--planet-glow))
            drop-shadow(0 0 22px var(--planet-glow));
          pointer-events: none;
        }
        .word-landing__planted-scroll-frame polygon {
          fill: color-mix(in srgb, var(--planted-flag) 28%, transparent);
          stroke: currentColor;
          stroke-width: 1.5;
          stroke-linejoin: round;
          vector-effect: non-scaling-stroke;
        }
        .word-landing__planted-scroll-text {
          position: relative;
          z-index: 1;
          display: block;
          max-width: 100%;
        }
        .word-landing__planted-scroll.is-open {
          opacity: 1;
          pointer-events: auto;
          animation: flagScrollUnfurl .55s cubic-bezier(.2,.8,.2,1) both;
        }
        @keyframes flagScrollUnfurl {
          0% {
            opacity: 0;
            transform: scaleX(0.04) scaleY(0.92);
            filter: brightness(1.2);
          }
          35% {
            opacity: 1;
            filter: brightness(1.08);
          }
          100% {
            opacity: 1;
            transform: scaleX(1) scaleY(1);
            filter: brightness(1);
          }
        }
        .word-landing__planted-delete {
          position: absolute;
          z-index: 2;
          top: 6px;
          right: 28px;
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
          .word-landing__choice:hover .word-landing__choice-gem {
            transform: rotate(var(--gem-tilt, 0deg)) scale(1.08) translateY(-2px);
          }
          .word-landing__choice--left .word-landing__choice-shadow {
            margin-left: -4px;
          }
          .word-landing__choice--right .word-landing__choice-shadow {
            margin-left: 14px;
          }
          .word-landing__choice-bubble {
            padding: 6px 12px;
            font-size: .68rem;
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
            /telescope/{getEmotionWordSlug(plot)}
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
            beamPhase === 'off' || hideWordBeam ? 'is-hidden' : '',
            beamPhase !== 'off' && !hideWordBeam && beamCycled ? 'is-reveal' : '',
          ].filter(Boolean).join(' ')}
          aria-hidden={beamPhase === 'off' || hideWordBeam}
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
          beamPhase === 'off' || hideWordBeam ? 'is-off' : '',
          beamPhase === 'word' && !hideWordBeam && beamCycled ? 'is-word-open' : '',
          beamGeometryPanel ? `is-${beamGeometryPanel}` : '',
        ].filter(Boolean).join(' ')}
        aria-hidden
        style={{
          width: beamGeometryPanel ? undefined : `min(82vw, ${wordBeamWidth}px)`,
          '--word-beam-core': uiTheme.accentSoft,
          '--word-beam-glow': uiTheme.accentGlow,
        } as CSSProperties}
      />

      {(activePanel !== null || closingPanel !== null || expandedFlagId !== null) && (
        <button
          type="button"
          className="word-landing__dismiss"
          aria-label="表示を閉じる"
          onClick={() => {
            if (activePanel) {
              closePanel(activePanel);
              return;
            }
            if (expandedFlagId !== null) {
              returnToRocket();
            }
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
          !flagCameraActive && rotationPanel === 'compose' ? gemLift : 0,
        );
        const rightGemPlace = placeOnSurface(
          surface.gemX,
          surface.gemBottom,
          !flagCameraActive && rotationPanel === 'meaning' ? gemLift : 0,
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
                '--held-flag': uiTheme.accent,
                /* 旗を刺しに行く間・戻る間は歩幅に合わせて移動し、ワープに見せない */
                transition: planting
                  ? 'left .8s cubic-bezier(.35,.5,.3,1), bottom .45s cubic-bezier(.25,.6,.25,1), transform .8s cubic-bezier(.25,.6,.25,1)'
                  : returningHome
                    ? 'left 1.4s cubic-bezier(.35,.5,.3,1), bottom .8s cubic-bezier(.25,.6,.25,1), transform .8s cubic-bezier(.25,.6,.25,1)'
                    : undefined,
              } as CSSProperties}
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
                size={surface.gemSize}
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
                size={surface.gemSize}
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
        const showScroll = isExpanded && flagScrollReady;
        const spot = flagSpot(index);
        // 旗は星の表面に固定されている想定。ロケットと同じく星の回転に乗せて動かす
        const flagPlace = placeOnSurface(spot.x, spot.bottom, 0, planetRotationDelta);
        const isNew = sessionPlantedIdsRef.current.has(flag.id);
        const flagSizePx = surface.isMobile ? FLAG_SIZE_MOBILE : FLAG_SIZE_DESKTOP;
        /* 根元固定で3倍伸長したとき、地表から上に見えるポール長 */
        const expandedPoleH = flagSizePx * (FLAG_EXPAND_POLE_SCALE - 0.5);
        /* ポール＋右側の布を覆うヒット領域（布幅0.46・地上に見える高さ〜0.55） */
        const flagHitW = Math.round(flagSizePx * 1.05);
        const flagHitH = Math.round(flagSizePx * 0.58);
        /* 従来の枠（約70px）の3倍 */
        const scrollH = 210;
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
            onClick={() => selectFlag(flag.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectFlag(flag.id);
              }
            }}
            style={{
              left: `calc(50% + ${flagPlace.x}px)`,
              bottom: flagPlace.bottom,
              /* 選択中は3Dポールと同様に画面に対してまっすぐ立てる */
              transform: isExpanded
                ? 'translateX(-50%) rotate(0rad)'
                : `translateX(-50%) rotate(${flagPlace.angleRad}rad)`,
              '--planted-flag': uiTheme.accent,
              '--planet-glow': uiTheme.accentGlow,
              '--expanded-pole-h': `${expandedPoleH}px`,
              '--flag-scroll-h': `${scrollH}px`,
              '--flag-hit-w': `${flagHitW}px`,
              '--flag-hit-h': `${flagHitH}px`,
            } as CSSProperties}
          >
            {showScroll && (
              <div
                className="word-landing__planted-scroll is-open"
                onClick={(event) => event.stopPropagation()}
                style={{
                  '--flag-scroll-font': flagScrollFontSize(flag.sentence),
                } as CSSProperties}
              >
                <svg
                  className="word-landing__planted-scroll-frame"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <polygon points="1.5,1.5 98.5,1.5 84,50 98.5,98.5 1.5,98.5" />
                </svg>
                <span className="word-landing__planted-scroll-text">{flag.sentence}</span>
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
              </div>
            )}
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
            /* 3D旗は必ず星の半径上に置き、画面幅で極座標半径がズレて星から抜けるのを防ぐ */
            return {
              id: flag.id,
              angleRad: polar.angle,
              radiusPx: surface.radius,
              selected: expandedFlagId === flag.id,
            };
          })}
        />
      </div>
    </main>
  );
}
