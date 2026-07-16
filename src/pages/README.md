# ページ構成

周辺ページ（ホーム・解説など）はこの `pages/` 以下に追加してください。  
感情MAP本体は **`EmotionMapPage.tsx` のみ** — `components/` や MAP 用 `utils/` への変更は共同開発の衝突を避けるため最小限に。

ホームの 3D チュートリアルは **`features/home-tutorial/`** にまとめる（感情MAPと分離）。  
望遠鏡実験空間は **`features/telescope-space/`**（既存 MAP を壊さない並行実装）。

## ルート

| パス | ファイル | 内容 |
|------|----------|------|
| `/` | `HomePage.tsx` | 3Dチュートリアルホーム（PLUTCHIKA） |
| `/map` | `EmotionMapPage.tsx` | 感情MAP（3D 探索） |
| `/telescope` | `TelescopeSpacePage.tsx` | 望遠鏡モチーフ感情空間（実験） |

ルート定数は `src/routes/paths.ts` に集約。

## 新しいページを足すとき

1. `src/pages/YourPage.tsx` を作成
2. `src/routes/paths.ts` にパスを追加
3. `src/routes/AppRouter.tsx` に `Route` を追加（通常は `SiteLayout` 配下）
