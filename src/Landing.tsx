import { useState } from 'react';
import './landing.css';

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={down ? 'M10 3v12m-4-4 4 4 4-4M4 17h12' : 'M4 10h12m-5-5 5 5-5 5'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Landing() {
  const [videoError, setVideoError] = useState(false);

  return (
    <div className="landing">
      <a className="landing-skip" href="#main">
        Skip to content
      </a>
      <header className="landing-header">
        <a className="landing-brand" href="/" aria-label="Pocket Stage home">
          <svg
            width="26"
            height="28"
            viewBox="0 0 26 28"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m4 7.5 8.5-4.5L21 7.5v10L12.5 22 4 17.5V7.5Z"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="m4 7.5 8.5 4.5L21 7.5M12.5 12v10"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
          <span>Pocket Stage</span>
        </a>
        <nav aria-label="Main navigation">
          <a className="landing-nav-link" href="/studio">
            Open studio <Arrow />
          </a>
        </nav>
      </header>

      <main id="main">
        <section className="landing-intro" aria-labelledby="landing-title">
          <h1 id="landing-title">
            From screenshot
            <br />
            to product film.
          </h1>
          <div className="landing-invitation">
            <p>
              Give your software a little stage. Turn one to three screenshots
              into a directed, 12-second product film.
            </p>
            <a className="landing-primary" href="/studio">
              Open studio <Arrow />
            </a>
            <span className="landing-browser-note">
              Best on desktop Chrome.
            </span>
          </div>
        </section>

        <figure className="landing-demo" aria-labelledby="demo-caption">
          <video
            controls
            playsInline
            preload="none"
            poster="/demo/backstep-poster.jpg"
            aria-label="Backstep demo: a 12-second silent product showcase made in Pocket Stage"
            onError={() => setVideoError(true)}
          >
            <source src="/demo/backstep-showcase.mp4" type="video/mp4" />
            Your browser cannot play this video. Download the Backstep demo
            below.
          </video>
          {videoError && (
            <p className="landing-video-error" role="status">
              The demo could not play. You can download the MP4 below and watch
              it on your device.
            </p>
          )}
          <figcaption id="demo-caption">
            <span className="landing-demo-name">
              Backstep <span>— a film made in Pocket Stage</span>
            </span>
            <a
              href="/demo/backstep-showcase.mp4"
              download="backstep-showcase.mp4"
            >
              Download demo <Arrow down />
            </a>
          </figcaption>
        </figure>

        <section
          className="landing-details"
          aria-label="How Pocket Stage works"
        >
          <p>
            A reveal. A closer look. A final showcase.
            <br />{' '}
            Add your screenshots and copy; the three-shot sequence is ready.
          </p>
          <p className="landing-specs">
            <span>12 seconds</span>
            <span>1080p · 30 fps</span>
            <span>Silent MP4</span>
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <p>A miniature photo studio for software.</p>
        <a
          href="/demo/backstep.pocket-stage.json"
          download="backstep.pocket-stage.json"
        >
          Download editable demo <Arrow down />
        </a>
      </footer>
    </div>
  );
}
