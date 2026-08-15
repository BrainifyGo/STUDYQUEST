import Fuse from 'fuse.js';

export interface StudyKit {
  id: string;
  user_id: string;
  subject: string;
  timestamp: string;
  mode: string;
  content: string;
  outputModes: {
    summary?: string;
    flashcards?: { question: string; answer: string }[];
    quiz?: { question: string; options: string[]; correctAnswer: string; explanation: string }[];
    explain?: string;
    mindmap?: any;
  };
  created_at: string;
}

export const searchStudyKits = (kits: StudyKit[], searchTerm: string): StudyKit[] => {
  if (!searchTerm.trim()) return kits;

  const options = {
    keys: [
      'subject',
      'outputModes.summary',
      'outputModes.flashcards.question',
      'outputModes.flashcards.answer',
      'outputModes.quiz.question',
    ],
    threshold: 0.3,
  };

  const fuse = new Fuse(kits, options);
  const results = fuse.search(searchTerm);

  return results.map(result => result.item);
};
