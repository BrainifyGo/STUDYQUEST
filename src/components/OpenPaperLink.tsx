import React, { useState } from 'react';
import { toast } from 'sonner';
import { Link2, Loader2 } from 'lucide-react';
import { pdfjsLib } from '../lib/pdfConfig';
import { auth } from '../lib/firebase';
import {
  REFUSAL_MESSAGES, boardOf, checkPaperUrl, fileNameFor,
} from '../lib/paperSource';
import { looksLikeExamPaper, parseExamPaper } from '../lib/examPaper';
import { startSession, type PaperSession } from '../lib/paperSession';

/**
 * Opening a past paper straight from the exam board's own link.
 *
 * RED reported this failing: paste an aqa.org.uk PDF link and nothing works. The
 * cause was never the parsing — a browser simply cannot fetch a PDF from
 * aqa.org.uk, because the board sends no CORS header and the request is blocked
 * before it leaves. So the server fetches it instead (see /api/fetch-paper) and
 * hands the bytes back, and from there this is the same path as a file the
 * student chose themselves.
 *
 * NOTHING IS STORED ANYWHERE. The bytes are parsed in the browser and dropped;
 * only the questions the student then works through are saved, exactly as with
 * an upload. GCSE papers belong to the boards, and StudyQuest does not host
 * them.
 *
 * The link is checked here too, before any request is made — not as security,
 * which lives on the server, but so a wrong link is explained instantly instead
 * of after a round trip.
 */

interface Props {
  onOpen: (session: PaperSession) => void;
}

export const OpenPaperLink: React.FC<Props> = ({ onOpen }) => {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');

  const open = async () => {
    const raw = url.trim();
    if (!raw || busy) return;

    const check = checkPaperUrl(raw);
    if (!check.ok || !check.url) {
      toast.error(REFUSAL_MESSAGES[check.reason ?? 'not-a-url']);
      return;
    }

    setBusy(true);
    try {
      setStage('Asking the exam board…');
      const res = await fetch('/api/fetch-paper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.currentUser
            ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }
            : {}),
        },
        body: JSON.stringify({ url: check.url }),
      });

      if (!res.ok) {
        // The server explains itself in words a student can act on.
        const { error } = await res.json().catch(() => ({ error: null }));
        throw new Error(error ?? 'Could not open that link.');
      }

      setStage('Reading the paper…');
      const buf = await res.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        // pdf.js yields TextItem and TextMarkedContent; only the former has text.
        text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
      }

      if (!looksLikeExamPaper(text)) {
        throw new Error('That PDF does not read like a question paper. '
          + 'A mark scheme or a specification will not work here.');
      }

      const parsed = parseExamPaper(text);
      if (!parsed.questions.length) {
        throw new Error('No questions could be read out of that paper.');
      }

      onOpen(startSession({
        id: `link_${Date.now().toString(36)}`,
        paperTitle: fileNameFor(check.url).replace(/\.pdf$/i, ''),
        board: parsed.board ?? boardOf(check.url),
        subject: parsed.subject,
        questions: parsed.questions,
      }));
      setUrl('');
      toast.success(`${parsed.questions.length} questions ready`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open that link.');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  return (
    <div className="rounded-2xl border border-border-main bg-glass-bg p-4">
      <p className="mb-1 flex items-center gap-2 text-[13px] font-bold">
        <Link2 size={15} /> Open a paper from a board link
      </p>
      <p className="mb-3 text-[12.5px] leading-relaxed text-text-dim">
        Paste a PDF link from AQA, Pearson/Edexcel, OCR or WJEC and we will read the
        questions out of it. Nothing is stored &mdash; the paper stays theirs.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void open(); }}
          disabled={busy}
          placeholder="https://www.aqa.org.uk/files/…"
          className="min-h-11 flex-1 rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
        />
        <button
          onClick={() => void open()}
          disabled={busy || !url.trim()}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-purple px-4 font-black text-white disabled:opacity-60"
        >
          {busy ? <><Loader2 size={15} className="animate-spin" /> {stage}</> : 'Open'}
        </button>
      </div>
    </div>
  );
};

export default OpenPaperLink;
