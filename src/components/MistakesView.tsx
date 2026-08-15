import React, { useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw, Check, X, Loader2, Sparkles } from 'lucide-react';
import { listMistakes, asQuiz, type Mistake } from '../lib/mistakes';
import type { QuizQuestion } from '../App';

/**
 * MY MISTAKES — the questions you got wrong, until you get them right.
 *
 * Brainify could tell a student they scored 6/10 but not which four, and nothing
 * brought those four back. This is the other half of that loop: the list is the
 * to-do, and answering one correctly removes it.
 *
 * Two modes on one screen. The list is for reading the explanation; Practise
 * re-runs the same questions through the app's own QuizComponent, so the answering
 * behaviour — including the recording and retiring — is the code that already
 * exists rather than a second copy that can drift.
 */

interface MistakesViewProps {
  onBack: () => void;
  /** Passed in so this file does not import App's quiz renderer and create a cycle. */
  renderQuiz: (questions: QuizQuestion[], onAnswered: (correct: boolean) => void) => React.ReactNode;
}

export const MistakesView: React.FC<MistakesViewProps> = ({ onBack, renderQuiz }) => {
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [practising, setPractising] = useState(false);
  const [fixed, setFixed] = useState(0);

  const load = async () => {
    setLoading(true);
    setMistakes(await listMistakes());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Reloading after a practice run is what makes the counter drop — the retire
  // happened in Firestore, and this is the screen catching up with it.
  const finishPractice = async () => {
    setPractising(false);
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
        <Loader2 className="w-8 h-8 animate-spin text-brand-purple" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">

      <button
        onClick={practising ? finishPractice : onBack}
        className="inline-flex items-center gap-2 text-text-dim hover:text-text-main transition-colors mb-6 text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        {practising ? 'Back to my mistakes' : 'Back'}
      </button>

      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-brand-purple font-bold mb-1">
          Review
        </p>
        <h1 className="text-3xl font-bold text-text-main mb-2">My mistakes</h1>
        <p className="text-text-dim">
          {mistakes.length === 0
            ? "Nothing here. Questions you get wrong will collect here so you can practise them."
            : `${mistakes.length} question${mistakes.length === 1 ? '' : 's'} to fix. ` +
              'Answer one correctly and it leaves this list.'}
        </p>
      </div>

      {mistakes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border-main p-10 text-center text-text-dim">
          Generate a quiz and get something wrong — this is where it lands.
        </div>
      )}

      {mistakes.length > 0 && !practising && (
        <>
          <button
            onClick={() => { setFixed(0); setPractising(true); }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-purple text-white font-semibold hover:opacity-90 transition-opacity mb-8"
          >
            <RotateCcw className="w-4 h-4" />
            Practise these {mistakes.length}
          </button>

          <div className="space-y-3">
            {mistakes.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-border-main bg-glass-bg p-5 border-l-4 border-l-red-500/60"
              >
                <div className="flex items-center gap-2 mb-2">
                  {m.times > 1 && (
                    <span className="text-[10px] uppercase tracking-widest font-bold text-red-400">
                      missed {m.times}&times;
                    </span>
                  )}
                  {m.subject && (
                    <span className="text-[10px] uppercase tracking-widest text-text-dim">
                      {m.subject}
                    </span>
                  )}
                </div>

                <p className="font-medium text-text-main mb-3">{m.question}</p>

                {/* Both lines carry an icon as well as a colour: green and red are
                    near-identical for red-green colourblindness. */}
                {m.chosen && (
                  <p className="flex items-center gap-2 text-sm text-red-400 mb-1">
                    <X className="w-4 h-4 shrink-0" aria-hidden="true" />
                    You said: {m.chosen}
                  </p>
                )}
                <p className="flex items-center gap-2 text-sm text-green-400">
                  <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Answer: {m.correctAnswer}
                </p>

                {m.explanation && (
                  <p className="mt-3 pt-3 border-t border-border-main text-sm text-text-dim">
                    {m.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {practising && (
        <div className="space-y-8">
          <div className="flex items-center gap-2 text-sm text-text-dim">
            <Sparkles className="w-4 h-4 text-brand-purple" />
            {fixed > 0
              ? `${fixed} fixed this round. They'll drop off the list when you go back.`
              : 'Get one right and it leaves your list.'}
          </div>

          {renderQuiz(asQuiz(mistakes), (correct) => {
            if (correct) setFixed((n) => n + 1);
          })}

          <button
            onClick={finishPractice}
            className="w-full py-3 rounded-xl border border-border-main text-text-main font-semibold hover:bg-glass-bg transition-colors"
          >
            Done — update my list
          </button>
        </div>
      )}

    </div>
  );
};

export default MistakesView;
