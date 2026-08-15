import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initAnalytics} from './lib/analytics';

// No-op unless VITE_GA_ID is set. See analytics.ts for why consent starts denied.
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
