import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initAnalytics} from './lib/analytics';

/*
  A BLANK WHITE PAGE IS THE WORST WAY TO FAIL.

  The Firebase client config is baked in at BUILD time from VITE_FIREBASE_*. Build
  without them — which is what happens when a host has no environment variables
  set — and every value is undefined. Firebase then throws on the first auth call,
  React never mounts, and the deployed site is a white rectangle with the real
  reason buried in the browser console.

  This checks first and renders something a person can act on.
*/
const REQUIRED_CLIENT_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const missingEnv = REQUIRED_CLIENT_ENV.filter(
  (k) => !String(import.meta.env[k] ?? '').trim()
);

function ConfigError({ missing }: { missing: readonly string[] }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem',
      background: '#0b0916', color: '#f1eefc',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <div style={{ maxWidth: '34rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '.75rem' }}>
          StudyQuest isn&rsquo;t configured
        </h1>
        <p style={{ color: '#9d94bd', lineHeight: 1.6, marginBottom: '1rem' }}>
          The app was built without its Firebase settings, so it can&rsquo;t sign anyone in.
          These are read at <strong>build</strong> time, so setting them means rebuilding
          &mdash; not just restarting.
        </p>
        <ul style={{
          color: '#ec4899', fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '.9rem', lineHeight: 1.8, marginBottom: '1rem',
          listStyle: 'none', padding: 0,
        }}>
          {missing.map((k) => <li key={k}>{k}</li>)}
        </ul>
        <p style={{ color: '#9d94bd', lineHeight: 1.6, fontSize: '.92rem' }}>
          Locally: put them in <code>.env</code> and run <code>npm run build</code> again.
          On a host: add them to the project&rsquo;s environment variables and redeploy.
          The values are in the Firebase console under Project settings &rarr; Your apps.
        </p>
      </div>
    </div>
  );
}

// No-op unless VITE_GA_ID is set. See analytics.ts for why consent starts denied.
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {missingEnv.length > 0 ? <ConfigError missing={missingEnv} /> : <App />}
  </StrictMode>,
);
