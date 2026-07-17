import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { ConceptTutorialPage } from '../pages/ConceptTutorialPage';
import { DevWordsEditorPage } from '../pages/DevWordsEditorPage';
import { EmotionMapPage } from '../pages/EmotionMapPage';
import { EmotionWordDetailPage } from '../pages/EmotionWordDetailPage';
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
          <Route path={ROUTES.emotionWordDetail} element={<EmotionWordDetailPage />} />
          <Route path={ROUTES.telescopeSpace} element={<TelescopeSpacePage />} />
          <Route path={ROUTES.conceptTutorial} element={<ConceptTutorialPage />} />
        </Route>
        <Route element={<SiteLayout showSiteChrome />}>
          <Route path={ROUTES.devWords} element={<DevWordsEditorPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
