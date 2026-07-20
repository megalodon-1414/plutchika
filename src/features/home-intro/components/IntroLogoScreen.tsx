import { SITE_NAME } from '../../../constants/site';

/** ①ロゴ画面。ブランド認知のための入口。歩行演出はまだ始まらない。 */
export function IntroLogoScreen() {
  return (
    <div className="home-intro-logo">
      <p className="home-intro-logo__mark font-momochidori font-momochidori--brand">{SITE_NAME}</p>
      <p className="home-intro-logo__hint font-momochidori font-momochidori--medium">SCROLL</p>
    </div>
  );
}
