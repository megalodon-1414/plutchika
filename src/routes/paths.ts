/** アプリ全体のルート定義。周辺ページ追加時はここに追記する。 */
export const ROUTES = {
  home: '/',
  emotionMap: '/map',
  /** 望遠鏡モチーフの感情空間（実験） */
  telescopeSpace: '/telescope',
  /** コンセプト解説チュートリアル */
  conceptTutorial: '/concept',
  devWords: '/dev/words',
} as const;

export type AppRoutePath = (typeof ROUTES)[keyof typeof ROUTES];
