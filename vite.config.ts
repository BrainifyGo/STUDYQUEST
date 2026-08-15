import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Stamp the site's absolute URL into index.html.
 *
 * Canonical and og:image have to be absolute — a social scraper fetching a share card has no
 * page context to resolve a relative path against. Vite's built-in `%VITE_FOO%` substitution
 * only fires when the variable is DEFINED; with it unset the placeholder survives into the
 * built HTML, so a fresh clone would ship `og:image content="%VITE_SITE_URL%/og-image.png"`
 * and every shared link would show a broken image. Verified by building without it set.
 *
 * So: substitute explicitly, warn loudly when it is missing, and degrade to a root-relative
 * URL rather than emitting a placeholder. Most scrapers resolve a relative og:image; none
 * resolve a percent sign.
 */
function siteUrlPlugin(mode: string): Plugin {
  return {
    name: 'brainify-site-url',
    transformIndexHtml(html) {
      const env = loadEnv(mode, process.cwd(), '');
      const site = (env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');
      if (!site && mode === 'production') {
        console.warn(
          '\n[build] VITE_SITE_URL is not set. Canonical and social-share tags will be\n' +
          '        root-relative, so link previews may not show the image. Set it in .env\n' +
          '        to the live domain, e.g. VITE_SITE_URL=https://brainify.example\n'
        );
      }
      return html.replace(/%VITE_SITE_URL%/g, site);
    },
  };
}

export default defineConfig(({mode}) => {
  return {
    plugins: [react(), tailwindcss(), siteUrlPlugin(mode)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
