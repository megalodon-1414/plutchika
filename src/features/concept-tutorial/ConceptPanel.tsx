import { useMemo } from 'react';
import { HomeTutorialIntroPanel } from '../home-tutorial/HomeTutorialIntroPanel';
import { HOME_TUTORIAL_INTRO_PANEL_TUNE, type HomeTutorialStepContent } from '../home-tutorial/constants';
import { getHomeTutorialPanelLayout } from '../home-tutorial/panelLayout';
import { DEFAULT_EMOTION_UI_ACCENT, getEmotionUiTheme } from '../../utils/emotionUiTheme';
import type { ConceptTutorialStepContent } from './constants';

interface ConceptPanelProps {
  activeStep: ConceptTutorialStepContent;
  visible: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

function toHomeTutorialContent(step: ConceptTutorialStepContent): HomeTutorialStepContent {
  return {
    sectionLabel: 'CONCEPT',
    ticker: 'PLUTCHIKA',
    title: step.heading,
    titleRuby: '',
    body: step.bodyParagraphs.join(' '),
    note: '',
    catchphraseLines: step.catchphraseLines,
    welcomeSiteName: step.welcomeSiteName ?? 'PLUTCHIKA',
    welcomeSubline: step.welcomeSubline ?? 'concept',
    welcomeDecorLines: step.welcomeDecorLines ?? ['CONCEPT', 'THEORY'],
    bodyParagraphs: step.bodyParagraphs,
  };
}

export function ConceptPanel({ activeStep, visible, viewportWidth, viewportHeight }: ConceptPanelProps) {
  const uiTheme = useMemo(() => getEmotionUiTheme(DEFAULT_EMOTION_UI_ACCENT, 'dark'), []);
  const panelLayout = useMemo(
    () => getHomeTutorialPanelLayout(viewportWidth, viewportHeight, 'intro'),
    [viewportWidth, viewportHeight],
  );

  return (
    <HomeTutorialIntroPanel
      uiTheme={uiTheme}
      panel={panelLayout.panel}
      content={toHomeTutorialContent(activeStep)}
      visible={visible}
      viewportWidth={viewportWidth}
      tune={HOME_TUTORIAL_INTRO_PANEL_TUNE}
    />
  );
}
