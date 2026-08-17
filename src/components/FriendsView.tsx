import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  UserPlus, Users, Check, X, Search, Loader2, Sparkles, MessageSquare, AtSign, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUserStore } from '../store/useUserStore';
import {
  findPeople, sendRequest, acceptRequest, declineRequest, removeFriend,
  watchFriends, watchIncoming, watchOutgoing, cancelRequest,
  claimUsername, usernameProblem, isUsernameFree,
  myProfile, normaliseUsername, statsFor,
  type Friend, type FriendRequest, type Person, type FriendStats,
} from '../lib/friends';
import DirectMessages from './DirectMessages';
import { cn } from '../lib/utils';

/**
 * FRIENDS.
 *
 * Claim a username, find people by username or name, accept what comes back,
 * then message them or open a study room together.
 *
 * The room is where shared notes, the shared quiz and live chat already live, so
 * "study with a friend" is a room invite rather than a second parallel system.
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
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [openChat, setOpenChat] = useState<Friend | null>(null);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);

  /*
    Friends' progress — free, and the reason the friends feature is free.

    Loaded once per friend when the list arrives rather than watched live: a
    level does not change second to second, and a listener per friend would be
    a listener per friend forever.
  */
  const [stats, setStats] = useState<Record<string, FriendStats | null>>({});

  const [username, setUsername] = useState('');
  const [claimed, setClaimed] = useState<string | undefined>();
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const offF = watchFriends(setFriends);
    const offR = watchIncoming(setIncoming);
    const offO = watchOutgoing(setOutgoing);
    myProfile().then((p) => { setClaimed(p?.username); setUsername(p?.username || ''); });
    return () => { offF(); offR(); offO(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        friends.map(async (f) => [f.uid, await statsFor(f.uid)] as const)
      );
      // The list can change while these are in flight; a late reply must not
      // repopulate stats for someone who has just been removed.
      if (!cancelled) setStats(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [friends.map((f) => f.uid).join(',')]);

  const saveUsername = async () => {
    const problem = usernameProblem(username);
    if (problem) { toast.error(problem); return; }
    setClaiming(true);
    try {
      if (!(await isUsernameFree(username))) {
        toast.error('That username is taken. Try another.');
        return;
      }
      await claimUsername(username, myName, userData?.email ?? null);
      setClaimed(normaliseUsername(username));
      toast.success(`You are @${normaliseUsername(username)}. Friends can find you with that.`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save that username.');
    } finally {
      setClaiming(false);
    }
  };

  const search = async () => {
    const q = term.trim();
    if (q.length < 3) { toast.error('Type at least 3 characters.'); return; }
    setSearching(true);
    try {
      setResults(await findPeople(q));
    } catch (err: any) {
      console.error('[friends] search failed:', err);
      toast.error('Search is not working right now.');
    } finally {
      setSearching(false);
    }
  };

  const add = async (person: Person) => {
    try {
      const outcome = await sendRequest(person.uid, myName, claimed);
      toast.success(outcome === 'accepted'
        ? `You and ${person.name} are now friends — they had already asked you.`
        : `Request sent to ${person.name}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not send that request.');
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

  const studyWith = (name: string) => {
    const code = newRoomCode();
    onStartRoom(code);
    // Copying it here saves the step everyone forgets: telling the other person.
    navigator.clipboard?.writeText(code).catch(() => {});
    toast.success(`Room ${code} opened — the code is on your clipboard, send it to ${name}.`);
  };

  if (openChat) {
    return (
      <DirectMessages
        friend={openChat}
        onBack={() => setOpenChat(null)}
        onStudyTogether={() => studyWith(openChat.name)}
      />
    );
  }

  const alreadyFriends = new Set(friends.map((f) => f.uid));
  // Read from the live list rather than a local Set, so it survives a refresh
  // and cannot disagree with what the server actually holds.
  const pendingOut = new Set(outgoing.map((r) => r.toUid));
  const pendingIn = new Set(incoming.map((r) => r.fromUid));

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6 sm:py-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-brand-purple font-bold">Friends</p>
        <h1 className="text-2xl sm:text-3xl font-black text-text-main tracking-tight">
          Study with people you know
        </h1>
        <p className="text-text-dim text-sm">
          Message them, or open a study room together with shared notes and a shared quiz.
        </p>
      </div>

      {/* Your username */}
      <section className="glass p-5 rounded-2xl border border-border-main space-y-3">
        <label className="text-xs font-black uppercase tracking-widest text-text-dim">
          Your username
        </label>
        <p className="text-xs text-text-dim">
          {claimed
            ? <>Friends can find you as <span className="text-brand-purple font-bold">@{claimed}</span>.</>
            : 'Pick one so people can find you without knowing your email.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="yourname"
              maxLength={20}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-glass-bg border border-border-main text-text-main placeholder:text-text-dim/60 focus:outline-none focus:border-brand-purple/60 transition-all"
            />
          </div>
          <button
            onClick={saveUsername}
            disabled={claiming || !username || normaliseUsername(username) === claimed}
            className="btn-primary px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 shrink-0"
          >
            {claiming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {claimed ? 'Change' : 'Claim'}
          </button>
        </div>
        <p className="text-[11px] text-text-dim">
          3–20 characters: letters, numbers, dots and underscores.
        </p>
      </section>

      {/* Find someone */}
      <section className="glass p-5 rounded-2xl border border-border-main space-y-3">
        <label className="text-xs font-black uppercase tracking-widest text-text-dim">
          Find a friend
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Username, name, or email"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-glass-bg border border-border-main text-text-main placeholder:text-text-dim/60 focus:outline-none focus:border-brand-purple/60 transition-all"
            />
          </div>
          <button
            onClick={search}
            disabled={searching || term.trim().length < 3}
            className="btn-primary px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 shrink-0"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Search
          </button>
        </div>

        {results && (
          results.length === 0 ? (
            <p className="text-sm text-text-dim pt-1">
              Nobody found. Usernames and emails have to match exactly; names match from the start.
            </p>
          ) : (
            <div className="space-y-2 pt-1">
              {results.map((p) => (
                <div key={p.uid} className="flex items-center gap-3 p-3 rounded-xl bg-glass-bg border border-border-main">
                  <span className="w-9 h-9 rounded-lg bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center font-black text-brand-purple shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-text-main truncate">{p.name}</p>
                    {p.username && <p className="text-[11px] text-text-dim truncate">@{p.username}</p>}
                  </div>
                  {alreadyFriends.has(p.uid) ? (
                    <span className="text-[11px] font-bold text-text-dim shrink-0">Already friends</span>
                  ) : pendingOut.has(p.uid) ? (
                    <button
                      onClick={async () => { await cancelRequest(p.uid); toast.success('Request withdrawn.'); }}
                      className="px-3 py-2 rounded-lg bg-glass-bg border border-border-main text-text-dim text-xs font-bold hover:text-red-400 hover:border-red-500/40 transition-all shrink-0"
                    >
                      Withdraw
                    </button>
                  ) : pendingIn.has(p.uid) ? (
                    <span className="text-[11px] font-bold text-brand-purple shrink-0">Already asked you</span>
                  ) : (
                    <button
                      onClick={() => add(p)}
                      className="px-3 py-2 rounded-lg bg-brand-purple/15 border border-brand-purple/30 text-brand-purple text-xs font-bold hover:bg-brand-purple hover:text-white transition-all flex items-center gap-1.5 shrink-0"
                    >
                      <UserPlus size={14} />
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/*
        Requests you have sent.

        There was nowhere to see these. A request left the screen the moment it
        was sent, with no way to tell whether it had arrived and no way to take
        it back — `cancelRequest` existed in the library with nothing able to
        call it.
      */}
      {outgoing.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-text-dim">
            Sent, waiting for a reply ({outgoing.length})
          </h2>
          {outgoing.map((req) => (
            <div key={req.id} className="glass p-4 rounded-2xl border border-border-main flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-glass-bg border border-border-main flex items-center justify-center shrink-0">
                <Clock size={16} className="text-text-dim" />
              </span>
              <p className="flex-1 min-w-0 text-sm text-text-dim truncate">
                Waiting for them to accept
              </p>
              <button
                onClick={async () => { await cancelRequest(req.toUid); toast.success('Request withdrawn.'); }}
                className="px-3 py-2 rounded-xl bg-glass-bg border border-border-main text-text-dim text-xs font-bold hover:text-red-400 hover:border-red-500/40 transition-all shrink-0"
              >
                Withdraw
              </button>
            </div>
          ))}
        </section>
      )}

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
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-main font-bold truncate">{req.fromName}</p>
                <p className="text-[11px] text-text-dim truncate">
                  {req.fromUsername ? `@${req.fromUsername} · ` : ''}wants to be friends
                </p>
              </div>
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
              No friends added yet. Search for someone above — you will both need an account.
            </p>
          </div>
        ) : (
          friends.map((f) => (
            <div
              key={f.uid}
              className="glass p-4 rounded-2xl border border-border-main flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <span className="w-10 h-10 rounded-xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center shrink-0 font-black text-brand-purple">
                {f.name.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-main truncate">{f.name}</p>
                {stats[f.uid] ? (
                  <p className="text-[11px] text-text-dim truncate">
                    Level {stats[f.uid]!.level}
                    <span className="mx-1.5 opacity-40">·</span>
                    {stats[f.uid]!.xp.toLocaleString()} XP
                    {stats[f.uid]!.streak > 0 && (
                      <>
                        <span className="mx-1.5 opacity-40">·</span>
                        {stats[f.uid]!.streak} day streak
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-[11px] text-text-dim truncate">
                    {f.username ? `@${f.username}` : 'No progress yet'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpenChat(f)}
                  className="px-4 py-2 rounded-xl bg-brand-purple/15 border border-brand-purple/30 text-brand-purple text-xs font-bold hover:bg-brand-purple hover:text-white transition-all flex items-center gap-1.5"
                >
                  <MessageSquare size={14} />
                  Message
                </button>
                <button
                  onClick={() => studyWith(f.name)}
                  className="px-4 py-2 rounded-xl bg-glass-bg border border-border-main text-text-main text-xs font-bold hover:border-brand-purple/50 transition-all flex items-center gap-1.5"
                >
                  <Sparkles size={14} />
                  Study
                </button>
                <button
                  onClick={async () => {
                    await removeFriend(f.uid);
                    toast.success(`Removed ${f.name}.`);
                  }}
                  className={cn(
                    'px-3 py-2 rounded-xl bg-glass-bg border border-border-main text-text-dim',
                    'text-xs font-bold hover:text-red-400 hover:border-red-500/40 transition-all'
                  )}
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
