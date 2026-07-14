import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { DevWordsEditorPage } from '../pages/DevWordsEditorPage';
import { EmotionMapPage } from '../pages/EmotionMapPage';
import { HomePage } from '../pages/HomePage';
import { ROUTES } from './paths';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout showSiteChrome={false} />}>
          <Route path={ROUTES.home} element={<HomePage />} />
          <Route path={ROUTES.emotionMap} element={<EmotionMapPage />} />
        </Route>
        <Route element={<SiteLayout showSiteChrome />}>
          <Route path={ROUTES.devWords} element={<DevWordsEditorPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
