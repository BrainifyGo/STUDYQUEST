/**
 * Study reminder rules.
 *
 * These matter more than most tests in this repo because the output is not a
 * screen somebody can squint at — it is an email in a stranger's inbox. The two
 * failures worth designing against are sending something empty and sending the
 * same thing twice, and both are asserted here.
 */
import { describe, expect, it } from 'vitest';
import {
  EXAM_HORIZON_DAYS, composeReminder, dayKey, daysUntil, hourIn, shouldSend,
  type ReminderExam, type ReminderTask,
} from '../src/lib/reminders';

const task = (over: Partial<ReminderTask> = {}): ReminderTask => ({
  title: 'Quadratic equations', subject: 'Maths', duration: 30,
  date: '2026-08-22', completed: false, ...over,
});

const exam = (over: Partial<ReminderExam> = {}): ReminderExam => ({
  subject: 'Maths', date: '2026-08-25', importance: 'high', completed: false, ...over,
});

const TODAY = '2026-08-22';
const base = { displayName: 'Ola Arowolo', today: TODAY, tasks: [], exams: [] };

describe('dates', () => {
  it('uses the requested timezone, not the server\'s', () => {
    // A reminder that lands on the wrong day is worse than no reminder, and
    // getFullYear() would silently use wherever the server happens to run.
    const lateUk = new Date('2026-08-22T23:30:00Z');
    expect(dayKey(lateUk, 'Europe/London')).toBe('2026-08-23');   // BST, +1
    expect(dayKey(lateUk, 'UTC')).toBe('2026-08-22');
  });

  it('reads the hour in the requested timezone', () => {
    expect(hourIn(new Date('2026-08-22T06:30:00Z'), 'Europe/London')).toBe(7);
    expect(hourIn(new Date('2026-08-22T06:30:00Z'), 'UTC')).toBe(6);
  });

  it('counts whole days, including backwards', () => {
    expect(daysUntil('2026-08-22', TODAY)).toBe(0);
    expect(daysUntil('2026-08-23', TODAY)).toBe(1);
    expect(daysUntil('2026-08-29', TODAY)).toBe(7);
    expect(daysUntil('2026-08-20', TODAY)).toBe(-2);
  });

  it('survives a full timestamp and refuses nonsense', () => {
    expect(daysUntil('2026-08-25T09:00:00.000Z', TODAY)).toBe(3);
    expect(Number.isNaN(daysUntil('not a date', TODAY))).toBe(true);
  });
});

describe('nothing to say means nothing is sent', () => {
  it('no tasks and no exams produces no email', () => {
    // A daily "you have 0 tasks" is the clearest way to teach someone to ignore
    // your emails.
    expect(composeReminder(base)).toBeNull();
  });

  it('completed tasks do not count', () => {
    expect(composeReminder({ ...base, tasks: [task({ completed: true })] })).toBeNull();
  });

  it('tasks for another day do not count', () => {
    expect(composeReminder({ ...base, tasks: [task({ date: '2026-08-25' })] })).toBeNull();
  });

  it('an exam that has already happened does not count', () => {
    expect(composeReminder({ ...base, exams: [exam({ date: '2026-08-01' })] })).toBeNull();
  });

  it('an exam beyond the horizon does not count', () => {
    const far = composeReminder({ ...base, exams: [exam({ date: '2026-09-30' })] });
    expect(far).toBeNull();
  });

  it('an exam exactly on the horizon DOES count', () => {
    const edge = composeReminder({ ...base, exams: [exam({ date: '2026-08-29' })] });
    expect(edge).not.toBeNull();
    expect(edge!.nextExamDays).toBe(EXAM_HORIZON_DAYS);
  });

  it('a completed exam does not count', () => {
    expect(composeReminder({ ...base, exams: [exam({ completed: true })] })).toBeNull();
  });

  it('a malformed date does not produce an email full of NaN', () => {
    const r = composeReminder({ ...base, exams: [exam({ date: 'soon' })] });
    expect(r).toBeNull();
  });
});

describe('what it says', () => {
  it('lists today\'s tasks with their subject and length', () => {
    const r = composeReminder({ ...base, tasks: [task()] })!;
    expect(r.text).toContain('Quadratic equations');
    expect(r.text).toContain('Maths');
    expect(r.text).toContain('30 min');
    expect(r.taskCount).toBe(1);
  });

  it('uses the first name only, and copes with no name at all', () => {
    expect(composeReminder({ ...base, tasks: [task()] })!.text).toContain('Morning Ola,');
    expect(composeReminder({ ...base, displayName: '', tasks: [task()] })!.text)
      .toContain('Morning there,');
  });

  it('counts one session in the singular', () => {
    const one = composeReminder({ ...base, tasks: [task()] })!;
    expect(one.subject).toBe('1 study session today');
    const two = composeReminder({ ...base, tasks: [task(), task({ title: 'Trig' })] })!;
    expect(two.subject).toBe('2 study sessions today');
  });

  it('totals the time so the day is one number, not six', () => {
    const r = composeReminder({
      ...base, tasks: [task({ duration: 30 }), task({ title: 'Trig', duration: 45 })],
    })!;
    expect(r.text).toContain('75 minutes');
  });

  it('says today and tomorrow in words rather than as 0 and 1 days', () => {
    expect(composeReminder({ ...base, exams: [exam({ date: TODAY })] })!.text)
      .toContain('Maths is today.');
    expect(composeReminder({ ...base, exams: [exam({ date: '2026-08-23' })] })!.text)
      .toContain('Maths is tomorrow.');
    expect(composeReminder({ ...base, exams: [exam({ date: '2026-08-25' })] })!.text)
      .toContain('Maths is in 3 days.');
  });

  it('leads with the nearest exam when several are close', () => {
    const r = composeReminder({
      ...base,
      exams: [exam({ subject: 'History', date: '2026-08-27' }), exam({ subject: 'Maths', date: '2026-08-23' })],
    })!;
    expect(r.subject).toContain('Maths');
    expect(r.nextExamDays).toBe(1);
    // and still mentions the other one
    expect(r.text).toContain('History is in 5 days.');
  });

  it('always says how to turn it off', () => {
    // An email you cannot stop is the definition of spam, and the toggle
    // already exists — it just has to be findable from the email.
    const r = composeReminder({ ...base, tasks: [task()] })!;
    expect(r.text).toMatch(/turn these off in Settings/i);
  });
});

describe('who gets one', () => {
  it('sends by default, because the Settings toggle defaults to on', () => {
    expect(shouldSend({ email: 'a@b.com' }, TODAY)).toBe(true);
  });

  it('respects the toggle being off', () => {
    expect(shouldSend({ email: 'a@b.com', studyReminders: false }, TODAY)).toBe(false);
  });

  it('never sends twice in a day', () => {
    /*
      THE ONE THAT MATTERS. Without this, a server restart, a second instance,
      or a scheduler firing twice in the same hour all re-send — and the person
      receiving it has no way to tell a bug from nagging.
    */
    expect(shouldSend({ email: 'a@b.com', lastReminderDay: TODAY }, TODAY)).toBe(false);
    expect(shouldSend({ email: 'a@b.com', lastReminderDay: '2026-08-21' }, TODAY)).toBe(true);
  });

  it('refuses an account with no usable email', () => {
    expect(shouldSend({ email: null }, TODAY)).toBe(false);
    expect(shouldSend({ email: '' }, TODAY)).toBe(false);
    expect(shouldSend({ email: 'not-an-email' }, TODAY)).toBe(false);
  });
});
