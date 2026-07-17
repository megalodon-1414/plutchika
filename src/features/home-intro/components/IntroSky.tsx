import type { HomeIntroQuadrantContent } from '../steps';

interface IntroSkyProps {
  /** 変わるとテキストがフェードインし直す */
  stepKey: string;
  content: HomeIntroQuadrantContent;
}

function renderLines(text: string) {
  return text.split('\n').map((line, index) => (
    <span key={index}>
      {line}
      <br />
    </span>
  ));
}

/** 上部8割「空」領域。4象限（左上：キャッチコピー／右上：見出し／左下：行動フレーズ／右下：本文）にテキストを配置する。 */
export function IntroSky({ stepKey, content }: IntroSkyProps) {
  return (
    <div className="home-intro-sky">
      <div key={stepKey} className="home-intro-sky__grid">
        <p className="home-intro-quadrant home-intro-quadrant--catchphrase">{content.catchphrase}</p>
        <h1 className="home-intro-quadrant home-intro-quadrant--heading">{renderLines(content.heading)}</h1>
        <p className="home-intro-quadrant home-intro-quadrant--action">{content.actionPhrase}</p>
        <p className="home-intro-quadrant home-intro-quadrant--body">{content.body}</p>
      </div>
    </div>
  );
}
