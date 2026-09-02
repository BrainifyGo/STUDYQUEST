import type { ExamQuestion } from './examPaper';
import type { LossReason } from './paperSession';
import { commandWordIn } from './commandWords';

/**
 * Marking a student's answer to one exam question.
 *
 * The thing that makes this worth building is not the number. It is the
 * **reason** — a mark lost to a command word and a mark lost to not knowing the
 * material look identical on a score, and have completely different fixes. One
 * is five minutes of reading the question properly; the other is revision.
 *
 * Two rules run through the whole file:
 *
 *   MARKING TOO GENEROUSLY IS THE FAILURE THAT MATTERS. A student told they got
 *   4/4 for a 2/4 answer will walk into the exam confident and be wrong there
 *   instead, where it counts. So the prompt says to mark to the scheme rather
 *   than to encourage, and the parser refuses anything it cannot read instead of
 *   guessing a generous default.
 *
 *   NEVER AWARD MORE THAN THE QUESTION IS WORTH. Models do this, and a paper
 *   scoring 19/16 destroys trust in every number beside it.
 */

export interface MarkResult {
  awarded: number;
  available: number;
  reason: LossReason;
  feedback: string;
  modelAnswer: string;
}

/** Categories the model is allowed to return, and what each means. */
const REASON_RULES = `
- "correct"           full marks, nothing to fix
- "knowledge-gap"     they did not know the material
- "command-word"      they knew it but did the wrong instruction (described when
                      asked to explain, listed when asked to evaluate)
- "incomplete-chain"  right idea, stopped before the marks did
- "unshown-working"   right answer, but the method marks had nothing to award to
- "misread"           they answered a different question
- "unanswered"        nothing written, or nothing on the topic
`.trim();

export function buildMarkingPrompt(args: {
  question: ExamQuestion;
  answer: string;
  /** From studyLevel.promptFor(), so marking is pitched at the right year. */
  level?: string;
  subject?: string | null;
  board?: string | null;
}): string {
  const { question, answer, level, subject, board } = args;
  const marks = question.marks ?? 1;
  const cw = commandWordIn(question.text);

  return `You are a ${board ? `${board} ` : ''}GCSE examiner marking one ${subject || ''} question.

${level ? `${level}\n` : ''}
MARK TO THE MARK SCHEME, NOT TO ENCOURAGE. Being generous here is not kindness —
a student told they earned marks they did not earn will believe it until the real
exam. If the answer earns 1 of 3, say 1.

THE QUESTION (worth ${marks} mark${marks === 1 ? '' : 's'}):
${question.text}
${cw ? `\nThe command word is "${cw.word}". ${cw.demands}` : ''}

THE STUDENT'S ANSWER:
${answer.trim() || '(nothing written)'}

Reply with ONLY this JSON, no prose and no code fence:
{
  "awarded": <integer 0 to ${marks}>,
  "reason": <one of the categories below>,
  "feedback": "<two sentences at most, addressed to the student as 'you'. Say what
                cost the marks, not what they did well.>",
  "modelAnswer": "<what a full-mark answer says, briefly>"
}

Categories:
${REASON_RULES}`;
}

const REASONS: LossReason[] = [
  'correct', 'knowledge-gap', 'command-word',
  'incomplete-chain', 'unshown-working', 'misread', 'unanswered',
];

/**
 * Read a marking reply.
 *
 * Throws rather than guessing. A marker that silently returns 0 when it could
 * not understand the model teaches students they got nothing right; one that
 * silently returns full marks is worse. Both are lies, so an unreadable reply is
 * an error the caller has to handle — by asking again or saying so.
 */
export function parseMarkingReply(
  raw: string,
  available: number,
  /** Whether the student actually wrote anything. See the coercion below. */
  answered = true,
): MarkResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('The marker returned nothing.');
  }

  let text = raw.trim();
  // Models fence JSON however firmly you ask them not to.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  // And put a sentence before it.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The marker did not return a result.');

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The marker returned something unreadable.');
  }

  const rawAwarded = Number(data.awarded);
  if (!Number.isFinite(rawAwarded)) throw new Error('The marker did not give a mark.');

  /*
    Clamp, always. Models return 3/2 more often than you would hope, and one
    impossible score makes every honest one beside it look untrustworthy.
  */
  const cap = Number.isFinite(available) && available > 0 ? available : 1;
  const awarded = Math.max(0, Math.min(Math.round(rawAwarded), cap));

  const claimed = String(data.reason ?? '').trim().toLowerCase() as LossReason;
  let reason: LossReason = REASONS.includes(claimed) ? claimed : 'knowledge-gap';

  /*
    The reason has to agree with the mark, because the two are shown side by
    side and a contradiction reads as a broken app: "Full marks" above 1 out of
    3, or a fault named above a perfect score.
  */
  if (awarded >= cap) reason = 'correct';
  else if (reason === 'correct') reason = 'incomplete-chain';

  /*
    CAUGHT BY RUNNING IT. A student wrote a real paragraph about electrolysis in
    answer to a calculation question, and the marker came back "unanswered" — so
    the screen said LEFT BLANK above three lines of their own writing.

    A model reaches for "unanswered" to mean "nothing usable here", which is a
    fair judgement and the wrong word. Only the caller knows whether the box was
    actually empty, so only the caller can allow that label.
  */
  if (!answered && reason !== 'correct') reason = 'unanswered';
  else if (answered && reason === 'unanswered') reason = 'misread';

  return {
    awarded,
    available: cap,
    reason,
    feedback: String(data.feedback ?? '').trim().slice(0, 600),
    modelAnswer: String(data.modelAnswer ?? '').trim().slice(0, 800),
  };
}

/** Nothing written is not worth a model call. */
export function isBlank(answer: string): boolean {
  return !String(answer ?? '').trim();
}

export function blankResult(available: number): MarkResult {
  return {
    awarded: 0,
    available: Math.max(1, available || 1),
    reason: 'unanswered',
    feedback: 'You left this one blank. In an exam a partial answer often scores something, '
      + 'and a blank never does.',
    modelAnswer: '',
  };
}
