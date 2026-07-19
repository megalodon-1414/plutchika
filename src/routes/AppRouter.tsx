import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { DeepDivePage } from '../pages/DeepDivePage';
import { DevWordsEditorPage } from '../pages/DevWordsEditorPage';
import { EmotionMapPage } from '../pages/EmotionMapPage';
import { HomePage } from '../pages/HomePage';
import { TelescopeSpacePage } from '../pages/TelescopeSpacePage';
import { ROUTES } from './paths';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout showSiteChrome={false} />}>
          <Route path={ROUTES.home} element={<HomePage />} />
          <Route path={ROUTES.emotionMap} element={<EmotionMapPage />} />
          <Route path={ROUTES.telescopeSpace} element={<TelescopeSpacePage />} />
          <Route path={ROUTES.deepDive} element={<DeepDivePage />} />
        </Route>
        <Route element={<SiteLayout showSiteChrome />}>
          <Route path={ROUTES.devWords} element={<DevWordsEditorPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
