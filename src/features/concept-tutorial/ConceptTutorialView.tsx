import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';
import { ConceptPanel } from './ConceptPanel';
import { ConceptTutorialCanvas } from './ConceptTutorialCanvas';
import { CONCEPT_TUTORIAL_STEPS } from './constants';

export function ConceptTutorialView() {
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainSize, setMainSize] = useState({ width: 0, height: 0 });
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [panelVisible, setPanelVisible] = useState(true);
  const activeStep = CONCEPT_TUTORIAL_STEPS[activeStepIndex] ?? CONCEPT_TUTORIAL_STEPS[0];

  useEffect(() => {
    const element = mainRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      setMainSize({ width: element.clientWidth, height: element.clientHeight });
    };
    const observer = new ResizeObserver(updateSize);
    updateSize();
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPanelVisible(false);
    const timer = window.setTimeout(() => {
      setPanelVisible(true);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activeStepIndex]);

  return (
    <div
      ref={mainRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: 'radial-gradient(circle at top left, rgba(255,255,255,0.04), transparent 34%), #02040a',
        color: '#f3efe8',
      }}
    >
      <ConceptTutorialCanvas
        activeStepIndex={activeStepIndex}
        onStepSelect={setActiveStepIndex}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
          background: 'linear-gradient(90deg, rgba(2, 4, 10, 0.78) 0%, rgba(2, 4, 10, 0.3) 36%, rgba(2, 4, 10, 0.18) 100%)',
        }}
      />

      <ConceptPanel
        activeStep={activeStep.content}
        visible={panelVisible}
        viewportWidth={mainSize.width}
        viewportHeight={mainSize.height}
      />

      <div
        style={{
          position: 'absolute',
          right: '6%',
          bottom: '6%',
          zIndex: 3,
          pointerEvents: 'auto',
        }}
      >
        <Link
          to={ROUTES.home}
          style={{
            color: '#f3efe8',
            textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '999px',
            padding: '0.7rem 1rem',
            display: 'inline-block',
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          ホームへ戻る
        </Link>
      </div>
    </div>
  );
}
