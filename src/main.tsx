import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './Landing';

const Studio = lazy(() => import('./App'));
const inStudio = /^\/studio\/?$/.test(window.location.pathname);

if (inStudio) document.title = 'Pocket Stage — Studio';

createRoot(document.getElementById('root')!).render(
  inStudio ? (
    <Suspense
      fallback={
        <div
          role="status"
          style={{
            padding: '32px',
            color: '#f3f0e9',
            fontFamily: 'sans-serif',
          }}
        >
          Opening studio…
        </div>
      }
    >
      <Studio />
    </Suspense>
  ) : (
    <Landing />
  ),
);
