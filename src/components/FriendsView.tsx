import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { UserPlus, Users, Check, X, Search, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useUserStore } from '../store/useUserStore';
import {
  findPerson, sendRequest, acceptRequest, declineRequest, removeFriend,
  watchFriends, watchIncoming, type Friend, type FriendRequest,
} from '../lib/friends';
import { cn } from '../lib/utils';

/**
 * FRIENDS.
 *
 * Add someone, accept or decline what comes back, and start a study room with a
 * friend. The room is the point: it is where the shared notes, the shared quiz
 * and the chat already live, so "study with a friend" is a room invite rather
 * than a second parallel system.
 *
 * Search is by exact username or email, never a browsable directory — see the
 * note in lib/friends.ts.
 */

interface FriendsViewProps {
  /** Opens a study room with this code, so a friend can be invited into it. */
  onStartRoom: (roomId: string) => void;
}

const newRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export const FriendsView: React.FC<FriendsViewProps> = ({ onStartRoom }) => {
  const { userData } = useUserStore();
  const myName = userData?.displayName || userData?.email?.split('@')[0] || 'Student';

  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const offF = watchFriends(setFriends);
    const offR = watchIncoming(setIncoming);
    return () => { offF(); offR(); };
  }, []);

  const add = async () => {
    const q = term.trim();
    if (q.length < 3) {
      toast.error('Type their full username or email.');
      return;
    }
    setBusy(true);
    try {
      const person = await findPerson(q);
      if (!person) {
        // Deliberately the same message whether or not the account exists, so
        // this cannot be used to find out who has signed up.
        toast.error('No one found with that username or email.');
        return;
      }
      const outcome = await sendRequest(person.uid, myName);
      toast.success(outcome === 'accepted'
        ? `You and ${person.name} are now friends — they had already asked you.`
        : `Request sent to ${person.name}.`);
      setTerm('');
    } catch (err: any) {
      toast.error(err?.message || 'Could not send that request.');
    } finally {
      setBusy(false);
    }
  };

  const accept = async (req: FriendRequest) => {
    try {
      await acceptRequest(req.fromUid, req.fromName, myName);
      toast.success(`You and ${req.fromName} are now friends.`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not accept that.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-brand-purple font-bold">Friends</p>
        <h1 className="text-3xl font-black text-text-main tracking-tight">Study with people you know</h1>
        <p className="text-text-dim text-sm">
          Add a friend, then open a study room together — shared notes, a shared quiz and live chat.
        </p>
      </div>

      {/* Add someone */}
      <section className="glass p-5 rounded-2xl border border-border-main space-y-3">
        <label className="text-xs font-black uppercase tracking-widest text-text-dim">Add a friend</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Their username or email"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-glass-bg border border-border-main text-text-main placeholder:text-text-dim/60 focus:outline-none focus:border-brand-purple/60 transition-all"
            />
          </div>
          <button
            onClick={add}
            disabled={busy || term.trim().length < 3}
            className="btn-primary px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 shrink-0"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            Send request
          </button>
        </div>
        <p className="text-[11px] text-text-dim">
          You need their exact username or email — there is no list of everyone using StudyQuest to
          browse, on purpose.
        </p>
      </section>

      {/* Waiting for you */}
      {incoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-text-dim">
            Waiting for you ({incoming.length})
          </h2>
          {incoming.map((req) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass p-4 rounded-2xl border border-brand-purple/30 flex items-center gap-3"
            >
              <span className="w-10 h-10 rounded-xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center shrink-0">
                <UserPlus size={16} className="text-brand-purple" />
              </span>
              <p className="flex-1 min-w-0 text-sm text-text-main font-bold truncate">
                {req.fromName} wants to be friends
              </p>
              <button
                onClick={() => accept(req)}
                aria-label={`Accept ${req.fromName}`}
                className="p-2 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500 hover:text-white transition-all"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => declineRequest(req.fromUid)}
                aria-label={`Decline ${req.fromName}`}
                className="p-2 rounded-lg bg-glass-bg text-text-dim hover:bg-red-500 hover:text-white transition-all"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </section>
      )}

      {/* The list */}
      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-text-dim">
          Your friends ({friends.length})
        </h2>

        {friends.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-main p-10 text-center">
            <Users size={28} className="mx-auto text-text-dim mb-3" />
            <p className="text-text-dim text-sm">
              No friends added yet. Send someone a request above — you will both need an account.
            </p>
          </div>
        ) : (
          friends.map((f) => (
            <div
              key={f.uid}
              className={cn(
                'glass p-4 rounded-2xl border border-border-main',
                'flex flex-col sm:flex-row sm:items-center gap-3'
              )}
            >
              <span className="w-10 h-10 rounded-xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center shrink-0 font-black text-brand-purple">
                {f.name.charAt(0).toUpperCase()}
              </span>
              <p className="flex-1 min-w-0 text-sm font-bold text-text-main truncate">{f.name}</p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const code = newRoomCode();
                    onStartRoom(code);
                    // The code is what you send them. Copying it here saves the
                    // step everyone forgets, which is telling the other person.
                    navigator.clipboard?.writeText(code).catch(() => {});
                    toast.success(`Room ${code} opened — the code is on your clipboard, send it to ${f.name}.`);
                  }}
                  className="px-4 py-2 rounded-xl bg-brand-purple/15 border border-brand-purple/30 text-brand-purple text-xs font-bold hover:bg-brand-purple hover:text-white transition-all flex items-center gap-1.5"
                >
                  <Sparkles size={14} />
                  Study together
                </button>
                <button
                  onClick={async () => {
                    await removeFriend(f.uid);
                    toast.success(`Removed ${f.name}.`);
                  }}
                  className="px-3 py-2 rounded-xl bg-glass-bg border border-border-main text-text-dim text-xs font-bold hover:text-red-400 hover:border-red-500/40 transition-all"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
};

export default FriendsView;
