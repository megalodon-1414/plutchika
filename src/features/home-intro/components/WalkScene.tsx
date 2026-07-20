/**
 * 歩行シーン。惑星本体は PlanetGlobe（Three.js）。
 * 星空は最奥の HomeStarfield（3D 点群）が担当する。
 */
import type { PlanetPanelContent } from '../panelContent';
import { PlanetGlobe } from './PlanetGlobe';

interface WalkSceneProps {
  stepIndex: number;
  panelContents: (PlanetPanelContent | null)[];
  /** 直接リンクでの初期表示時、現在の stepIndex の位置へ即スナップしたい場合に true にする。 */
  snapToInitialStep?: boolean;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
}

export function WalkScene({ stepIndex, panelContents, snapToInitialStep, onNavigate }: WalkSceneProps) {
  return (
    <div className="home-intro-walkscene">
      <PlanetGlobe
        stepIndex={stepIndex}
        panelContents={panelContents}
        snapToInitialStep={snapToInitialStep}
        onNavigate={onNavigate}
      />
    </div>
  );
}
