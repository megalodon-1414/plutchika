import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';
import { fetchEmotionWordsAsPlots } from '../../services/emotionWords';
import type { UserPlotRow } from '../../types/userPlot';
import { getPrimaryEmotionColor } from '../../utils/emotionPlotBridge';
import { findPlotBySlug } from '../../utils/emotionWordSlug';
import { DEFAULT_EMOTION_UI_ACCENT, getEmotionUiTheme } from '../../utils/emotionUiTheme';
import { WordLandingExperience } from './WordLandingExperience';

export function EmotionWordDetailView() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [plots, setPlots] = useState<UserPlotRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    fetchEmotionWordsAsPlots()
      .then((rows) => {
        if (!cancelled) {
          setPlots(rows);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const plot = useMemo(() => findPlotBySlug(plots, slug), [plots, slug]);
  const accent = plot ? getPrimaryEmotionColor(plot.primaryId) : DEFAULT_EMOTION_UI_ACCENT;
  const uiTheme = useMemo(() => getEmotionUiTheme(accent, 'dark'), [accent]);

  if (!isLoading && !loadError && plot) {
    return <WordLandingExperience plot={plot} uiTheme={uiTheme} />;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        color: uiTheme.uiText,
        background: `
          radial-gradient(ellipse at 30% 20%, ${uiTheme.accentGlow} 0%, transparent 48%),
          radial-gradient(ellipse at 70% 80%, rgba(8,12,24,0.9) 0%, #030508 55%, #010104 100%)
        `,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '28px 20px 64px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '0.72rem',
                letterSpacing: '0.18em',
                opacity: 0.55,
              }}
            >
              EMOTION MAP · WORD
            </p>
          </div>
          <Link
            to={ROUTES.emotionMap}
            style={{
              padding: '8px 14px',
              border: `1px solid ${uiTheme.accentBorder}`,
              borderRadius: 8,
              color: uiTheme.textPrimary,
              textDecoration: 'none',
              fontSize: '0.78rem',
              letterSpacing: '0.06em',
              background: uiTheme.panelBackground,
              backdropFilter: 'blur(8px)',
            }}
          >
            Map に戻る
          </Link>
        </header>

        {isLoading && (
          <p style={{ margin: 0, opacity: 0.7, letterSpacing: '0.08em' }}>読み込み中…</p>
        )}

        {!isLoading && loadError && (
          <p style={{ margin: 0, color: '#e84855' }}>{loadError}</p>
        )}

        {!isLoading && !loadError && !plot && (
          <section
            style={{
              padding: 24,
              borderRadius: 12,
              border: `1px solid ${uiTheme.accentBorder}`,
              background: uiTheme.panelBackground,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: '1.4rem',
                letterSpacing: '0.08em',
              }}
            >
              見つかりませんでした
            </h1>
            <p
              style={{
                margin: '12px 0 0',
                lineHeight: 1.7,
                color: uiTheme.textSecondary,
              }}
            >
              「{slug}」に対応する熟語・単語がありません。Map から選び直してください。
            </p>
          </section>
        )}

      </div>
    </div>
  );
}
