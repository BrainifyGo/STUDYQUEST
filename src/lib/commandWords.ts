/**
 * What the question is actually asking you to do.
 *
 * GCSE questions open with a command word, and the command word — not the topic
 * — decides what earns the marks. "Describe the trend" and "Explain the trend"
 * are different questions about the same graph, and a student who describes when
 * asked to explain can know the material completely and score nothing.
 *
 * That failure is invisible in every study app, because the app only records
 * that the answer was wrong. The student concludes they do not know the topic,
 * revises it again, and loses the marks again the same way.
 *
 * The boards publish what each word demands. This encodes it, so StudyQuest can
 * say "this one wants a reason, not a description" *before* the student answers,
 * and can classify a lost mark as a command-word miss rather than a knowledge gap.
 *
 * Sources are the boards' own command word guidance, which is consistent across
 * AQA, Pearson and OCR for the words below.
 */

export interface CommandWord {
  word: string;
  /** What the student has to actually produce. */
  demands: string;
  /** The mistake this word invites, in the student's own terms. */
  trap: string;
  /** Typical mark range for a question opening with it. Guidance, not a rule. */
  typicalMarks: [number, number];
  /** Does it need a justified position rather than only facts? */
  needsJudgement: boolean;
}

/*
  Ordered longest-first where one contains another, so "compare and contrast"
  is not read as "compare".
*/
export const COMMAND_WORDS: CommandWord[] = [
  {
    word: 'evaluate',
    demands: 'Weigh both sides and reach a judgement. Marks are for the judgement, not the list.',
    trap: 'Listing advantages and disadvantages and then stopping. No conclusion, no top marks.',
    typicalMarks: [6, 12],
    needsJudgement: true,
  },
  {
    word: 'justify',
    demands: 'Give reasons for a position and say why they outweigh the alternatives.',
    trap: 'Stating the position again in different words instead of defending it.',
    typicalMarks: [4, 9],
    needsJudgement: true,
  },
  {
    word: 'to what extent',
    demands: 'Argue how far something is true, and say how far. A degree, not a yes or no.',
    trap: 'Answering as though it were "is this true", with no sense of how much.',
    typicalMarks: [8, 16],
    needsJudgement: true,
  },
  {
    word: 'discuss',
    demands: 'Set out more than one view and connect them. Balance is the mark scheme.',
    trap: 'Arguing one side thoroughly and never mentioning the other.',
    typicalMarks: [6, 12],
    needsJudgement: true,
  },
  {
    word: 'compare and contrast',
    demands: 'Both similarities and differences, stated about both things in the same sentence.',
    trap: 'Describing each one separately and leaving the reader to spot the link.',
    typicalMarks: [4, 9],
    needsJudgement: false,
  },
  {
    word: 'compare',
    demands: 'Say how they are alike and how they differ, linked explicitly.',
    trap: 'Two separate descriptions with no comparison in them.',
    typicalMarks: [2, 6],
    needsJudgement: false,
  },
  {
    word: 'explain',
    demands: 'Give reasons. Every point needs a "because" — the mechanism, not the observation.',
    trap: 'Describing what happens instead of why it happens. The most common lost mark there is.',
    typicalMarks: [2, 6],
    needsJudgement: false,
  },
  {
    word: 'describe',
    demands: 'Say what happens or what it looks like. No reasons needed, and none are credited.',
    trap: 'Explaining at length when only the description scores, and running out of time.',
    typicalMarks: [1, 4],
    needsJudgement: false,
  },
  {
    word: 'analyse',
    demands: 'Break it into parts and show how they relate. Reasoning is the mark, not the parts.',
    trap: 'Describing the parts and never linking them.',
    typicalMarks: [4, 9],
    needsJudgement: false,
  },
  {
    word: 'suggest',
    demands: 'Apply what you know to an unfamiliar case. There is often more than one right answer.',
    trap: 'Waiting to recall a taught fact when the question wants you to work one out.',
    typicalMarks: [1, 4],
    needsJudgement: false,
  },
  {
    word: 'calculate',
    demands: 'Work out a value and show the stages. Method marks exist even when the answer is wrong.',
    trap: 'Writing only the final number, so a slip costs every mark instead of one.',
    typicalMarks: [2, 5],
    needsJudgement: false,
  },
  {
    word: 'determine',
    demands: 'Reach a value or conclusion from what you are given, showing how.',
    trap: 'Stating an answer with no working to award method marks against.',
    typicalMarks: [2, 5],
    needsJudgement: false,
  },
  {
    word: 'show that',
    demands: 'Get to the value you were given, with every step visible.',
    trap: 'Jumping to the answer. The answer was printed — the working is the whole mark.',
    typicalMarks: [2, 4],
    needsJudgement: false,
  },
  {
    word: 'state',
    demands: 'One short fact. No explanation, no example.',
    trap: 'Writing a paragraph for one mark and losing time you needed later.',
    typicalMarks: [1, 2],
    needsJudgement: false,
  },
  {
    word: 'identify',
    demands: 'Name it. Nothing more is credited.',
    trap: 'Padding the answer as though length earns marks.',
    typicalMarks: [1, 2],
    needsJudgement: false,
  },
  {
    word: 'define',
    demands: 'The precise meaning, in the subject\'s own terms.',
    trap: 'An everyday paraphrase that misses the technical wording the scheme wants.',
    typicalMarks: [1, 2],
    needsJudgement: false,
  },
  {
    word: 'outline',
    demands: 'The main points briefly, without detail.',
    trap: 'Full detail, which costs time and earns nothing extra.',
    typicalMarks: [2, 4],
    needsJudgement: false,
  },
];

const byLength = [...COMMAND_WORDS].sort((a, b) => b.word.length - a.word.length);

/**
 * The command word a question is asking with, or null.
 *
 * Matched anywhere in the question, not only at the start: sub-parts routinely
 * read "(b) Explain why…" and multi-sentence questions put the instruction last.
 * Longest first, so "compare and contrast" is never read as "compare".
 */
export function commandWordIn(question: string): CommandWord | null {
  if (typeof question !== 'string' || !question.trim()) return null;
  const text = question.toLowerCase();

  for (const cw of byLength) {
    // Word boundaries, so "state" does not match "statement" or "understated".
    if (new RegExp(`\\b${cw.word}\\b`).test(text)) return cw;
  }
  return null;
}

/**
 * A short line to show beside a question before the student answers it.
 *
 * Null when there is no command word — silence beats a generic tip, which
 * teaches people to stop reading the box.
 */
export function commandHint(question: string): string | null {
  const cw = commandWordIn(question);
  return cw ? `“${cap(cw.word)}” — ${cw.demands}` : null;
}

/**
 * Does an answer look like it did what the command word asked?
 *
 * Deliberately narrow. It only reports the failure it can actually see: a
 * question that demanded reasons, answered without any. Explaining is where most
 * command-word marks are lost, and "no causal language anywhere" is a signal
 * that does not need to understand the subject to be right about.
 *
 * Everything else returns null — no opinion — because a wrong flag here would
 * tell a student their correct answer was badly written.
 */
export function missedCommand(question: string, answer: string): string | null {
  const cw = commandWordIn(question);
  if (!cw || typeof answer !== 'string') return null;

  const words = answer.trim().split(/\s+/).filter(Boolean);
  if (words.length < 8) return null;            // too short to judge fairly

  const givesReasons = /\bbecause\b|\bso that\b|\btherefore\b|\bas a result\b|\bdue to\b|\bcauses?\b|\bleads? to\b|\bwhich means\b|\bhence\b|\bso\b/i
    .test(answer);

  if ((cw.word === 'explain' || cw.word === 'analyse') && !givesReasons) {
    return `This asked you to ${cw.word}, but the answer never says *why*. ${cw.trap}`;
  }

  if (cw.needsJudgement) {
    const reachesJudgement = /\boverall\b|\bin conclusion\b|\bmost important\b|\bon balance\b|\btherefore\b|\bthe main\b|\bI think\b|\bmore significant\b/i
      .test(answer);
    if (!reachesJudgement) {
      return `“${cap(cw.word)}” wants a judgement, and this answer does not reach one. ${cw.trap}`;
    }
  }

  return null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
