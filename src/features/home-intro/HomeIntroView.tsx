import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';
import {
  BoardingRocket,
  ROCKET_ENTER_DURATION_MS,
  ROCKET_LAUNCH_TOTAL_MS,
} from './components/BoardingRocket';
import type { RocketPhase } from './components/BoardingRocket';
import { IntroLogoScreen } from './components/IntroLogoScreen';
import { IntroWalker } from './components/IntroWalker';
import { NavigationIndicator } from './components/NavigationIndicator';
import type { NavigationIndicatorStage } from './components/NavigationIndicator';
import { WalkScene } from './components/WalkScene';
import { buildPanelContents } from './panelContent';
import { HOME_INTRO_STEPS } from './steps';
import { useStepGesture } from './useStepGesture';
import './home-intro.css';

const PANEL_CONTENTS = buildPanelContents(HOME_INTRO_STEPS, HOME_INTRO_STEPS.length);

/** home-intro.css の home-intro-board（人物が歩いてロケットへ乗り込む）アニメの長さと必ず同じ値にする。 */
const WALKER_BOARD_DURATION_MS = 900;

/**
 * 現在地インジケーター用の階層ラベル。①ロゴ画面は「現在地」として数えず、
 * 02（ようこそ）を最初の現在地にする（＝番号を1つ繰り下げる）。
 */
const NAV_INDICATOR_STAGES: NavigationIndicatorStage[] = [
  { label: 'ようこそ' },
  { label: '感情環' },
  { label: '搭乗' },
];

/** URLの `?step=<id>` から復元する初期ステップのインデックス。一致しない場合は先頭（ロゴ）から。 */
function resolveInitialIndex(stepIdParam: string | null): number {
  if (!stepIdParam) {
    return 0;
  }
  const index = HOME_INTRO_STEPS.findIndex((step) => step.id === stepIdParam);
  return index >= 0 ? index : 0;
}

export function HomeIntroView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialIndex = useMemo(
    () => resolveInitialIndex(searchParams.get('step')),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回マウント時の復元にのみ使う（以後のURL変化には追従しない）
    [],
  );
  const { activeIndex, isAnimating, goTo } = useStepGesture(HOME_INTRO_STEPS.length, containerRef, initialIndex);
  const activeStep = HOME_INTRO_STEPS[activeIndex];
  const isBoardingStep = activeStep.id === 'boarding';

  // ④搭乗ステップの演出状態。rocketPhase はロケット3D側、boardingStatus は人物・ボタンのUI側。
  const [rocketPhase, setRocketPhase] = useState<RocketPhase>('enter');
  const [boardingStatus, setBoardingStatus] = useState<'idle' | 'boarding' | 'launching'>('idle');
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  // 搭乗ステップを離れたら演出をリセットし、次回また最初（奥からの登場）から再生する。
  // effect内の同期setStateを避けるため、レンダー中の状態調整パターンで行う。
  const [wasBoardingStep, setWasBoardingStep] = useState(isBoardingStep);
  if (wasBoardingStep !== isBoardingStep) {
    setWasBoardingStep(isBoardingStep);
    setRocketPhase('enter');
    setBoardingStatus('idle');
  }

  // ロケットの登場アニメが終わったら待機（ホバリング）フェーズへ切り替える
  useEffect(() => {
    if (!isBoardingStep) {
      clearTimers();
      return;
    }
    const timerId = window.setTimeout(() => {
      setRocketPhase((prev) => (prev === 'enter' ? 'board' : prev));
    }, ROCKET_ENTER_DURATION_MS);
    timersRef.current.push(timerId);
    return clearTimers;
  }, [isBoardingStep]);

  const handleBoardClick = () => {
    if (boardingStatus !== 'idle') {
      return;
    }
    // ①人物がロケットまで歩いて乗り込む → ②ロケット発射（上昇→カメラへ向かって飛来）
    // → ③画面がロケットで埋まったところで感情MAP（telescope）へ遷移
    setBoardingStatus('boarding');
    const launchTimerId = window.setTimeout(() => {
      setBoardingStatus('launching');
      setRocketPhase('launch');
      const navigateTimerId = window.setTimeout(() => {
        navigate(ROUTES.telescopeSpace);
      }, ROCKET_LAUNCH_TOTAL_MS + 100);
      timersRef.current.push(navigateTimerId);
    }, WALKER_BOARD_DURATION_MS);
    timersRef.current.push(launchTimerId);
  };

  return (
    <div ref={containerRef} className="home-intro-root">
      {activeStep.kind === 'logo' ? (
        <IntroLogoScreen />
      ) : (
        <>
          <WalkScene
            stepIndex={activeIndex}
            panelContents={PANEL_CONTENTS}
            snapToInitialStep={initialIndex !== 0}
            onNavigate={navigate}
          />
          {isBoardingStep && <BoardingRocket phase={rocketPhase} />}
          {isBoardingStep && boardingStatus === 'launching' && <div className="home-intro-launch-dim" />}
          <IntroWalker stepping={isAnimating} boarding={boardingStatus !== 'idle'} />
          {isBoardingStep && boardingStatus !== 'launching' && (
            <div className="home-intro-board-cta">
              <button
                type="button"
                className="home-intro-board-cta__button"
                onClick={handleBoardClick}
                disabled={boardingStatus !== 'idle'}
              >
                感情Mapへ
              </button>
            </div>
          )}
          <NavigationIndicator
            stages={NAV_INDICATOR_STAGES}
            currentIndex={activeIndex - 1}
            onSelect={(index) => goTo(index + 1)}
          />
        </>
      )}

      <div className="home-intro-progress">
        <a href="https://plutchika.vercel.app/telescope" className="home-intro-progress__skip">
          スキップして感情MAPへ
        </a>
      </div>
    </div>
  );
}
