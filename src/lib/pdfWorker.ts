// Worker source is configured once, from the bundled asset, in pdfConfig.
// The hand-built CDN URL that used to live here asked for pdf.worker.min.js,
// which pdf.js 4.x does not ship — see the note in pdfConfig.ts.
import { pdfjsLib } from './pdfConfig';

self.onmessage = async (e: MessageEvent) => {
  const { arrayBuffer, fileName } = e.data;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    let fullText = '';

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => (item as any).str)
        .join(' ');
      
      fullText += pageText + '\n';
      
      const progress = Math.round((i / totalPages) * 100);
      self.postMessage({
        type: 'progress',
        progress,
        currentPage: i,
        totalPages
      });
    }

    self.postMessage({
      type: 'complete',
      text: fullText
    });
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      message: err.message || 'Failed to extract text from PDF.'
    });
  }
};
