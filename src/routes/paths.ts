/** アプリ全体のルート定義。周辺ページ追加時はここに追記する。 */
export const ROUTES = {
  home: '/',
  emotionMap: '/map',
  /** 熟語・単語の詳細（例: /map/suuhai） */
  emotionWordDetail: '/map/:slug',
  /** 望遠鏡モチーフの感情空間（実験） */
  telescopeSpace: '/telescope',
  devWords: '/dev/words',
} as const;

export type AppRoutePath = (typeof ROUTES)[keyof typeof ROUTES];

export function emotionWordDetailPath(slug: string): string {
  return `/map/${slug}`;
}
