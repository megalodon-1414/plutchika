import { SITE_NAME } from '../../../constants/site';
import plutchikaQrUrl from '../../../../plutchika.svg';
import { IntroFlowerLogo } from './IntroFlowerLogo';

interface IntroLogoScreenProps {
  /** true の間は3D花ロゴが集合した静止状態。false になった瞬間から放射状に散開し、中心球がPlanetGlobeへ繋がる。 */
  atLogoStep: boolean;
}

/** ①ロゴ画面。ブランド認知のための入口。歩行演出はまだ始まらない。 */
export function IntroLogoScreen({ atLogoStep }: IntroLogoScreenProps) {
  return (
    <div className="home-intro-logo">
      <IntroFlowerLogo atLogoStep={atLogoStep} />
      <div className={`home-intro-logo__text ${atLogoStep ? '' : 'home-intro-logo__text--leaving'}`}>
        <p className="home-intro-logo__mark">{SITE_NAME}</p>
      </div>
      <img
        src={plutchikaQrUrl}
        alt=""
        className={`home-intro-logo__qr ${atLogoStep ? '' : 'home-intro-logo__qr--leaving'}`}
        width={72}
        height={72}
        decoding="async"
      />
    </div>
  );
}
