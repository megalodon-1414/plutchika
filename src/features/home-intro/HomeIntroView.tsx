import { useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
          <IntroWalker stepping={isAnimating} />
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
