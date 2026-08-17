import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Send, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import {
  watchMessages, sendMessage, deleteMessage, MAX_MESSAGE, type DirectMessage,
} from '../lib/dms';
import type { Friend } from '../lib/friends';

/**
 * One conversation with one friend.
 *
 * Deliberately not a copy of the study-room chat. That one is relayed over the
 * socket and disappears with the room; this is stored, so it has to survive both
 * people being offline, and it has to handle a conversation that is closed
 * because the friendship ended.
 */

interface DirectMessagesProps {
  friend: Friend;
  onBack: () => void;
  /** Opens a study room with this friend, so a chat can turn into revision. */
  onStudyTogether: () => void;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The day a message was sent, for the separators between days. */
function dayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const DirectMessages: React.FC<DirectMessagesProps> = ({ friend, onBack, onStudyTogether }) => {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState('');
  const [closed, setClosed] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mine = auth.currentUser?.uid;

  useEffect(() => {
    setClosed(null);
    return watchMessages(friend.uid, setMessages, (err) => setClosed(err.message));
  }, [friend.uid]);

  // Stick to the bottom as messages arrive — a chat that does not is a chat you
  // have to scroll manually every time someone speaks.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    // Cleared immediately: leaving it in the box while the write is in flight is
    // how people send the same message twice.
    setText('');
    try {
      await sendMessage(friend.uid, body);
    } catch (err: any) {
      setText(body);          // put it back, so nothing is lost
      toast.error(err?.message || 'Could not send that.');
    } finally {
      setSending(false);
    }
  };

  let lastDay = '';

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100dvh-8rem)] py-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border-main">
        <button
          onClick={onBack}
          aria-label="Back to friends"
          className="p-2 rounded-xl text-text-dim hover:text-text-main hover:bg-glass-bg transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="w-10 h-10 rounded-xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center font-black text-brand-purple shrink-0">
          {friend.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-text-main truncate">{friend.name}</p>
          {friend.username && <p className="text-xs text-text-dim truncate">@{friend.username}</p>}
        </div>
        <button
          onClick={onStudyTogether}
          className="px-3 py-2 rounded-xl bg-brand-purple/15 border border-brand-purple/30 text-brand-purple text-xs font-bold hover:bg-brand-purple hover:text-white transition-all flex items-center gap-1.5 shrink-0"
        >
          <Sparkles size={14} />
          <span className="hidden sm:inline">Study together</span>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-3 scrollbar-hide">
        {closed ? (
          <div className="rounded-2xl border border-dashed border-border-main p-8 text-center text-text-dim text-sm">
            {closed}
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-main p-8 text-center text-text-dim text-sm">
            No messages yet. Say hello to {friend.name}.
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.senderUid === mine;
            const day = dayOf(m.sentAt);
            const showDay = day !== lastDay;
            lastDay = day;

            return (
              <React.Fragment key={m.id}>
                {showDay && (
                  <p className="text-center text-[10px] font-black uppercase tracking-widest text-text-dim py-2">
                    {day}
                  </p>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex group', isMine ? 'justify-end' : 'justify-start')}
                >
                  {isMine && (
                    <button
                      onClick={() => deleteMessage(friend.uid, m.id).catch(() => toast.error('Could not delete that.'))}
                      aria-label="Delete message"
                      className="self-center mr-2 p-2 rounded-lg text-text-dim hover-reveal hover:text-red-400 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
                      isMine
                        ? 'bg-brand-purple text-white rounded-br-md'
                        : 'bg-glass-bg border border-border-main text-text-main rounded-bl-md'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    <p className={cn('text-[10px] mt-1', isMine ? 'text-white/60' : 'text-text-dim')}>
                      {timeOf(m.sentAt)}
                    </p>
                  </div>
                </motion.div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Composer */}
      {!closed && (
        <div className="pt-3 border-t border-border-main" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE))}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is a new line. On a phone the on-screen
                // keyboard's return key inserts a newline, which is what you want
                // there, so this only applies where there is a real Enter key.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              placeholder={`Message ${friend.name}...`}
              className="w-full resize-none pl-4 pr-12 py-3 rounded-2xl bg-glass-bg border border-border-main text-text-main placeholder:text-text-dim/60 focus:outline-none focus:border-brand-purple/60 transition-all max-h-32"
            />
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              aria-label="Send"
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all',
                text.trim() && !sending
                  ? 'bg-brand-purple text-white'
                  : 'text-text-dim'
              )}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DirectMessages;
