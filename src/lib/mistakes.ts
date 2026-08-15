/**
 * MISTAKES — the questions you got wrong, kept until you get them right.
 *
 * Brainify could tell you that you scored 6/10. It could not tell you which four,
 * and nothing brought them back. A quiz that only reports a score tells a student
 * they failed; a list that shrinks as they fix things tells them how to stop.
 *
 * IDENTITY IS A HASH OF THE QUESTION TEXT.
 * Generated quiz questions have no id — the AI returns `{question, options,
 * correctAnswer, explanation}` and nothing else. Hashing the text gives a stable
 * document id, which is what makes "answer it right and it disappears" possible
 * across two separate generations that happened to produce the same question.
 * A new question wording is a new row, which is the correct behaviour: it is a
 * different question.
 */

import {
  db, auth, doc, setDoc, deleteDoc, getDocs, collection, query, where, limit,
} from './firebase';
import type { QuizQuestion } from '../App';
import { questionId } from './questionId';

const COLLECTION = 'study_mistakes';

/** How many to keep. Beyond this it stops being a to-do list and becomes a wall. */
const MAX_KEPT = 200;

export interface Mistake {
  id: string;
  user_id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  chosen: string;
  explanation: string;
  subject: string;
  times: number;
  created_at: string;
}

function uid(): string | null {
  return auth.currentUser?.uid ?? null;
}

/** Record a wrong answer. Re-missing the same question increments `times`. */
export async function recordMistake(
  question: QuizQuestion,
  chosen: string,
  subject = ''
): Promise<void> {
  const user = uid();
  if (!user) return;                       // guests have nowhere to save it

  const id = `${user}_${questionId(question.question)}`;
  const existing = await getMistake(id);

  const payload: Mistake = {
    id,
    user_id: user,
    question: question.question,
    options: question.options ?? [],
    correctAnswer: question.correctAnswer,
    chosen,
    explanation: question.explanation ?? '',
    subject,
    // A question you keep failing should rise to the top, so the count is kept
    // rather than the row being overwritten as if it were the first time.
    times: (existing?.times ?? 0) + 1,
    created_at: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, COLLECTION, id), payload);
  } catch (err) {
    // Never let bookkeeping break the quiz the student is in the middle of.
    console.warn('[mistakes] could not record:', err);
  }
}

/**
 * Getting it right RETIRES it. This is the entire reward loop — the list is meant
 * to shrink, and a list that only grows is a list people stop opening.
 */
export async function retireMistake(question: QuizQuestion): Promise<void> {
  const user = uid();
  if (!user) return;
  const id = `${user}_${questionId(question.question)}`;
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (err) {
    console.warn('[mistakes] could not retire:', err);
  }
}

async function getMistake(id: string): Promise<Mistake | null> {
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTION), where('id', '==', id), limit(1))
    );
    return snap.empty ? null : (snap.docs[0].data() as Mistake);
  } catch {
    return null;
  }
}

/** Everything still outstanding, most-failed first. */
export async function listMistakes(): Promise<Mistake[]> {
  const user = uid();
  if (!user) return [];
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTION), where('user_id', '==', user), limit(MAX_KEPT))
    );
    return snap.docs
      .map((d) => d.data() as Mistake)
      // Sorted here rather than in the query: ordering by `times` would need a
      // composite index, and this list is capped at 200 so the cost is nothing.
      .sort((a, b) => (b.times ?? 1) - (a.times ?? 1) ||
                      (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  } catch (err) {
    console.warn('[mistakes] could not list:', err);
    return [];
  }
}

/** Turn saved mistakes back into a practice quiz. */
export function asQuiz(mistakes: Mistake[]): QuizQuestion[] {
  return mistakes.map((m) => ({
    question: m.question,
    options: m.options,
    correctAnswer: m.correctAnswer,
    explanation: m.explanation,
  }));
}
