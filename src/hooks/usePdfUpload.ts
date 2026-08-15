import { useState, useCallback, useRef, useEffect } from 'react';

interface PDFProgress {
  progress: number;
  currentPage: number;
  totalPages: number;
}

export const usePdfUpload = () => {
  const [progress, setProgress] = useState<PDFProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Cleanup worker on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const uploadPdf = useCallback(async (file: File): Promise<string | null> => {
    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size exceeds 10MB limit.');
    }

    setIsProcessing(true);
    setProgress({ progress: 0, currentPage: 0, totalPages: 0 });
    setExtractedText(null);

    return new Promise((resolve, reject) => {
      try {
        // Create worker using Vite's worker import syntax
        const worker = new Worker(new URL('../lib/pdfWorker.ts', import.meta.url), {
          type: 'module'
        });
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent) => {
          const { type, progress, currentPage, totalPages, text, message } = e.data;

          if (type === 'progress') {
            setProgress({ progress, currentPage, totalPages });
          } else if (type === 'complete') {
            setExtractedText(text);
            setIsProcessing(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
            resolve(text);
          } else if (type === 'error') {
            setIsProcessing(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
            reject(new Error(message));
          }
        };

        worker.onerror = (err) => {
          setIsProcessing(false);
          setProgress(null);
          worker.terminate();
          workerRef.current = null;
          reject(new Error('Worker error: ' + err.message));
        };

        file.arrayBuffer().then((arrayBuffer) => {
          worker.postMessage({ arrayBuffer, fileName: file.name }, [arrayBuffer]);
        }).catch(reject);

      } catch (err: any) {
        setIsProcessing(false);
        setProgress(null);
        reject(err);
      }
    });
  }, []);

  return { uploadPdf, progress, isProcessing, extractedText };
};
