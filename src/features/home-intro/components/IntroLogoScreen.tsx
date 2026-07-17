import { SITE_NAME } from '../../../constants/site';

/** ①ロゴ画面。ブランド認知のための入口。歩行演出はまだ始まらない。 */
export function IntroLogoScreen() {
  return (
    <div className="home-intro-logo">
      <p className="home-intro-logo__mark">{SITE_NAME}</p>
      <p className="home-intro-logo__hint">SCROLL</p>
    </div>
  );
}
