/**
 * Working through a past paper across more than one sitting, and being told why
 * the marks went.
 *
 * Three properties carry this feature, and each has a block below:
 *
 *   A session survives a round trip through storage. "Come back later" is the
 *   whole request, and it fails the moment something in here stops being plain
 *   serialisable data.
 *
 *   A mark never contradicts what is printed beside it. "Full marks" above 1/3,
 *   or a fault named above a perfect score, reads as a broken app and taints
 *   every honest number next to it.
 *
 *   The app keeps quiet until it has enough marked to say something true.
 */
import { describe, expect, it } from 'vitest';
import {
  LOSS_ADVICE, LOSS_LABELS, MAX_ANSWER_CHARS, MIN_MARKED_FOR_VERDICT,
  answerQuestion, attemptFor, forStorage, goTo, lossBreakdown, markQuestion,
  nextUnanswered, progress, startSession, verdict,
  type LossReason, type PaperSession,
} from '../src/lib/paperSession';
import {
  blankResult, buildMarkingPrompt, isBlank, parseMarkingReply,
} from '../src/lib/markAnswer';
import type { ExamQuestion } from '../src/lib/examPaper';

const q = (number: string, marks: number | null, text = `Question ${number}`): ExamQuestion =>
  ({ number, text, marks });

const paper = () => startSession({
  id: 's1',
  paperTitle: 'AQA Maths Paper 1',
  board: 'AQA',
  subject: 'Mathematics',
  questions: [q('1', 2), q('2', 3), q('3(a)', 1), q('3(b)', 4)],
});

/** Mark every question full, so progress and verdicts have something to chew on. */
const markAll = (s: PaperSession, reason: LossReason, fraction = 0): PaperSession =>
  s.attempts.reduce(
    (acc, a) => markQuestion(acc, a.number, {
      awarded: Math.round((a.available ?? 0) * fraction),
      reason,
    }),
    s,
  );

describe('a session is plain data that survives being put away', () => {
  it('holds nothing that would not come back out of Firestore', () => {
    /*
      THE REQUEST IS "SAVE IT AND COME BACK LATER". That fails the moment
      anything here is a function, a class or undefined — all three vanish
      through JSON, and the session would come back subtly broken rather than
      loudly missing.
    */
    const s = answerQuestion(paper(), '1', 'my answer');
    const round = JSON.parse(JSON.stringify(s));
    expect(round).toEqual(s);
    expect(JSON.stringify(s)).not.toContain('undefined');
  });

  it('starts every question with an attempt, so nothing is missing later', () => {
    const s = paper();
    expect(s.attempts).toHaveLength(4);
    expect(s.attempts.map((a) => a.number)).toEqual(['1', '2', '3(a)', '3(b)']);
    expect(s.attempts.every((a) => a.awarded === null && a.answer === '')).toBe(true);
  });

  it('copies the marks onto the attempt, so it reads without the questions', () => {
    expect(attemptFor(paper(), '3(b)')?.available).toBe(4);
  });

  it('caps what gets written, rather than losing a long answer silently', () => {
    const huge = 'x'.repeat(MAX_ANSWER_CHARS + 500);
    const stored = forStorage(answerQuestion(paper(), '1', huge));
    expect(attemptFor(stored, '1')!.answer).toHaveLength(MAX_ANSWER_CHARS);
  });

  it('ignores questions with no number instead of storing a broken attempt', () => {
    const s = startSession({
      id: 'x', paperTitle: 'p',
      questions: [q('1', 1), { number: '', text: 'orphan', marks: 1 }],
    });
    expect(s.attempts).toHaveLength(1);
  });
});

describe('answering', () => {
  it('records what was written', () => {
    const s = answerQuestion(paper(), '2', 'because the rate falls');
    expect(attemptFor(s, '2')!.answer).toBe('because the rate falls');
  });

  it('clears the old marking when the answer changes', () => {
    /*
      Feedback about an answer the student has since rewritten is worse than no
      feedback: they read a criticism of something no longer on the screen.
    */
    let s = answerQuestion(paper(), '1', 'first go');
    s = markQuestion(s, '1', { awarded: 1, reason: 'incomplete-chain', feedback: 'stopped short' });
    expect(attemptFor(s, '1')!.awarded).toBe(1);

    s = answerQuestion(s, '1', 'second go, much better');
    const a = attemptFor(s, '1')!;
    expect(a.awarded).toBeNull();
    expect(a.reason).toBeNull();
    expect(a.feedback).toBe('');
  });

  it('keeps the marking when the same answer is re-submitted', () => {
    let s = answerQuestion(paper(), '1', 'same');
    s = markQuestion(s, '1', { awarded: 2, reason: 'correct' });
    s = answerQuestion(s, '1', 'same');
    expect(attemptFor(s, '1')!.awarded).toBe(2);
  });

  it('resumes at the first blank question', () => {
    let s = answerQuestion(paper(), '1', 'done');
    s = answerQuestion(s, '2', 'done');
    expect(nextUnanswered(s)).toBe(2);
  });

  it('resumes at the last question once everything is answered', () => {
    const s = paper().attempts.reduce((acc, a) => answerQuestion(acc, a.number, 'x'), paper());
    expect(nextUnanswered(s)).toBe(3);
  });

  it('will not move the cursor off the end of the paper', () => {
    expect(goTo(paper(), 99).cursor).toBe(3);
    expect(goTo(paper(), -5).cursor).toBe(0);
  });
});

describe('marks never contradict what is printed beside them', () => {
  it('never awards more than the question is worth', () => {
    // Models return 3/2 more often than you would hope, and one impossible
    // score makes every honest one beside it look untrustworthy.
    const s = markQuestion(paper(), '1', { awarded: 99, reason: 'correct' });
    expect(attemptFor(s, '1')!.awarded).toBe(2);
  });

  it('never awards less than nothing', () => {
    const s = markQuestion(paper(), '1', { awarded: -4, reason: 'misread' });
    expect(attemptFor(s, '1')!.awarded).toBe(0);
  });

  it('scores out of what has been marked, not the whole paper', () => {
    /*
      A student who has done three questions well must not be shown a failing
      percentage because seven are still blank. That is the difference between
      encouragement and a lie, and the honest version is also the useful one.
    */
    let s = answerQuestion(paper(), '1', 'a');
    s = markQuestion(s, '1', { awarded: 2, reason: 'correct' });
    const p = progress(s);
    expect(p.awarded).toBe(2);
    expect(p.outOf).toBe(2);
    expect(p.percent).toBe(100);
    expect(p.paperTotal).toBe(10);
    expect(p.complete).toBe(false);
  });

  it('has no percentage at all before anything is marked', () => {
    expect(progress(paper()).percent).toBeNull();
  });

  it('knows when the paper is finished', () => {
    expect(progress(markAll(paper(), 'correct', 1)).complete).toBe(true);
  });
});

describe('where the marks actually went', () => {
  it('ranks the reasons by marks lost, worst first', () => {
    let s = paper();
    s = markQuestion(s, '1', { awarded: 0, reason: 'command-word' });      // −2
    s = markQuestion(s, '2', { awarded: 0, reason: 'knowledge-gap' });     // −3
    s = markQuestion(s, '3(a)', { awarded: 0, reason: 'command-word' });   // −1
    s = markQuestion(s, '3(b)', { awarded: 4, reason: 'correct' });        // −0

    expect(lossBreakdown(s)).toEqual([
      { reason: 'command-word', lost: 3 },
      { reason: 'knowledge-gap', lost: 3 },
    ].sort((a, b) => b.lost - a.lost));
  });

  it('leaves out questions that lost nothing', () => {
    const s = markAll(paper(), 'correct', 1);
    expect(lossBreakdown(s)).toEqual([]);
  });

  it('says nothing until enough is marked to mean anything', () => {
    // Four questions is not a pattern. Claiming one teaches people to ignore it.
    let s = paper();
    s = markQuestion(s, '1', { awarded: 0, reason: 'command-word' });
    expect(progress(s).marked).toBeLessThan(MIN_MARKED_FOR_VERDICT);
    expect(verdict(s)).toBeNull();
  });

  it('names the single biggest leak once there is enough', () => {
    const s = markAll(paper(), 'command-word', 0);
    expect(verdict(s)).toMatch(/wrong instruction/i);
    expect(verdict(s)).toMatch(/100%/);
  });

  it('treats a knowledge gap kindly, because it is the honest kind', () => {
    const s = markAll(paper(), 'knowledge-gap', 0);
    expect(verdict(s)).toMatch(/revision problem|not learnt/i);
  });

  it('says so when nothing was lost', () => {
    expect(verdict(markAll(paper(), 'correct', 1))).toMatch(/full marks/i);
  });

  it('labels every reason, and advises on the ones with something to fix', () => {
    for (const r of Object.keys(LOSS_LABELS) as LossReason[]) {
      expect(LOSS_LABELS[r], r).toBeTruthy();
      expect(LOSS_ADVICE[r], r).toBeTruthy();
      // 'correct' is the exception on purpose: there is nothing to advise, and
      // padding it out to look like the others would be noise.
      if (r !== 'correct') expect(LOSS_ADVICE[r].length, r).toBeGreaterThan(30);
    }
  });
});

describe('reading what the marker sent back', () => {
  it('reads a clean reply', () => {
    const r = parseMarkingReply(
      '{"awarded": 2, "reason": "incomplete-chain", "feedback": "You stopped at the '
      + 'first step.", "modelAnswer": "Both steps."}', 3);
    expect(r).toEqual({
      awarded: 2,
      available: 3,
      reason: 'incomplete-chain',
      feedback: 'You stopped at the first step.',
      modelAnswer: 'Both steps.',
    });
  });

  it('digs it out of a code fence and a sentence of preamble', () => {
    const r = parseMarkingReply(
      'Sure! Here is the marking:\n```json\n{"awarded": 1, "reason": "misread"}\n```', 2);
    expect(r.awarded).toBe(1);
    expect(r.reason).toBe('misread');
  });

  it('clamps a mark the question cannot carry', () => {
    expect(parseMarkingReply('{"awarded": 9, "reason": "correct"}', 3).awarded).toBe(3);
    expect(parseMarkingReply('{"awarded": -2, "reason": "misread"}', 3).awarded).toBe(0);
  });

  it('never prints a reason that contradicts the mark', () => {
    // "Full marks" above 1/3 is how a marking screen loses a student's trust.
    expect(parseMarkingReply('{"awarded": 1, "reason": "correct"}', 3).reason)
      .not.toBe('correct');
    expect(parseMarkingReply('{"awarded": 3, "reason": "knowledge-gap"}', 3).reason)
      .toBe('correct');
  });

  it('will not say "left blank" above an answer the student wrote', () => {
    /*
      CAUGHT BY RUNNING IT, not by a fixture. A student wrote a real paragraph
      about electrolysis in answer to a calculation question, the marker replied
      "unanswered" — a fair judgement, the wrong word — and the screen said
      LEFT BLANK above three lines of their own writing.

      Only the caller knows whether the box was empty, so only the caller can
      permit that label.
    */
    expect(parseMarkingReply('{"awarded": 0, "reason": "unanswered"}', 4, true).reason)
      .toBe('misread');
    expect(parseMarkingReply('{"awarded": 0, "reason": "unanswered"}', 4, false).reason)
      .toBe('unanswered');
  });

  it('still lets a genuinely blank answer be called blank', () => {
    expect(parseMarkingReply('{"awarded": 0, "reason": "knowledge-gap"}', 4, false).reason)
      .toBe('unanswered');
  });

  it('falls back to a real category for one it does not recognise', () => {
    expect(parseMarkingReply('{"awarded": 0, "reason": "vibes"}', 2).reason)
      .toBe('knowledge-gap');
  });

  it('THROWS rather than guessing when it cannot read the reply', () => {
    /*
      A silent 0 tells a student they got nothing right; a silent full mark is
      worse. Both are lies, so an unreadable reply has to be an error the caller
      handles rather than a number nobody can trace.
    */
    for (const bad of ['', '   ', 'I could not mark this', '{broken', '{"reason":"correct"}']) {
      expect(() => parseMarkingReply(bad, 3), JSON.stringify(bad)).toThrow();
    }
    expect(() => parseMarkingReply(null as unknown as string, 3)).toThrow();
  });
});

describe('what the marker is asked', () => {
  it('tells it the marks available and shows the answer', () => {
    const prompt = buildMarkingPrompt({
      question: q('4', 3, 'Explain why the rate decreases.'),
      answer: 'It slows down.',
      board: 'AQA',
    });
    expect(prompt).toContain('worth 3 marks');
    expect(prompt).toContain('Explain why the rate decreases.');
    expect(prompt).toContain('It slows down.');
  });

  it('warns it off being generous, which is the failure that matters', () => {
    const prompt = buildMarkingPrompt({ question: q('1', 2), answer: 'a' });
    expect(prompt).toMatch(/not to encourage|generous/i);
  });

  it('passes the command word through, since it decides the marks', () => {
    const prompt = buildMarkingPrompt({
      question: q('1', 3, 'Evaluate the use of nuclear power.'),
      answer: 'It is good and bad.',
    });
    expect(prompt).toMatch(/command word is "evaluate"/i);
    expect(prompt).toMatch(/judgement/i);
  });

  it('carries the student level through when there is one', () => {
    const prompt = buildMarkingPrompt({
      question: q('1', 2), answer: 'a', level: 'Year 10, set 1 of 4 for Maths.',
    });
    expect(prompt).toContain('Year 10, set 1 of 4');
  });

  it('says so when nothing was written', () => {
    expect(buildMarkingPrompt({ question: q('1', 2), answer: '   ' }))
      .toContain('(nothing written)');
  });
});

describe('a blank answer', () => {
  it('is recognised without asking a model', () => {
    // No point spending a generation, or a student's daily allowance, on ''.
    expect(isBlank('')).toBe(true);
    expect(isBlank('   \n ')).toBe(true);
    expect(isBlank('something')).toBe(false);
  });

  it('scores nothing, and says why that is worth avoiding', () => {
    const r = blankResult(3);
    expect(r.awarded).toBe(0);
    expect(r.reason).toBe('unanswered');
    expect(r.feedback).toMatch(/partial answer|blank never/i);
  });
});
