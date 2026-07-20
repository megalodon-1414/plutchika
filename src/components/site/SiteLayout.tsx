import { Link, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';

interface SiteLayoutProps {
  /** 感情MAP用のフルスクリーンレイアウトでは false */
  showSiteChrome?: boolean;
}

export function SiteLayout({ showSiteChrome = true }: SiteLayoutProps) {
  const location = useLocation();

  if (!showSiteChrome) {
    // key={location.pathname}でページ遷移のたびに新しいDOMノードとして再マウントし、
    // fade-inアニメーション（index.cssのsite-page-fade-in）を毎回再生させる。
    return (
      <div key={location.pathname} className="site-page-fade-in" style={{ height: '100%' }}>
        <Outlet />
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#0b0c10',
        color: '#f4ecf7',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Link
          to={ROUTES.home}
          style={{
            color: '#f4ecf7',
            textDecoration: 'none',
            fontSize: '1rem',
            letterSpacing: '0.12em',
          }}
        >
          PLUTCHIKA
        </Link>
        <nav style={{ display: 'flex', gap: '20px', fontSize: '0.88rem' }}>
          <Link to={ROUTES.home} style={{ color: '#c39bd3', textDecoration: 'none' }}>
            ホーム
          </Link>
          <Link to={ROUTES.emotionMap} style={{ color: '#c39bd3', textDecoration: 'none' }}>
            感情MAP
          </Link>
          <Link to={ROUTES.devWords} style={{ color: '#45f3ff', textDecoration: 'none' }}>
            単語編集
          </Link>
        </nav>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Outlet />
      </main>

      <footer
        style={{
          padding: '20px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '0.75rem',
          color: '#9f8aaa',
        }}
      >
        感情の言葉を空間でたどるプロジェクト
      </footer>
    </div>
  );
}
