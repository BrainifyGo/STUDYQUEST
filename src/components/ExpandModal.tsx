import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Send, Bot, User, Sparkles, Loader2, Zap } from 'lucide-react';
import Markdown from 'react-markdown';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { auth, db, doc, getDoc, updateDoc } from '../lib/firebase';
import type { StudyMode, Flashcard, QuizQuestion, MindMapData, OutputState } from '../App';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ExpandModalProps {
  mode: StudyMode;
  content: OutputState[StudyMode];
  subject: string;
  historyId: string | null;
  isPro: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

// Plain-text version of the study kit — used as the AI's context, not for
// display. Kept separate from the rich renderer below so the AI always gets
// the full content regardless of how it's visually presented.
function formatStudyKitText(mode: StudyMode, content: OutputState[StudyMode]): string {
  if (!content) return '';
  switch (mode) {
    case 'summary':
    case 'explain':
      return content as string;
    case 'flashcards':
      return (content as Flashcard[])
        .map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`)
        .join('\n\n');
    case 'quiz':
      return (content as QuizQuestion[])
        .map((q, i) => `${i + 1}. ${q.question}\n   Options: ${q.options.join(', ')}\n   Correct answer: ${q.correctAnswer}\n   Why: ${q.explanation}`)
        .join('\n\n');
    case 'mindmap': {
      const mm = content as MindMapData;
      return `Mind map topics: ${mm.nodes.map(n => n.id).join(', ')}`;
    }
    default:
      return '';
  }
}

// Rich display version — a two-column flow for summary/explain (matches how
// the main dashboard already reads), a card grid for flashcards/quiz.
function StudyKitContent({ mode, content }: { mode: StudyMode; content: OutputState[StudyMode] }) {
  if (!content) {
    return <p className="text-text-dim">No content to show.</p>;
  }

  if (mode === 'summary' || mode === 'explain') {
    return (
      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-text-main columns-1 md:columns-2 gap-10 [&>*]:break-inside-avoid-column">
        <Markdown>{content as string}</Markdown>
      </div>
    );
  }

  if (mode === 'flashcards') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(content as Flashcard[]).map((c, i) => (
          <div key={i} className="p-5 rounded-2xl bg-glass-bg border border-border-main space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-purple">Card {i + 1}</p>
            <p className="font-bold text-text-main">{c.question}</p>
            <p className="text-sm text-text-dim">{c.answer}</p>
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'quiz') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(content as QuizQuestion[]).map((q, i) => (
          <div key={i} className="p-5 rounded-2xl bg-glass-bg border border-border-main space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-purple">Question {i + 1}</p>
            <p className="font-bold text-text-main">{q.question}</p>
            <ul className="text-sm space-y-1">
              {q.options.map((opt, oi) => (
                <li
                  key={oi}
                  className={cn(
                    opt === q.correctAnswer ? "text-green-400 font-bold" : "text-text-dim"
                  )}
                >
                  {opt}
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-dim/70 italic border-t border-border-main pt-2">{q.explanation}</p>
          </div>
        ))}
      </div>
    );
  }

  // mindmap
  const mm = content as MindMapData;
  return <p className="text-text-dim">Topics: {mm.nodes.map(n => n.id).join(', ')}</p>;
}

const NOTES_SAVE_INTERVAL = 30000;

export default function ExpandModal({ mode, content, subject, historyId, isPro, onClose, onUpgrade }: ExpandModalProps) {
  const studyKitText = formatStudyKitText(mode, content);

  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(!historyId);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: `I've got your ${subject || 'study kit'} ${mode} loaded — what's confusing you, or what do you want to go deeper on?` }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  const notesRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // Load existing notes for this study kit, if any
  useEffect(() => {
    if (!historyId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'study_history', historyId));
        if (snap.exists()) {
          const existing = (snap.data() as any).notes;
          if (existing) setNotes(existing);
        }
      } catch (err) {
        console.warn('Failed to load notes:', err);
      } finally {
        setNotesLoaded(true);
      }
    })();
  }, [historyId]);

  const saveNotes = async () => {
    if (!historyId) return;
    try {
      await updateDoc(doc(db, 'study_history', historyId), { notes: notesRef.current });
    } catch (err) {
      console.error('Failed to save notes:', err);
      toast.error('Could not save your notes. Check your connection.');
    }
  };

  // Autosave every 30s
  useEffect(() => {
    if (!historyId) return;
    const interval = setInterval(saveNotes, NOTES_SAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [historyId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const handleClose = async () => {
    // Must await this — the component unmounts immediately after onClose(),
    // and a fire-and-forget save here was the bug: notes typed right before
    // closing had no guarantee of being sent before React tore the modal down.
    await saveNotes();
    onClose();
  };

  const handleSend = async () => {
    if (!input.trim() || isSending || limitReached) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      if (!auth.currentUser) {
        toast.error('Sign in to use Go Deeper.');
        return;
      }
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/expand-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ studyKitContext: studyKitText, messages: nextMessages }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'TOKEN_LIMIT_EXCEEDED') {
          setLimitReached(true);
          toast.error("You've hit your AI usage limit for now.");
        } else {
          toast.error(data.error || 'Something went wrong. Please try again.');
        }
        return;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.result }]);
    } catch (err: any) {
      console.error('Expand chat error:', err);
      toast.error(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-bg-main flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden"
    >
      {/* Main content — study kit + notes. Its own scroll container on
          desktop; just part of the page's natural scroll on mobile. */}
      <div className="lg:flex-1 lg:overflow-y-auto lg:min-w-0">
        <div className="sticky top-0 z-20 px-6 md:px-10 py-5 border-b border-border-main bg-glass-bg backdrop-blur-xl flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">Study Kit</p>
            <h2 className="text-lg font-bold text-text-main truncate">{subject || 'Your Study Kit'}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-glass-bg text-text-dim hover:text-text-main transition-all shrink-0"
            aria-label="Close and save notes"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-w-5xl mx-auto p-6 md:p-10">
          <StudyKitContent mode={mode} content={content} />

          <div className="mt-12 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-dim">Add Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={notesLoaded ? 'Write your notes here — saved automatically...' : 'Loading notes...'}
              disabled={!notesLoaded}
              className="w-full h-40 bg-glass-bg border border-border-main rounded-2xl p-4 text-sm text-text-main resize-none focus:outline-none focus:border-brand-purple/50 transition-all placeholder:text-text-dim/50 disabled:opacity-60"
            />
          </div>
        </div>
      </div>

      {/* "Go Deeper" chat — a real full-height panel on desktop (not a small
          floating card with dead space below it), a normal stacked section
          on mobile so there's nothing fixed/floating to overlap content. */}
      <div className="w-full lg:w-[420px] shrink-0 border-t lg:border-t-0 lg:border-l border-border-main bg-glass-bg/30 flex flex-col lg:h-full">
        <div className="p-4 border-b border-border-main bg-glass-bg flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center shrink-0">
            <Sparkles className="text-brand-purple" size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-text-main">Go Deeper</h3>
            <p className="text-[10px] text-text-dim truncate">Ask anything about your study kit</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 min-h-[24rem] lg:min-h-0 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2 max-w-[90%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                msg.role === 'assistant' ? "bg-brand-purple/20 text-brand-purple" : "bg-glass-bg text-text-dim border border-border-main"
              )}>
                {msg.role === 'assistant' ? <Bot size={12} /> : <User size={12} />}
              </div>
              <div className={cn(
                "p-3 rounded-2xl text-xs leading-relaxed",
                msg.role === 'assistant'
                  ? "bg-glass-bg border border-border-main text-text-main"
                  : "bg-brand-purple text-white shadow-lg shadow-brand-purple/20"
              )}>
                <div className={cn("prose prose-sm max-w-none", msg.role === 'assistant' ? "dark:prose-invert" : "prose-invert")}>
                  <Markdown>{msg.content}</Markdown>
                </div>
              </div>
            </div>
          ))}
          {isSending && (
            <div className="flex gap-2 max-w-[90%]">
              <div className="w-6 h-6 rounded-lg bg-brand-purple/20 text-brand-purple flex items-center justify-center shrink-0">
                <Bot size={12} />
              </div>
              <div className="p-3 rounded-2xl bg-glass-bg border border-border-main flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce" />
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border-main bg-glass-bg shrink-0 space-y-2">
          {limitReached && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-brand-purple/10 border border-brand-purple/20">
              <p className="text-[10px] text-text-main leading-tight">
                {isPro ? "AI budget used up for now." : "Upgrade to Pro for a bigger AI budget."}
              </p>
              {!isPro && (
                <button
                  onClick={onUpgrade}
                  className="text-[10px] font-bold text-brand-purple flex items-center gap-1 shrink-0 hover:text-brand-purple/80 transition-colors"
                >
                  <Zap size={10} /> Upgrade
                </button>
              )}
            </div>
          )}
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={limitReached ? 'AI usage limit reached' : 'Ask a question...'}
              disabled={isSending || limitReached}
              className="w-full bg-glass-bg border border-border-main rounded-xl p-3 pr-11 resize-none focus:outline-none focus:border-brand-purple/50 transition-all text-xs text-text-main placeholder:text-text-dim/50 h-14 disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending || limitReached}
              className={cn(
                "absolute bottom-2.5 right-2.5 p-2 rounded-lg transition-all",
                input.trim() && !isSending && !limitReached
                  ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20 hover:scale-110"
                  : "bg-glass-bg text-text-dim border border-border-main"
              )}
            >
              {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
