import { SITE_NAME } from '../../constants/site';

/**
 * 見出しの位置・サイズ調整はこのオブジェクトを編集する。
 *
 * - rightInset … 右端からの余白。大きくすると左へ寄る（例: '20%' / 'clamp(14%, 20vw, 26%)'）
 * - offsetY … 縦位置。正の値で下へ、負の値で上へ（例: -24）
 * - width … ロゴ領域の幅
 * - fontSize … 文字サイズ（clamp で画面幅に応じて伸縮）
 * - letterSpacing … 字間（em 単位。大きくすると横に広がる）
 */
export const MAIN_LANDING_LOGO_TUNE = {
  rightInset: '12%',
  offsetY: -25,
  width: 'min(40vw, 380px)',
  fontSize: 'clamp(1.9rem, 5vw, 3.15rem)',
  letterSpacing: '0.22em',
} as const;

interface MainLandingLogoProps {
  width?: number | string;
  fontSize?: string;
  letterSpacing?: string;
}

/**
 * ロゴ SVG 差し替え前のプレースホルダ。
 * 後から <img src="..." /> や inline SVG に置き換える。
 */
export function MainLandingLogo({
  width = MAIN_LANDING_LOGO_TUNE.width,
  fontSize = MAIN_LANDING_LOGO_TUNE.fontSize,
  letterSpacing = MAIN_LANDING_LOGO_TUNE.letterSpacing,
}: MainLandingLogoProps) {
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
          fontSize,
          letterSpacing,
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
