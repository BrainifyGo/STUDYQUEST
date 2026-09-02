import React, { useEffect, useState } from 'react';
import {
  BOX_BLURBS, BOX_LABELS, MIN_FOR_VERDICT,
  blindSpotRate, calibration, riskiestTopics, tally, verdict,
  type Attempt, type Box,
} from '../lib/confidence';
import { listAttempts } from '../lib/confidenceStore';

/**
 * The four boxes, and the one topic list worth reading.
 *
 * Collecting confidence and never showing it back would be the worst of both
 * worlds: an extra tap on every question, for nothing. This is the payoff, and
 * the design follows the one rule that makes it useful — **lead with the
 * confidently wrong**. Everything else on this panel is context for it.
 *
 * It also has to be willing to say nothing. Under MIN_FOR_VERDICT answers there
 * is no honest pattern to report, and inventing one from four questions is how
 * you teach someone to ignore the feature.
 */

const ORDER: Box[] = ['blind-spot', 'lucky', 'solid', 'known-gap'];

const TONE: Record<Box, string> = {
  'blind-spot': 'border-red-500/40 bg-red-500/[0.07] text-red-300',
  lucky: 'border-amber-500/40 bg-amber-500/[0.07] text-amber-300',
  solid: 'border-emerald-500/40 bg-emerald-500/[0.07] text-emerald-300',
  'known-gap': 'border-white/15 bg-white/[0.04] text-text-dim',
};

export const ConfidencePanel: React.FC = () => {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);

  useEffect(() => {
    let alive = true;
    listAttempts()
      .then((rows) => { if (alive) setAttempts(rows); })
      .catch(() => { if (alive) setAttempts([]); });
    return () => { alive = false; };
  }, []);

  if (attempts === null) {
    return (
      <section className="glass rounded-2xl border border-border-main p-6">
        <p className="text-[13px] text-text-dim">Loading how sure you&rsquo;ve been&hellip;</p>
      </section>
    );
  }

  const counts = tally(attempts);
  const total = attempts.length;

  if (total === 0) {
    return (
      <section className="glass rounded-2xl border border-border-main p-6">
        <h3 className="text-lg font-black tracking-tight">How sure were you?</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          Answer a quiz and StudyQuest will start tracking not just what you got wrong, but
          what you got wrong <em>while feeling certain</em>. That second list is the one
          that costs grades, and nothing else shows it to you.
        </p>
      </section>
    );
  }

  const line = verdict(counts);
  const blind = blindSpotRate(counts);
  const cal = calibration(counts);
  const risky = riskiestTopics(attempts, { limit: 4 });

  return (
    <section className="glass space-y-5 rounded-2xl border border-border-main p-6">
      <div>
        <h3 className="text-lg font-black tracking-tight">How sure were you?</h3>
        <p className="text-[13px] text-text-dim">
          {total} answered{cal !== null && ` · confidence accuracy ${Math.round(((cal + 1) / 2) * 100)}%`}
        </p>
      </div>

      {/* The verdict, when there is enough to be honest about one. */}
      {line ? (
        <p className="rounded-xl border border-brand-purple/25 bg-brand-purple/[0.07] p-4 text-[13.5px] leading-relaxed">
          {line}
        </p>
      ) : (
        <p className="text-[13px] text-text-dim">
          {MIN_FOR_VERDICT - total} more answer{MIN_FOR_VERDICT - total === 1 ? '' : 's'} and
          there&rsquo;ll be enough here to tell you something worth acting on.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {ORDER.map((box) => (
          <div key={box} className={`rounded-xl border p-3 ${TONE[box]}`}>
            <div className="text-2xl font-black tabular-nums leading-none">{counts[box]}</div>
            <div className="mt-1 text-[11px] font-black uppercase tracking-widest">
              {BOX_LABELS[box]}
            </div>
            <p className="mt-1 text-[11.5px] leading-snug opacity-70">{BOX_BLURBS[box]}</p>
          </div>
        ))}
      </div>

      {/*
        Ranked by confidently wrong, NOT by wrong. The student already knows
        which topics they find hard — those are the ones they are revising. This
        is the list they do not have.
      */}
      {risky.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-widest text-text-dim">
            Start here — you thought you knew these
          </h4>
          <div className="space-y-1.5">
            {risky.map((t) => (
              <div
                key={t.topic}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-main bg-white/[0.02] px-3 py-2"
              >
                <span className="truncate text-[13px] font-bold">{t.topic}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-red-300">
                  {t.blindSpots} of {t.attempts} sure &amp; wrong
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {blind !== null && blind === 0 && total >= MIN_FOR_VERDICT && (
        <p className="text-[12.5px] text-emerald-300/80">
          Nothing you were confidently wrong about. That is the good outcome.
        </p>
      )}
    </section>
  );
};

export default ConfidencePanel;
