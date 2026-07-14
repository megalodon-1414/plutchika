/**
 * ホーム画面 3D チュートリアル（`/`）
 *
 * constants.ts       … ステップ定義・パネル調整値・演出タイミング
 * panelLayout.ts    … 右パネルの位置・スケール計算
 * camera.ts         … ステップごとのカメラ姿勢
 * HomeTutorialView  … ページ本体（2D UI + ステップ遷移）
 * HomeTutorialCanvas … Three.js シーン
 * HomeTutorial*Panel … STEP1/2 の縦書き UI
 */

export { HomeTutorialView } from './HomeTutorialView';
export { HomeTutorialCanvas } from './HomeTutorialCanvas';
export { getHomeTutorialPanelLayout } from './panelLayout';
export type { HomeTutorialPanelLayoutResult, HomeTutorialVerticalPanel } from './panelLayout';
export {
  HOME_TUTORIAL_STEPS,
  HOME_TUTORIAL_PANEL_TUNE,
  HOME_TUTORIAL_PANEL_FADE_MS,
  HOME_TUTORIAL_CAMERA_TRANSITION_MS,
} from './constants';
export type {
  HomeTutorialPanelVariant,
  HomeTutorialPanelTune,
  HomeTutorialStepContent,
  HomeTutorialStepDefinition,
} from './constants';
