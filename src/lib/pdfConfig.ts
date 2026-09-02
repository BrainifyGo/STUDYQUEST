import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a bundled asset URL and emits the file with the build.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Point pdf.js at its worker. Imported for the side effect, once, by everything
 * that reads a PDF.
 *
 * THIS WAS BROKEN IN PRODUCTION AND SILENTLY TOOK EVERY PDF UPLOAD WITH IT.
 *
 * Two places each built the URL by hand:
 *
 *     `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`
 *
 * pdf.js 4.x ships the worker as an ES module — `pdf.worker.min.mjs`. The `.js`
 * file no longer exists, so that URL is a 404 and the console fills with
 * "Setting up fake worker failed". The fake worker cannot parse a real document,
 * so uploading a past paper did nothing and said nothing useful about why.
 *
 * Fixing the extension would have been enough to stop the error. Bundling it is
 * better, for reasons that matter for these users specifically:
 *
 *   - The version can never drift from the installed package again. The old code
 *     interpolated `pdfjsLib.version`, so it looked correct while being wrong.
 *   - StudyQuest is used on school wifi, where CDNs are routinely blocked.
 *     A core feature should not depend on a third-party host being reachable.
 *   - It works with no network at all once the app has loaded.
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib, workerUrl };
