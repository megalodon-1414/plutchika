/** アプリ全体のルート定義。周辺ページ追加時はここに追記する。 */
export const ROUTES = {
  home: '/',
  emotionMap: '/map',
  devWords: '/dev/words',
} as const;

export type AppRoutePath = (typeof ROUTES)[keyof typeof ROUTES];
