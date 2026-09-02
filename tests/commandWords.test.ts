/**
 * Command words.
 *
 * Two halves, and the second is the dangerous one.
 *
 * Detection can afford to be eager — the worst case is a hint that did not need
 * showing. `missedCommand` cannot, because it tells a student their answer was
 * badly written. A false accusation there is worse than saying nothing at all,
 * so most of these tests are about it keeping quiet.
 */
import { describe, expect, it } from 'vitest';
import {
  COMMAND_WORDS, commandHint, commandWordIn, missedCommand,
} from '../src/lib/commandWords';

describe('finding the command word', () => {
  it('reads the instruction the marks depend on', () => {
    expect(commandWordIn('Explain why the reaction slows down.')?.word).toBe('explain');
    expect(commandWordIn('Describe the trend shown in Figure 2.')?.word).toBe('describe');
    expect(commandWordIn('Calculate the mean of the results.')?.word).toBe('calculate');
  });

  it('prefers the longer phrase where one contains another', () => {
    // "compare and contrast" must never be read as "compare" — they want
    // different things and are marked differently.
    expect(commandWordIn('Compare and contrast the two poems.')?.word)
      .toBe('compare and contrast');
    expect(commandWordIn('Compare the two poems.')?.word).toBe('compare');
  });

  it('finds it mid-question, because sub-parts put it there', () => {
    expect(commandWordIn('(b) Using Figure 1, explain how the current changes.')?.word)
      .toBe('explain');
    expect(commandWordIn('A student investigated osmosis. Suggest one improvement.')?.word)
      .toBe('suggest');
  });

  it('respects word boundaries', () => {
    // "state" inside "statement" is not a command word.
    expect(commandWordIn('Read the statement in the box.')).toBeNull();
    expect(commandWordIn('His account was understated.')).toBeNull();
  });

  it('says nothing when there is no command word', () => {
    expect(commandWordIn('What is the capital of France?')).toBeNull();
    expect(commandWordIn('')).toBeNull();
    expect(commandWordIn(null as unknown as string)).toBeNull();
  });

  it('offers a hint for a real command word and none otherwise', () => {
    expect(commandHint('Explain why ice floats.')).toMatch(/explain/i);
    expect(commandHint('Explain why ice floats.')).toMatch(/because|reasons|mechanism/i);
    // Silence beats a generic tip nobody reads.
    expect(commandHint('What is 2 + 2?')).toBeNull();
  });
});

describe('every entry is usable', () => {
  it('gives each word something to demand and a trap to avoid', () => {
    for (const cw of COMMAND_WORDS) {
      expect(cw.demands.length, cw.word).toBeGreaterThan(20);
      expect(cw.trap.length, cw.word).toBeGreaterThan(20);
    }
  });

  it('has sane mark ranges, low before high', () => {
    for (const cw of COMMAND_WORDS) {
      const [low, high] = cw.typicalMarks;
      expect(low, cw.word).toBeGreaterThan(0);
      expect(high, cw.word).toBeGreaterThanOrEqual(low);
      expect(high, cw.word).toBeLessThanOrEqual(20);
    }
  });

  it('lists no word twice', () => {
    const words = COMMAND_WORDS.map((c) => c.word);
    expect(new Set(words).size).toBe(words.length);
  });

  it('marks the essay words as needing a judgement and the recall words as not', () => {
    const need = (w: string) => COMMAND_WORDS.find((c) => c.word === w)!.needsJudgement;
    expect(need('evaluate')).toBe(true);
    expect(need('to what extent')).toBe(true);
    expect(need('state')).toBe(false);
    expect(need('calculate')).toBe(false);
  });
});

describe('spotting a command word miss — and mostly not', () => {
  it('catches describing when the question said explain', () => {
    /*
      The single most common lost mark at GCSE, and invisible to every app that
      only records right or wrong: the student knows the material, answers the
      question they thought was asked, and scores nothing.
    */
    const miss = missedCommand(
      'Explain why the rate of reaction decreases over time.',
      'The rate starts fast and then gets slower and slower until it stops completely.',
    );
    expect(miss).toMatch(/why/i);
  });

  it('stays quiet when the answer does give reasons', () => {
    expect(missedCommand(
      'Explain why the rate of reaction decreases over time.',
      'The rate decreases because the concentration of reactant falls, so there are fewer '
      + 'successful collisions per second.',
    )).toBeNull();
  });

  it('catches an evaluate answer that never reaches a judgement', () => {
    const miss = missedCommand(
      'Evaluate the use of nuclear power in the UK.',
      'Nuclear power produces a lot of energy and does not release carbon dioxide. '
      + 'However the waste is dangerous and the power stations cost a lot to build.',
    );
    expect(miss).toMatch(/judgement/i);
  });

  it('stays quiet when the judgement is there', () => {
    expect(missedCommand(
      'Evaluate the use of nuclear power in the UK.',
      'Nuclear power produces a lot of energy without carbon dioxide, though the waste is '
      + 'dangerous and it is expensive to build. Overall the low emissions matter more, '
      + 'because climate targets are the more urgent problem.',
    )).toBeNull();
  });

  it('will not judge an answer too short to judge', () => {
    // A one-line answer to a one-mark question is not a command word miss.
    expect(missedCommand('Explain why ice floats.', 'It is less dense.')).toBeNull();
  });

  it('has no opinion on words it cannot check', () => {
    /*
      THE RESTRAINT THAT MAKES IT TRUSTWORTHY. It only reports the failure it can
      actually see. Telling a student their correct "describe" answer was wrong
      would be worse than never speaking.
    */
    expect(missedCommand(
      'Describe the trend shown in the graph.',
      'The number of cases rises steadily from January to April and then falls away sharply.',
    )).toBeNull();
    expect(missedCommand(
      'State the unit of force.',
      'The unit of force is the newton, which is written with a capital N as a symbol.',
    )).toBeNull();
  });

  it('says nothing when there is no command word, or no answer', () => {
    expect(missedCommand('What is 2 + 2?', 'Four, obviously, every single time.')).toBeNull();
    expect(missedCommand('Explain why.', null as unknown as string)).toBeNull();
    expect(missedCommand('', '')).toBeNull();
  });
});
