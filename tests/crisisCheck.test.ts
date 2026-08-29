/**
 * Crisis detection.
 *
 * This test has two halves and BOTH are safety-critical, in opposite directions.
 *
 * Miss a real one and a teenager in trouble gets flashcards. Over-fire and an
 * A-level Sociology student cannot revise Durkheim, hits a wall, and goes to
 * ChatGPT instead — where nobody is watching at all. The second failure is
 * quieter but it is not harmless.
 *
 * The real case that started this is in here verbatim: RED typed
 * "why do people kill themself and why do they think about that" during a
 * mobile test, and the app produced a study kit titled "Suicide" with exam tips.
 */
import { describe, expect, it } from 'vitest';
import {
  CRISIS_MESSAGE, SUPPORT_BANNER, assessCrisis,
} from '../src/lib/crisisCheck';

const level = (s: string) => assessCrisis(s).level;

describe('crisis — nothing is generated for these', () => {
  const CRISIS = [
    'i want to kill myself',
    'I want to kill my self',
    'im going to kill myself',
    "i'm thinking about killing myself",
    'i tried to kill myself last year',
    'i want to die',
    'i wanna die',
    'i dont want to be here anymore',
    "i don't want to live",
    'how to kill yourself',
    'how do i kill myself',
    'whats the easiest way to die',
    'painless ways to die',
    'best way to commit suicide',
    'i want to hurt myself',
    'i keep cutting myself',
    'how to cut myself',
    'i want to end my life',
    'thinking about ending it all',
    'there is no reason to live',
    'no point in going on',
    'i want to unalive myself',
  ];
  for (const text of CRISIS) {
    it(`${text}`, () => {
      expect(level(text)).toBe('crisis');
    });
  }
});

describe('support — the kit is still made, with help attached', () => {
  const SUPPORT = [
    'durkheim theory of suicide sociology',
    'suicide rates in the uk statistics',
    'explain suicidal ideation for psychology a level',
    'self harm in health and social care',
    'why do people kill themselves',
    'the causes of suicide in young people',
    'anorexia and bulimia revision',
    'overdose treatment nursing',
  ];
  for (const text of SUPPORT) {
    it(`${text}`, () => {
      expect(level(text)).toBe('support');
    });
  }

  it('lets a real student actually study the topic', () => {
    // The point of having two levels rather than one block. If this returned
    // 'crisis', StudyQuest would refuse a topic that is literally on the
    // syllabus, and the student would simply use something else.
    expect(level('Durkheim: egoistic, altruistic, anomic and fatalistic suicide'))
      .toBe('support');
  });
});

describe("none — ordinary schoolwork and ordinary English", () => {
  const FINE = [
    'photosynthesis explained',
    'quadratic equations',
    'the causes of world war 1',
    // False friends: normal language that contains the words.
    'suicide squad film review',
    'it was a suicide mission',
    'how to kill a process on windows',
    'kill the port that is still listening',
    'im dying to know the answer',
    'this homework is killing me',
    'deadline for the coursework',
    'kill switch engineering',
    'killing time before the exam',
  ];
  for (const text of FINE) {
    it(`${text}`, () => {
      expect(level(text)).toBe('none');
    });
  }
});

describe('the case that started this', () => {
  it('RED\'s actual test no longer produces a plain study kit', () => {
    /*
      Typed during the mobile test. Verbatim, misspelling included.

      It is 'support', not 'crisis': nobody has said it is about them and nobody
      has asked how, so a psychology student asking the same thing is not
      blocked. But it is no longer 'none', which is what produced a kit with
      "Exam Tips: when answering questions about suicidal thoughts and
      behaviors" and no helpline anywhere.
    */
    const asked = 'Why do people kill themself and why do they think about that';
    expect(level(asked)).toBe('support');
    expect(level(asked)).not.toBe('none');
  });

  it('and the same question about themselves IS a crisis', () => {
    expect(level('why do i think about killing myself')).toBe('crisis');
    expect(level('i think about killing myself a lot')).toBe('crisis');
  });
});

describe('the check cannot be walked around casually', () => {
  it('a false friend does not disarm the rest of the sentence', () => {
    // Stripping "suicide squad" must not take the real sentence with it.
    expect(level('suicide squad was good but i want to kill myself')).toBe('crisis');
  });

  it('copes with missing apostrophes and loose spacing', () => {
    expect(level('i dont want to be here')).toBe('crisis');
    expect(level('i want to kill  my  self')).toBe('crisis');
  });

  it('is case-insensitive', () => {
    expect(level('I WANT TO KILL MYSELF')).toBe('crisis');
  });

  it('finds it inside a longer message', () => {
    expect(level('can you help me revise for maths, also i want to die'))
      .toBe('crisis');
  });
});

describe('bad input never throws', () => {
  // This runs inside the one route that reaches a model. It must not be the
  // reason a request 500s.
  it('handles empty, whitespace and non-strings', () => {
    expect(level('')).toBe('none');
    expect(level('   ')).toBe('none');
    expect(assessCrisis(null).level).toBe('none');
    expect(assessCrisis(undefined).level).toBe('none');
    expect(assessCrisis(42 as unknown as string).level).toBe('none');
    expect(assessCrisis({} as unknown as string).level).toBe('none');
  });
});

describe('what the person is actually shown', () => {
  it('names services that exist, with the right numbers', () => {
    expect(CRISIS_MESSAGE).toContain('116 123');      // Samaritans
    expect(CRISIS_MESSAGE).toContain('85258');        // Shout
    expect(CRISIS_MESSAGE).toContain('0800 1111');    // Childline
    expect(CRISIS_MESSAGE).toContain('999');
  });

  it('names Childline, because the users are teenagers', () => {
    // A 14-year-old will not think of it, and it is the service built for them.
    expect(CRISIS_MESSAGE).toMatch(/childline/i);
  });

  it('says they are not in trouble', () => {
    // The thing most likely to stop someone reaching out is thinking they will
    // be told off, or that a parent gets called.
    expect(CRISIS_MESSAGE).toMatch(/not in trouble/i);
  });

  it('does not diagnose, lecture, or ask a question it cannot handle', () => {
    expect(CRISIS_MESSAGE).not.toMatch(/\byou (are|have) (depressed|mentally ill)\b/i);
    expect(CRISIS_MESSAGE).not.toMatch(/\?\s*$/);
  });

  it('the support banner is short and also names a service', () => {
    expect(SUPPORT_BANNER).toContain('116 123');
    expect(SUPPORT_BANNER.split('\n').filter(Boolean).length).toBeLessThanOrEqual(4);
  });
});
