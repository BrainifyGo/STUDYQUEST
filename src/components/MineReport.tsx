import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { pdfjsLib } from '../lib/pdfConfig';
import {
  buildMiningPrompt, citation, looksLikeExaminerReport, parseInsights, readReportMeta,
  type Insight, type Provenance,
} from '../lib/examinerReport';
import { publishInsights } from '../lib/insightStore';
import { auth } from '../lib/firebase';
import { InsightCard } from './InsightCard';

/**
 * Reading an examiner report and turning it into insights. Admin only.
 *
 * Deliberately a REVIEW step rather than a publish button. What comes out of
 * this goes in front of every student as "what examiners said", so a human looks
 * at it before anyone else does. That is the difference between a library
 * students can trust and a pile of plausible sentences.
 *
 * The rejected rows are shown too. If four of eight findings were thrown away as
 * too vague, that is worth knowing before publishing the other four — it usually
 * means the report was skimmed rather than read.
 */

interface Props {
  onDone: () => void;
}

export const MineReport: React.FC<Props> = ({ onDone }) => {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [source, setSource] = useState<Provenance | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [rejected, setRejected] = useState<{ index: number; reason: string }[]>([]);
  const [url, setUrl] = useState('');

  const handleFile = async (file: File) => {
    if (!url.trim()) {
      // Rule 2 of examinerReport.ts, enforced where the human is standing: an
      // insight with no link back to the report cannot be checked by anyone.
      toast.error('Paste the report URL first — insights without a source are not published.');
      return;
    }

    setBusy(true);
    setInsights([]);
    setRejected([]);
    try {
      setStage('Reading the PDF…');
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        // pdf.js yields TextItem and TextMarkedContent; only the former has text.
        text += content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ') + '\n';
      }

      if (!looksLikeExaminerReport(text)) {
        toast.error('That does not read like an examiner report.');
        return;
      }

      const meta = readReportMeta(text);
      if (!meta.board || !meta.subject) {
        toast.error('Could not tell which board and subject that report is for.');
        return;
      }

      const provenance: Provenance = {
        board: meta.board,
        qualification: meta.qualification ?? 'GCSE',
        subject: meta.subject,
        paperCode: meta.paperCode ?? '',
        session: meta.session ?? '',
        url: url.trim(),
      };
      setSource(provenance);

      setStage('Reading what the examiners said…');
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.currentUser
            ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }
            : {}),
        },
        body: JSON.stringify({ feature: 'paper-marking', prompt: buildMiningPrompt(meta, text) }),
      });
      const { result } = await res.json();

      const mined = parseInsights(result, provenance);
      setInsights(mined.insights);
      setRejected(mined.rejected);
      toast.success(`${mined.insights.length} insights — check them before publishing`);
    } catch (err) {
      console.error('[mine]', err);
      toast.error(err instanceof Error ? err.message : 'Could not read that report.');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const n = await publishInsights(insights);
      if (n === 0) {
        toast.error('Nothing was published — this is admin only.');
        return;
      }
      toast.success(`${n} insights published`);
      setInsights([]);
      setSource(null);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-black tracking-tight">Read an examiner report</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          Admin only. What comes out goes in front of every student, so check it before
          publishing.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-black uppercase tracking-widest text-text-dim">
          Link to the report on the board&rsquo;s site
        </span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.aqa.org.uk/files/…"
          className="min-h-11 w-full rounded-xl border border-border-main bg-glass-bg px-3 text-sm"
        />
        <span className="mt-1 block text-[12px] text-text-dim">
          Every insight links back to this. Without it, nobody can check the claim.
        </span>
      </label>

      <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border-main bg-glass-bg px-4 py-3 text-sm font-bold">
        {busy ? <><Loader2 size={16} className="animate-spin" /> {stage}</>
              : <><Upload size={16} /> Choose the report PDF</>}
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleFile(f);
          }}
        />
      </label>

      {source && insights.length > 0 && (
        <>
          <p className="text-[12.5px] text-text-dim">
            From <strong>{citation(source)}</strong>
            {rejected.length > 0 && ` · ${rejected.length} thrown away: `
              + [...new Set(rejected.map((r) => r.reason))].join(', ')}
          </p>

          <div className="space-y-3">
            {insights.map((i) => <InsightCard key={i.id} insight={i} />)}
          </div>

          <button
            onClick={publish}
            disabled={busy}
            className="min-h-11 w-full rounded-2xl bg-brand-purple px-4 py-3 font-black text-white disabled:opacity-60"
          >
            Publish these {insights.length} to every student
          </button>
        </>
      )}
    </div>
  );
};

export default MineReport;
