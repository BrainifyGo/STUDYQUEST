import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Swords, Loader2, Trophy, Clock, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { callAI } from '../lib/aiService';
import { buildStudyPrompt, parseJsonReply, normaliseQuiz } from '../lib/studyPrompts';
import {
  sendChallenge, recordScore, myScore, watchChallenges, watchScores,
  deleteChallenge, winnerOf, CHALLENGE_QUESTIONS,
  type Challenge, type Score,
} from '../lib/challenges';
import { GameMode } from './GameMode';
import type { Friend } from '../lib/friends';

/**
 * Challenge a friend, and see who won.
 *
 * The round itself is `GameMode` with the challenge's questions injected — the
 * same path the Arcade uses inside a study room. Both players get the SAME
 * questions because they are stored on the challenge; two scores from different
 * questions would not compare.
 *
 * Your score is written once and can never be updated, so there is no replaying
 * until you beat them. That is enforced in the rules, not here.
 */

interface ChallengesProps {
  friends: Friend[];
  onBack: () => void;
}

export const Challenges: React.FC<ChallengesProps> = ({ friends, onBack }) => {
  const me = auth.currentUser?.uid;
  const myName = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Student';

  const [list, setList] = useState<Challenge[]>([]);
  const [topic, setTopic] = useState('');
  const [target, setTarget] = useState<string>('');
  const [sending, setSending] = useState(false);

  const [playing, setPlaying] = useState<Challenge | null>(null);
  const [played, setPlayed] = useState<Record<string, boolean>>({});

  useEffect(() => watchChallenges(setList), []);

  // Which of these have you already finished? Your score is final, so this is
  // what decides whether a row says "Play" or shows the result.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        list.map(async (c) => [c.id, !!(await myScore(c.id))] as const)
      );
      if (!cancelled) setPlayed(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [list.map((c) => c.id).join(',')]);

  const send = async () => {
    const friend = friends.find((f) => f.uid === target);
    if (!friend) { toast.error('Pick a friend to challenge.'); return; }
    if (topic.trim().length < 3) { toast.error('Type a topic — "osmosis", "quadratics", "Macbeth".'); return; }

    setSending(true);
    try {
      const prompt = buildStudyPrompt({
        mode: 'quiz',
        content: `Write exactly ${CHALLENGE_QUESTIONS} GCSE-level questions about: ${topic.trim()}`,
        options: { shorter: false, examFocused: true, bulletPoints: false },
        isPro: true,               // a challenge wants a full deck whatever your plan
        source: 'text',
      });
      const raw = await callAI(prompt);
      if (!raw) throw new Error('The AI returned nothing.');
      const questions = normaliseQuiz(parseJsonReply(raw)).slice(0, CHALLENGE_QUESTIONS);

      await sendChallenge({
        toUid: friend.uid, toName: friend.name, myName,
        topic: topic.trim(), questions,
      });
      setTopic('');
      toast.success(`Challenge sent to ${friend.name}. Play it whenever you like.`);
    } catch (err: any) {
      console.error('[challenge]', err);
      toast.error(err?.message === 'TOKEN_LIMIT_EXCEEDED'
        ? 'That is your AI limit for now.'
        : 'Could not build that challenge. Try a simpler topic.');
    } finally {
      setSending(false);
    }
  };

  if (playing) {
    return (
      <div className="py-4">
        <GameMode
          questions={playing.questions}
          subject={playing.topic}
          onBack={() => setPlaying(null)}
          onAwardXP={() => { /* Challenges are for the scoreboard, not for XP. */ }}
          onFinished={async (summary) => {
            try {
              await recordScore(playing.id, {
                score: summary.score, accuracy: summary.accuracy,
                correct: summary.correct, answered: summary.answered,
              });
              setPlayed((p) => ({ ...p, [playing.id]: true }));
            } catch (err) {
              // Almost always "you have already played this one", which the
              // rules enforce. Saying so beats a silent failure.
              console.warn('[challenge] could not record score:', err);
              toast.error('Your score for this challenge is already in.');
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6 sm:py-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back to friends"
          className="p-2 rounded-xl text-text-dim hover:text-text-main hover:bg-glass-bg transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-brand-purple font-bold">Challenges</p>
          <h1 className="text-2xl font-black text-text-main tracking-tight">Race a friend</h1>
        </div>
      </div>

      {/* New challenge */}
      <section className="glass p-5 rounded-2xl border border-border-main space-y-3">
        <label className="text-xs font-black uppercase tracking-widest text-text-dim">
          Send a challenge
        </label>

        {friends.length === 0 ? (
          <p className="text-sm text-text-dim">Add a friend first — there is nobody to challenge yet.</p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="sm:w-52 px-4 py-3 rounded-xl bg-glass-bg border border-border-main text-text-main focus:outline-none focus:border-brand-purple/60 transition-all"
              >
                <option value="">Choose a friend</option>
                {friends.map((f) => (
                  <option key={f.uid} value={f.uid}>{f.name}</option>
                ))}
              </select>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Topic — osmosis, quadratics, Macbeth"
                className="flex-1 px-4 py-3 rounded-xl bg-glass-bg border border-border-main text-text-main placeholder:text-text-dim/60 focus:outline-none focus:border-brand-purple/60 transition-all"
              />
              <button
                onClick={send}
                disabled={sending || !target || topic.trim().length < 3}
                className="btn-primary px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 shrink-0"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Swords size={16} />}
                Challenge
              </button>
            </div>
            <p className="text-[11px] text-text-dim">
              {CHALLENGE_QUESTIONS} questions, the same for both of you. You each get one attempt.
            </p>
          </>
        )}
      </section>

      {/* The list */}
      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-text-dim">
          Your challenges ({list.length})
        </h2>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-main p-10 text-center text-text-dim text-sm">
            No challenges yet. Send one above.
          </div>
        ) : (
          list.map((c) => (
            <ChallengeRow
              key={c.id}
              challenge={c}
              me={me}
              alreadyPlayed={!!played[c.id]}
              onPlay={() => setPlaying(c)}
            />
          ))
        )}
      </section>
    </div>
  );
};

/** One challenge, with both scores as they arrive. */
const ChallengeRow: React.FC<{
  challenge: Challenge;
  me: string | undefined;
  alreadyPlayed: boolean;
  onPlay: () => void;
}> = ({ challenge, me, alreadyPlayed, onPlay }) => {
  const [scores, setScores] = useState<Score[]>([]);
  useEffect(() => watchScores(challenge.id, setScores), [challenge.id]);

  const mine = scores.find((s) => s.uid === me);
  const theirs = scores.find((s) => s.uid !== me);
  const opponent = challenge.fromUid === me ? challenge.toName : challenge.fromName;
  const winner = winnerOf(scores);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-4 rounded-2xl border border-border-main space-y-3"
    >
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center shrink-0">
          <Swords size={16} className="text-brand-purple" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-main truncate">{challenge.topic}</p>
          <p className="text-[11px] text-text-dim truncate">
            {challenge.fromUid === me ? `You challenged ${opponent}` : `${opponent} challenged you`}
          </p>
        </div>

        {!alreadyPlayed ? (
          <button
            onClick={onPlay}
            className="px-4 py-2 rounded-xl bg-brand-purple/15 border border-brand-purple/30 text-brand-purple text-xs font-bold hover:bg-brand-purple hover:text-white transition-all shrink-0"
          >
            Play
          </button>
        ) : (
          <button
            onClick={() => deleteChallenge(challenge.id).catch(() => toast.error('Could not remove that.'))}
            aria-label="Remove challenge"
            className="p-2 rounded-lg text-text-dim hover:text-red-400 transition-all shrink-0"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {(mine || theirs) && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <ScoreCell label="You" score={mine} isWinner={!!winner && winner === me} waiting={!mine} />
          <ScoreCell label={opponent} score={theirs} isWinner={!!winner && !!theirs && winner === theirs.uid} waiting={!theirs} />
        </div>
      )}

      {mine && theirs && !winner && (
        <p className="text-center text-[11px] font-black uppercase tracking-widest text-text-dim">
          A draw
        </p>
      )}
    </motion.div>
  );
};

const ScoreCell: React.FC<{
  label: string; score?: Score; isWinner: boolean; waiting: boolean;
}> = ({ label, score, isWinner, waiting }) => (
  <div className={cn(
    'rounded-xl border p-3 text-center',
    isWinner ? 'border-brand-purple bg-brand-purple/10' : 'border-border-main bg-glass-bg'
  )}>
    <p className="text-[10px] font-black uppercase tracking-widest text-text-dim truncate">{label}</p>
    {waiting ? (
      <p className="text-sm font-bold text-text-dim flex items-center justify-center gap-1.5 mt-1">
        <Clock size={12} /> Not played
      </p>
    ) : (
      <>
        <p className="text-lg font-black text-text-main mt-0.5">{score!.score}</p>
        <p className="text-[10px] text-text-dim">{score!.accuracy}% accuracy</p>
      </>
    )}
    {/* The trophy carries the same information as the border colour, so the
        winner is readable without relying on seeing that purple. */}
    {isWinner && <Trophy size={13} className="mx-auto mt-1 text-brand-purple" />}
  </div>
);

export default Challenges;
