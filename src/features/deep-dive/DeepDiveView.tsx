import { useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';
import { IntroWalker } from '../home-intro/components/IntroWalker';
import { NavigationIndicator } from '../home-intro/components/NavigationIndicator';
import type { NavigationIndicatorStage } from '../home-intro/components/NavigationIndicator';
import { WalkScene } from '../home-intro/components/WalkScene';
import '../home-intro/home-intro.css';
import { buildPanelContents } from '../home-intro/panelContent';
import { useStepGesture } from '../home-intro/useStepGesture';
import { DEEP_DIVE_PANELS } from './panels';

// PlanetMesh の「あるステップが読める位置に運ぶパネル番号は (stepIndex + 1) % panelCount」という
// 仕組みに合わせて対応付ける（home-introと共通のヘルパー。panelCountが違っても同じ式で成立する）。
const PANEL_CONTENTS = buildPanelContents(DEEP_DIVE_PANELS, DEEP_DIVE_PANELS.length);

/** 現在地インジケーター用のラベル。各パネルの見出しをそのまま使う（5パネル＝5ドット）。 */
const NAV_INDICATOR_STAGES: NavigationIndicatorStage[] = DEEP_DIVE_PANELS.map((panel) => ({
  label: panel.content.heading,
}));

/** URLの `?panel=1`〜`5`（または `panel-1` 等のID）から復元する初期パネルのインデックス。 */
function resolveInitialIndex(panelParam: string | null): number {
  if (!panelParam) {
    return 0;
  }
  const asNumber = Number(panelParam);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= DEEP_DIVE_PANELS.length) {
    return asNumber - 1;
  }
  const byId = DEEP_DIVE_PANELS.findIndex((panel) => panel.id === panelParam);
  return byId >= 0 ? byId : 0;
}

export function DeepDiveView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const initialIndex = useMemo(
    () => resolveInitialIndex(searchParams.get('panel')),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回マウント時の復元にのみ使う
    [],
  );
  // 必須ルート側のどの画面から来たか（例: welcome）。「戻る」リンクの復帰先に使う。
  const fromStepId = searchParams.get('from');
  const backHref = fromStepId ? `${ROUTES.home}?step=${fromStepId}` : ROUTES.home;

  const { activeIndex, isAnimating, goTo } = useStepGesture(
    DEEP_DIVE_PANELS.length,
    containerRef,
    initialIndex,
  );

  return (
    <div ref={containerRef} className="home-intro-root">
      <Link to={backHref} className="home-intro-back-link">
        ← 言葉の旅を続ける
      </Link>

      <WalkScene
        stepIndex={activeIndex}
        panelContents={PANEL_CONTENTS}
        snapToInitialStep={initialIndex !== 0}
      />
      <IntroWalker stepping={isAnimating} />
      <NavigationIndicator stages={NAV_INDICATOR_STAGES} currentIndex={activeIndex} onSelect={goTo} />
    </div>
  );
}
