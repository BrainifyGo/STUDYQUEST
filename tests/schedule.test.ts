/**
 * Which tasks die with an exam.
 *
 * This decides what gets DELETED. Deleting too little leaves a schedule full of
 * revision for an exam you are not sitting; deleting too much destroys work the
 * student cannot get back — so the asymmetry matters and is pinned here.
 */
import { describe, expect, it } from 'vitest';
import { tasksToRemove } from '../src/lib/schedule';

const maths1 = { id: 'e1', subject: 'Maths' };
const maths2 = { id: 'e2', subject: 'Maths' };
const bio = { id: 'e3', subject: 'Biology' };

describe('deleting an exam', () => {

  it('takes the tasks stamped with its id', () => {
    const tasks = [
      { id: 't1', subject: 'Maths', examId: 'e1' },
      { id: 't2', subject: 'Maths', examId: 'e2' },
    ];
    expect(tasksToRemove('e1', [maths1, maths2], tasks).map(t => t.id)).toEqual(['t1']);
  });

  it('takes unstamped tasks for the subject when no other exam needs it', () => {
    // Tasks made before the link was explicit are matched by subject.
    const tasks = [{ id: 't1', subject: 'Biology' }];
    expect(tasksToRemove('e3', [bio], tasks).map(t => t.id)).toEqual(['t1']);
  });

  it('KEEPS unstamped tasks when another exam still covers that subject', () => {
    // THE ONE THAT MATTERS. Two Maths exams produce indistinguishable unstamped
    // tasks; deleting one must not wipe the revision for the other.
    const tasks = [{ id: 't1', subject: 'Maths' }];
    expect(tasksToRemove('e1', [maths1, maths2], tasks)).toEqual([]);
  });

  it('still takes STAMPED tasks even when another exam shares the subject', () => {
    // A stamped task is unambiguous, so the cautious fallback does not apply.
    const tasks = [{ id: 't1', subject: 'Maths', examId: 'e1' }];
    expect(tasksToRemove('e1', [maths1, maths2], tasks).map(t => t.id)).toEqual(['t1']);
  });

  it('leaves other subjects alone', () => {
    const tasks = [
      { id: 't1', subject: 'Biology' },
      { id: 't2', subject: 'Maths' },
    ];
    expect(tasksToRemove('e3', [bio, maths1], tasks).map(t => t.id)).toEqual(['t1']);
  });

  it('ignores case and stray spaces in the subject', () => {
    const tasks = [{ id: 't1', subject: '  biology ' }];
    expect(tasksToRemove('e3', [bio], tasks).map(t => t.id)).toEqual(['t1']);
  });

  it('deletes nothing for an exam that is not there', () => {
    const tasks = [{ id: 't1', subject: 'Maths' }];
    expect(tasksToRemove('nope', [maths1], tasks)).toEqual([]);
  });

  it('will not let a blank-subject exam claim every unstamped task', () => {
    // An empty subject matching empty-ish tasks would delete the lot.
    const blank = { id: 'e9', subject: '' };
    const tasks = [{ id: 't1', subject: '' }, { id: 't2', subject: 'Maths' }];
    expect(tasksToRemove('e9', [blank], tasks)).toEqual([]);
  });
});
