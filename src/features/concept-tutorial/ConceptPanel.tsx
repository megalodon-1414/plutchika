import type { ConceptTutorialStepContent } from './constants';

interface ConceptPanelProps {
  activeStep: ConceptTutorialStepContent;
  visible: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * コンセプトチュートリアル用の説明パネル（home-tutorial 非依存）。
 */
export function ConceptPanel({
  activeStep,
  visible,
  viewportWidth,
}: ConceptPanelProps) {
  const narrow = viewportWidth > 0 && viewportWidth < 720;
  const catchphrase = activeStep.catchphraseLines ?? [];

  return (
    <aside
      aria-hidden={!visible}
      style={{
        position: 'absolute',
        left: narrow ? '5%' : '6%',
        top: narrow ? '10%' : '12%',
        width: narrow ? '88%' : 'min(42vw, 520px)',
        zIndex: 3,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 280ms ease, transform 280ms ease',
        color: '#f3efe8',
      }}
    >
      <div
        style={{
          borderLeft: `4px solid ${'#e8b4c4'}`,
          paddingLeft: narrow ? 14 : 18,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.72rem',
            letterSpacing: '0.22em',
            opacity: 0.55,
          }}
        >
          CONCEPT
        </p>

        {catchphrase.length > 0 && (
          <div style={{ marginTop: 14, lineHeight: 1.25 }}>
            {catchphrase.map((line) => (
              <p
                key={line}
                style={{
                  margin: 0,
                  fontSize: narrow ? '1.35rem' : 'clamp(1.45rem, 2.4vw, 1.85rem)',
                  fontWeight: 650,
                  letterSpacing: '0.04em',
                }}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'baseline',
          }}
        >
          <span
            style={{
              fontSize: narrow ? '1.15rem' : '1.35rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            {activeStep.welcomeSiteName ?? 'PLUTCHIKA'}
          </span>
          <span style={{ fontSize: '0.95rem', opacity: 0.7 }}>
            {activeStep.welcomeSubline ?? ''}
          </span>
        </div>

        {(activeStep.welcomeDecorLines?.length ?? 0) > 0 && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '0.82rem',
              letterSpacing: '0.14em',
              opacity: 0.5,
            }}
          >
            {activeStep.welcomeDecorLines?.join(' · ')}
          </p>
        )}

        <h2
          style={{
            margin: '20px 0 0',
            fontSize: narrow ? '1.05rem' : '1.15rem',
            fontWeight: 600,
            lineHeight: 1.45,
            letterSpacing: '0.03em',
          }}
        >
          {activeStep.heading}
        </h2>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeStep.bodyParagraphs.map((paragraph) => (
            <p
              key={paragraph.slice(0, 24)}
              style={{
                margin: 0,
                fontSize: narrow ? '0.88rem' : '0.92rem',
                lineHeight: 1.75,
                opacity: 0.78,
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </aside>
  );
}
