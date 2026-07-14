import { SITE_NAME } from '../../constants/site';

interface MainLandingLogoProps {
  /** 差し替え用 SVG を置く領域の幅 */
  width?: number | string;
}

/**
 * ロゴ SVG 差し替え前のプレースホルダ。
 * 後から <img src="..." /> や inline SVG に置き換える。
 */
export function MainLandingLogo({ width = 'min(36vw, 320px)' }: MainLandingLogoProps) {
  return (
    <div
      style={{
        width,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: '4 / 3',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 'clamp(1.6rem, 4.2vw, 2.75rem)',
          letterSpacing: '0.22em',
          fontWeight: 600,
          color: '#f4ecf7',
          textAlign: 'center',
        }}
      >
        {SITE_NAME}
      </p>
    </div>
  );
}
