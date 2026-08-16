/**
 * SCHEDULE — which study tasks belong to which exam.
 *
 * Pulled out of the component because it decides what gets DELETED, and a
 * mistake here destroys revision the student cannot get back. Deleting too
 * little leaves a schedule full of work for an exam they are not sitting;
 * deleting too much wipes work for an exam they are.
 */

export interface ExamRow {
  id: string;
  subject: string;
}

export interface TaskRow {
  id: string;
  subject: string;
  /** Set on every task generated since the link became explicit. */
  examId?: string;
}

/**
 * The tasks that should go when `examId` is deleted.
 *
 * Two rules, and the second is the careful one:
 *
 *  1. A task stamped with this exam's id belongs to it. Unambiguous.
 *
 *  2. A task with NO id is matched by subject — but only when no other exam
 *     still covers that subject. Tasks were originally linked to an exam by
 *     subject alone, which is not a link at all: two Maths exams produce
 *     indistinguishable tasks. Deleting one of them must not take the revision
 *     for the other with it, so when the subject is still needed the unstamped
 *     tasks are kept.
 *
 * Keeping a task too long is a tidiness problem. Deleting one wrongly is lost
 * work, so where the two are in tension this keeps.
 */
export function tasksToRemove(
  examId: string,
  exams: ExamRow[],
  tasks: TaskRow[]
): TaskRow[] {
  const exam = exams.find((e) => e.id === examId);
  if (!exam) return [];

  const subject = (exam.subject || '').trim().toLowerCase();
  const subjectStillNeeded = exams.some(
    (e) => e.id !== examId && (e.subject || '').trim().toLowerCase() === subject
  );

  return tasks.filter((t) => {
    if (t.examId) return t.examId === examId;
    if (subjectStillNeeded) return false;
    // An exam with no subject cannot claim every unstamped task.
    return !!subject && (t.subject || '').trim().toLowerCase() === subject;
  });
}
