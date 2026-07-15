import { SITE_NAME } from '../../constants/site';
import { PlutchikPetalWheelLoader } from './PlutchikPetalWheelLoader';

interface LandingLoadingScreenProps {
  visible: boolean;
  fading?: boolean;
}

export function LandingLoadingScreen({ visible, fading = false }: LandingLoadingScreenProps) {
  if (!visible) {
    return null;
  }

  return (
    <>
      <style>
        {`
          @keyframes landingLoadingLabelIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
      <div
        role="status"
        aria-live="polite"
        aria-label="読み込み中"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(20px, 4vh, 36px)',
          backgroundColor: '#030508',
          color: '#f4ecf7',
          opacity: fading ? 0 : 1,
          pointerEvents: fading ? 'none' : 'auto',
          transition: 'opacity 620ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <PlutchikPetalWheelLoader animating={!fading} />
        <p
          style={{
            margin: 0,
            fontSize: 'clamp(1.35rem, 3.6vw, 2rem)',
            letterSpacing: '0.24em',
            fontWeight: 600,
            animation: fading ? 'none' : 'landingLoadingLabelIn 720ms ease 0.45s both',
          }}
        >
          {SITE_NAME}
        </p>
      </div>
    </>
  );
}
