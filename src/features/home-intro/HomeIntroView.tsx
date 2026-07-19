import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';
import { IntroLogoScreen } from './components/IntroLogoScreen';
import { IntroWalker } from './components/IntroWalker';
import { WalkScene } from './components/WalkScene';
import { HOME_INTRO_STEPS } from './steps';
import { useStepGesture } from './useStepGesture';
import './home-intro.css';

export function HomeIntroView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { activeIndex, isAnimating } = useStepGesture(HOME_INTRO_STEPS.length, containerRef);
  const activeStep = HOME_INTRO_STEPS[activeIndex];

  return (
    <div ref={containerRef} className="home-intro-root">
      {activeStep.kind === 'logo' ? (
        <IntroLogoScreen />
      ) : (
        <>
          <WalkScene stepIndex={activeIndex} />
          <IntroWalker stepping={isAnimating} />
        </>
      )}

      <div className="home-intro-progress">
        <span className="home-intro-progress__counter">
          {String(activeIndex + 1).padStart(2, '0')} / {String(HOME_INTRO_STEPS.length).padStart(2, '0')}
        </span>
        <Link to={ROUTES.emotionMap} className="home-intro-progress__skip">
          スキップして感情MAPへ
        </Link>
      </div>
    </div>
  );
}
