import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Send, Share2, Copy, Check, MessageSquare, 
  Video, Mic, MicOff, VideoOff, Settings, X, 
  Sparkles, Brain, Zap, Target, Award, Calendar, 
  ChevronRight, Activity, Plus, Search, MoreVertical,
  Clock, Trash2, Edit2, Grid, List, ChevronDown, PhoneOff,
  Filter, Star, Download, ExternalLink, User, Bot
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { auth } from '../lib/firebase';
import { callAI } from '../lib/aiService';
import { buildStudyPrompt, parseJsonReply, normaliseQuiz } from '../lib/studyPrompts';
import { GameMode } from './GameMode';
import { MODE_ORDER, MODES } from '../lib/gameModes';
import type { QuizQuestion } from '../App';
import { CallSession, type CallSnapshot } from '../lib/call/session';
import { MediaError } from '../lib/call/media';

interface ChatMessage {
  id: string;
  user: string;
  content: string;
  timestamp: string;
  isMe: boolean;
}

interface CollaborativeRoomProps {
  roomId: string;
  userName: string;
  onClose: () => void;
  onPickStudyKit: () => void;
  currentStudyKit?: any;
  onStartQuiz?: () => void;
}

/**
 * Turn a media failure into something the person can act on.
 *
 * The distinction that matters most is "you refused permission" versus "this
 * page is not on https" — they look identical from the outside and have
 * completely different fixes.
 */
function describeMediaError(err: unknown): string {
  if (err instanceof MediaError) return err.message;
  return "Couldn't start your mic or camera.";
}

/**
 * One person's video (or their initial, when the camera is off).
 *
 * A `<video>` cannot take a MediaStream through an attribute — `srcObject` is a
 * property, so it has to be set imperatively against a ref. Writing
 * `<video src={stream}>` silently shows nothing, which is the classic first
 * WebRTC bug.
 */
function CallTile({ name, stream, speaking, muted, state }: {
  name: string;
  stream: MediaStream | null;
  speaking: boolean;
  muted?: boolean;
  state?: RTCPeerConnectionState;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');

  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className={cn(
      "relative aspect-video rounded-2xl overflow-hidden bg-white/5 border transition-all",
      speaking ? "border-brand-purple shadow-[0_0_0_2px_rgba(124,124,255,0.35)]" : "border-white/10"
    )}>
      <video
        ref={ref}
        autoPlay
        playsInline
        // Your own tile must be muted or you hear yourself on a half-second
        // delay, which makes it impossible to speak.
        muted={muted}
        className={cn("w-full h-full object-cover", !hasVideo && "hidden")}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="w-12 h-12 rounded-full bg-brand-purple/25 border border-brand-purple/30 flex items-center justify-center text-brand-purple font-black">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-white truncate">{name}</span>
        {state && state !== 'connected' && (
          <span className="text-[9px] uppercase tracking-widest font-black text-white/40 ml-auto shrink-0">
            {state === 'failed' ? 'failed' : 'connecting'}
          </span>
        )}
      </div>
    </div>
  );
}

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export default function CollaborativeRoom({ roomId: initialRoomId, userName, onClose, onPickStudyKit, currentStudyKit, onStartQuiz }: CollaborativeRoomProps) {
  const [activeRoomId, setActiveRoomId] = useState(initialRoomId || '');
  const [joinInput, setJoinInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [users, setUsers] = useState<{ id: string, name: string }[]>([]);
  const [copied, setCopied] = useState(false);
  /*
    THE CALL.

    `isMuted` and `isVideoOff` used to be two booleans that toggled two icons and
    did nothing else — there was no call to be muted on. They are gone; this is
    the real thing, driven by lib/call/session.ts (ported from GhostChat).
  */
  const [call, setCall] = useState<CallSnapshot>({
    active: false, peers: [], media: { audioEnabled: true, videoEnabled: false },
    localStream: null, warning: null,
  });
  const [joiningCall, setJoiningCall] = useState(false);
  const callRef = useRef<CallSession | null>(null);
  const [sharedNotes, setSharedNotes] = useState('');
  /*
    Chat can be put away.

    On a phone the chat panel was `absolute bottom-0 h-96` with no control of any
    kind, so it sat permanently over the shared notes — the thing you joined the
    room to write in. Minimised, it becomes a bar with an unread count.
  */
  const [chatMinimised, setChatMinimised] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [unread, setUnread] = useState(0);
  /** Who else is typing right now — from GhostChat. */
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatMinimisedRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { chatMinimisedRef.current = chatMinimised; }, [chatMinimised]);

  /** Tell the room you are typing, and stop saying so a second after you stop. */
  const signalTyping = () => {
    socketRef.current?.emit('typing', { roomId: activeRoomId, userName, typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing', { roomId: activeRoomId, userName, typing: false });
    }, 1200);
  };

  const handleCreateRoom = () => setActiveRoomId(generateRoomId());

  const handleJoinRoom = () => {
    const id = joinInput.trim().toUpperCase();
    if (!id) return;
    setActiveRoomId(id);
  };

  /*
    The room info panel is a slide-over on a phone.

    Stacked with `flex-col`, the participants panel sat above the workspace and
    took half the screen — so on a phone you opened a study room and saw a room
    code and a list of names, with the shared notes below the fold. It is a
    drawer on small screens now, and the column it always was on desktop.
  */
  const [showInfo, setShowInfo] = useState(false);

  /*
    THE ARCADE, INSIDE THE ROOM.

    The games already exist and the room already has questions once someone has
    made a quiz from the notes — they were just in two different places, so
    "let's play" meant everyone leaving the room. Playing here keeps the room
    together, and posting the result into the chat is what makes it a
    competition rather than four people playing alone in the same tab.
  */
  const [playingGame, setPlayingGame] = useState(false);
  /** Set when the server refuses the join, and why. */
  const [denied, setDenied] = useState<'pro' | 'signin' | 'error' | 'suspended' | 'blocked' | null>(null);

  const [roomQuiz, setRoomQuiz] = useState<QuizQuestion[]>([]);
  const [isMakingQuiz, setIsMakingQuiz] = useState(false);

  /*
    PUBLIC AND PRIVATE ROOMS.

    Private is the default and always has been the only kind — a six-character
    code you had to be told. Public rooms are listed so somebody with nobody to
    revise with can still find a table, which is the whole point of the feature
    for a child who does not already have three friends on the app.

    `isOwner` comes from the server on join (first person through the door), and
    it is the server that enforces every owner-only action. This flag only
    decides which buttons are drawn.
  */
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [isOwner, setIsOwner] = useState(false);
  const [newRoomPublic, setNewRoomPublic] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [openRooms, setOpenRooms] = useState<{ id: string; title: string; members: number }[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  /** Which member's moderation menu is open, by socket id. */
  const [menuFor, setMenuFor] = useState<string | null>(null);

  /** The public rooms with somebody in them, refreshed when the lobby opens. */
  const loadOpenRooms = async () => {
    setLoadingRooms(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/rooms', { headers: { Authorization: `Bearer ${idToken}` } });
      const data = await res.json();
      setOpenRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch {
      setOpenRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (!activeRoomId) loadOpenRooms();
  }, [activeRoomId]);

  const reportUser = (targetSocketId: string, name: string) => {
    socketRef.current?.emit('report-user', { targetSocketId, reason: 'Reported from a study room' });
    setMenuFor(null);
    toast.success(`Reported ${name}. Enough reports from different people suspends the account.`);
  };

  const blockUser = (targetSocketId: string, name: string) => {
    socketRef.current?.emit('block-user', { targetSocketId });
    setMenuFor(null);
    toast.success(`${name} was removed and cannot rejoin this room.`);
  };

  /*
    The call lives as long as the socket does, and is torn down with it — a
    dangling RTCPeerConnection keeps the microphone open after you have left.
  */
  useEffect(() => {
    if (!socketRef.current || !activeRoomId) return;
    const session = new CallSession(socketRef.current, userName, setCall);
    callRef.current = session;
    return () => {
      session.destroy();
      callRef.current = null;
    };
  }, [activeRoomId, userName]);

  const joinCall = async (withVideo: boolean) => {
    setJoiningCall(true);
    try {
      await callRef.current?.join(withVideo);
    } catch (err) {
      toast.error(describeMediaError(err));
    } finally {
      setJoiningCall(false);
    }
  };

  const toggleVisibility = () => {
    const next = visibility === 'public' ? 'private' : 'public';
    socketRef.current?.emit('room-visibility', { visibility: next });
    setVisibility(next);
  };

  /** Build a quiz from whatever the room has written, and share it with everyone. */
  const generateRoomQuiz = async () => {
    const notes = sharedNotes.trim();
    if (notes.length < 80) {
      toast.error('Write a bit more in the shared notes first.');
      return;
    }
    setIsMakingQuiz(true);
    try {
      const prompt = buildStudyPrompt({
        mode: 'quiz', content: notes,
        options: { shorter: false, examFocused: false, bulletPoints: false },
        isPro: false, source: 'text',
      });
      const raw = await callAI(prompt);
      if (!raw) throw new Error('The AI returned nothing.');
      const questions = normaliseQuiz(parseJsonReply(raw));
      setRoomQuiz(questions);
      // Everyone in the room gets the same questions — a "shared" quiz that only
      // exists on the machine that made it is not shared.
      socketRef.current?.emit('room-quiz', { roomId: activeRoomId, quiz: questions });
      addSystemMessage(userName + ' made a ' + questions.length + '-question quiz from the notes');
      toast.success(questions.length + ' questions ready');
    } catch (err: any) {
      console.error('[room quiz]', err);
      toast.error(err?.message === 'TOKEN_LIMIT_EXCEEDED'
        ? "That is this account's AI limit for now."
        : 'Could not make a quiz from those notes. Try adding more detail.');
    } finally {
      setIsMakingQuiz(false);
    }
  };

  const handleNotesChange = (value: string) => {
    setSharedNotes(value);
    socketRef.current?.emit('notes-update', { roomId: activeRoomId, notes: value });
  };

  useEffect(() => {
    if (!activeRoomId) return;

    // Initialize socket connection
    socketRef.current = io({
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    socketRef.current.on('connect', async () => {
      // The server verifies this token and reads the plan from Firestore. The
      // client cannot assert either — see the note on join-room in server.ts.
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      socketRef.current?.emit('join-room', {
        roomId: activeRoomId, userName, idToken,
        // Only honoured when this socket is the one that CREATES the room; a
        // joiner inherits whatever the owner set.
        visibility: newRoomPublic ? 'public' : 'private',
        title: newRoomTitle || `${userName}'s room`,
      });
    });

    socketRef.current.on('join-denied', ({ reason }: { reason: string }) => {
      setDenied(
        reason === 'PRO_REQUIRED' ? 'pro'
        : reason === 'SIGN_IN_REQUIRED' ? 'signin'
        : reason === 'SUSPENDED' ? 'suspended'
        : reason === 'BLOCKED' ? 'blocked'
        : 'error'
      );
      socketRef.current?.disconnect();
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('Study room connection error:', err);
      addSystemMessage('Failed to connect to study room. Retrying...');
    });

    socketRef.current.on('user-joined', (user: { id: string, name: string }) => {
      setUsers(prev => [...prev, user]);
      addSystemMessage(`${user.name} joined the room`);
    });

    socketRef.current.on('user-left', (userId: string) => {
      const user = users.find(u => u.id === userId);
      if (user) addSystemMessage(`${user.name} left the room`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    });

    socketRef.current.on('typing', ({ userName: who, typing }: { userName: string; typing: boolean }) => {
      setTypingUsers((prev) => {
        const without = prev.filter((n) => n !== who);
        return typing ? [...without, who] : without;
      });
    });

    socketRef.current.on('receive-message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, { ...msg, isMe: false }]);
      // Read through a ref, not the state value — the handler is bound once and
      // would otherwise be counting against whatever `chatMinimised` was at the
      // moment the room was joined.
      if (chatMinimisedRef.current) setUnread((n) => n + 1);
    });

    socketRef.current.on('room-users', (roomUsers: { id: string, name: string }[]) => {
      setUsers(roomUsers);
    });

    /*
      The state that already existed before you arrived.

      Without this a joiner saw an empty notes box, and then wiped everybody
      else's notes with it on the first keystroke.
    */
    socketRef.current.on('room-state', (state: {
      notes: string; quiz: QuizQuestion[] | null;
      visibility: 'public' | 'private'; isOwner: boolean;
    }) => {
      setSharedNotes(state.notes || '');
      setRoomQuiz(Array.isArray(state.quiz) ? state.quiz : []);
      setVisibility(state.visibility);
      setIsOwner(!!state.isOwner);
    });

    socketRef.current.on('room-visibility', (v: 'public' | 'private') => setVisibility(v));

    socketRef.current.on('removed-from-room', ({ reason }: { reason: string }) => {
      setDenied(reason === 'SUSPENDED' ? 'suspended' : 'blocked');
      socketRef.current?.disconnect();
    });

    socketRef.current.on('report-filed', ({ name }: { name: string }) => {
      addSystemMessage(`Your report about ${name} was recorded.`);
    });

    socketRef.current.on('notes-update', (notes: string) => {
      setSharedNotes(notes);
    });

    socketRef.current.on('room-quiz', (quiz: QuizQuestion[]) => {
      setRoomQuiz(Array.isArray(quiz) ? quiz : []);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [activeRoomId, userName]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const addSystemMessage = (content: string) => {
    const sysMsg: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      user: 'System',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: false
    };
    setMessages(prev => [...prev, sysMsg]);
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const newMsg: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      user: userName,
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true
    };

    setMessages(prev => [...prev, newMsg]);
    socketRef.current?.emit('send-message', { roomId: activeRoomId, message: newMsg });
    setInput('');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(activeRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /*
    WHY YOU ARE NOT IN THE ROOM.

    `denied` was being set by the join-denied handler and rendered nowhere, so
    every refusal — wrong plan, signed out, suspended — looked identical to the
    room simply never loading. A refusal the person cannot see is a bug report
    saying "study rooms don't work".
  */
  if (denied) {
    const copy = {
      pro: { title: 'Study Rooms are part of Pro', body: 'Rooms let you revise with friends in real time. Upgrade to join one.' },
      signin: { title: 'Sign in to join', body: 'Rooms are tied to your account so people know who they are studying with.' },
      suspended: { title: 'You cannot join rooms right now', body: 'Several people reported this account, so it is suspended from study rooms for 24 hours.' },
      blocked: { title: 'You were removed from this room', body: 'The person who owns this room removed you. You can still join other rooms.' },
      error: { title: 'Could not join', body: 'Something went wrong reaching the room. Try again in a moment.' },
    }[denied];

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-dark p-6">
        <div className="w-full max-w-md glass-panel rounded-[2rem] border border-white/10 p-8 space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/50">
            <Users size={24} />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">{copy.title}</h2>
          <p className="text-white/50 text-sm leading-relaxed">{copy.body}</p>
          <button
            onClick={() => { setDenied(null); setActiveRoomId(''); }}
            className="btn-primary w-full py-3 rounded-2xl font-bold"
          >
            Back to rooms
          </button>
          <button onClick={onClose} className="w-full py-2 text-white/40 hover:text-white text-sm font-medium transition-colors">
            Leave
          </button>
        </div>
      </div>
    );
  }

  if (!activeRoomId) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-dark p-6">
        <div className="w-full max-w-md glass-panel rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 p-6 sm:p-8 space-y-8 relative">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-6 right-6 p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
          >
            <X size={20} />
          </button>

          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-[2rem] bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center mx-auto">
              <Users className="text-brand-purple" size={28} />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Study Rooms</h2>
            <p className="text-white/40 text-sm">Join a friend's room or start your own</p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] text-white/40 font-black uppercase tracking-widest">Enter Room ID</label>
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
              placeholder="e.g. AB12CD"
              maxLength={6}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white font-mono tracking-widest text-center focus:outline-none focus:border-brand-purple/50 transition-all placeholder:text-white/10"
            />
            <button
              onClick={handleJoinRoom}
              disabled={!joinInput.trim()}
              className="btn-primary w-full py-3 rounded-2xl font-bold shadow-2xl shadow-brand-purple/20 disabled:opacity-40 disabled:grayscale"
            >
              Join Room
            </button>
          </div>

          {/*
            OPEN ROOMS.

            Until now the only way in was a code somebody had to send you, which
            works if you already have friends on the app and is a dead end if you
            do not. These are rooms whose owner chose to be listed.
          */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white/40 font-black uppercase tracking-widest">Open Rooms</label>
              <button
                onClick={loadOpenRooms}
                className="text-[10px] font-bold text-brand-purple hover:text-white transition-colors uppercase tracking-widest"
              >
                Refresh
              </button>
            </div>

            {loadingRooms ? (
              <p className="text-white/30 text-sm py-2">Looking…</p>
            ) : openRooms.length === 0 ? (
              <p className="text-white/30 text-sm py-2 leading-relaxed">
                No open rooms right now. Make one below and tick “List publicly” so
                other people can find it.
              </p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto scrollbar-hide">
                {openRooms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRoomId(r.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-brand-purple/40 transition-all text-left"
                  >
                    <span className="w-9 h-9 rounded-xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center text-brand-purple shrink-0">
                      <Users size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-white truncate">{r.title}</span>
                      <span className="block text-[11px] text-white/40 font-mono">{r.id}</span>
                    </span>
                    <span className="text-[11px] font-bold text-white/40 shrink-0">
                      {r.members} in
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">Or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={newRoomTitle}
              onChange={(e) => setNewRoomTitle(e.target.value.slice(0, 60))}
              placeholder="Room name — e.g. GCSE Biology revision"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand-purple/50 transition-all placeholder:text-white/20"
            />

            {/*
              Unticked by default, and that is deliberate. The people in these
              rooms are children, so being findable by strangers has to be a
              thing you choose, never a thing that happens to you.
            */}
            <label className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={newRoomPublic}
                onChange={(e) => setNewRoomPublic(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-purple shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">List publicly</span>
                <span className="block text-[11px] text-white/40 leading-relaxed">
                  Anyone can find and join. Leave it off and only people with the
                  code can get in.
                </span>
              </span>
            </label>

            <button
              onClick={handleCreateRoom}
              className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:border-brand-purple/40 hover:bg-white/10 transition-all"
            >
              Create New Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-row bg-bg-dark overflow-hidden">
      {/* A round, played over the room. Leaving it drops you straight back in. */}
      {playingGame && (
        <div className="fixed inset-0 z-[30] bg-bg-dark overflow-y-auto">
          <GameMode
            questions={roomQuiz}
            subject="Room quiz"
            onBack={() => setPlayingGame(false)}
            onAwardXP={() => { /* Room rounds are for the scoreboard, not for XP. */ }}
            onFinished={(summary) => {
              // Announced to everyone, which is the point of playing in a room.
              const line = `${userName} scored ${summary.score} (${summary.accuracy}% accuracy) on ${summary.modeName}`;
              addSystemMessage(line);
              socketRef.current?.emit('send-message', {
                roomId: activeRoomId,
                message: {
                  id: Date.now().toString(), user: 'System', content: line,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              });
            }}
          />
        </div>
      )}
      {/* Drawer backdrop, phones only. */}
      {showInfo && (
        <div
          onClick={() => setShowInfo(false)}
          className="fixed inset-0 bg-black/60 z-[15] md:hidden"
          aria-hidden="true"
        />
      )}
      {/* Sidebar - Users & Info */}
      <div className={`glass-panel border-r border-white/10 flex-col w-72 md:w-80 shrink-0
        ${showInfo
          ? 'flex fixed inset-y-0 left-0 z-20 shadow-2xl'
          : 'hidden md:flex'}`}>
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center">
              <Users className="text-brand-purple" size={20} />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white font-mono tracking-widest">Room: {activeRoomId}</h3>
              <button
                onClick={copyRoomId}
                aria-label="Copy room ID"
                className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all"
              >
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                {users.length} {users.length === 1 ? 'member' : 'members'} online
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Closes the drawer on a phone; on desktop the panel is permanent. */}
            <button
              onClick={() => setShowInfo(false)}
              aria-label="Close room details"
              className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all md:hidden"
            >
              <ChevronDown size={20} className="rotate-90" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close study room and return to dashboard"
              className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          {/* Room Info */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">Share This Room</span>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                visibility === 'public'
                  ? "bg-brand-purple/20 text-brand-purple"
                  : "bg-white/10 text-white/40"
              )}>
                {visibility}
              </span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-white/5 rounded-2xl border border-white/10 group">
              <code className="flex-1 text-sm font-mono text-white/60 truncate">{activeRoomId}</code>
              <button
                onClick={copyRoomId}
                className="p-2 rounded-xl hover:bg-white/10 text-white/20 hover:text-white transition-all"
              >
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            </div>

            {/* Only the owner sees this, and the server checks that again. */}
            {isOwner && (
              <button
                onClick={toggleVisibility}
                className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-brand-purple/40 transition-all text-xs font-bold"
              >
                {visibility === 'public' ? 'Stop listing publicly' : 'List this room publicly'}
              </button>
            )}
          </div>

          {/* The call, when there is one */}
          {call.active && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">
                  In the call
                </span>
                <span className="text-[10px] font-bold text-brand-purple">
                  {call.peers.length + 1} connected
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <CallTile
                  name={`${userName} (you)`}
                  stream={call.localStream}
                  speaking={false}
                  muted
                />
                {call.peers.map((p) => (
                  <CallTile
                    key={p.id}
                    name={p.name}
                    stream={p.stream}
                    speaking={p.speaking}
                    state={p.connectionState}
                  />
                ))}
              </div>
            </div>
          )}

          {/* User List */}
          <div className="space-y-4">
            <div className="text-[10px] text-white/20 font-black uppercase tracking-widest">Participants</div>
            <div className="space-y-3">
              {users.map((user) => {
                const isMe = user.id === socketRef.current?.id;
                return (
                <div key={user.id} className="relative flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5 group hover:border-brand-purple/30 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white/40 group-hover:bg-brand-purple/20 group-hover:text-brand-purple transition-all">
                    <User size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{user.name}</div>
                    <div className="text-[10px] text-white/20 font-medium">{isMe ? 'You' : 'Student'}</div>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />

                  {/*
                    REPORTING AND BLOCKING, ON THE PERSON.

                    Deliberately not `opacity-0 group-hover:opacity-100`: hover
                    does not exist on a phone, and a child who needs this control
                    is on a phone. It is always visible and a real tap target.
                  */}
                  {!isMe && (
                    <button
                      onClick={() => setMenuFor(menuFor === user.id ? null : user.id)}
                      aria-label={`Options for ${user.name}`}
                      className="p-2 -mr-1 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all shrink-0"
                    >
                      <MoreVertical size={16} />
                    </button>
                  )}

                  {menuFor === user.id && !isMe && (
                    <div className="absolute right-2 top-full mt-1 z-20 w-48 glass-panel rounded-xl border border-white/10 shadow-2xl overflow-hidden">
                      <button
                        onClick={() => reportUser(user.id, user.name)}
                        className="w-full px-4 py-3 text-left text-sm font-bold text-white/70 hover:text-white hover:bg-white/10 transition-all"
                      >
                        Report
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => blockUser(user.id, user.name)}
                          className="w-full px-4 py-3 text-left text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all border-t border-white/5"
                        >
                          Remove from room
                        </button>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Call controls */}
        <div className="p-6 border-t border-white/10 bg-white/5 space-y-3">
          {call.warning && (
            <p className="text-[11px] leading-relaxed text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              {call.warning}
            </p>
          )}

          {!call.active ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => joinCall(false)}
                disabled={joiningCall}
                className="p-3 rounded-2xl bg-white/5 text-white/70 border border-white/10 hover:text-white hover:border-brand-purple/40 flex items-center justify-center gap-2 transition-all text-sm font-bold disabled:opacity-40"
              >
                <Mic size={17} /> Voice
              </button>
              <button
                onClick={() => joinCall(true)}
                disabled={joiningCall}
                className="p-3 rounded-2xl bg-white/5 text-white/70 border border-white/10 hover:text-white hover:border-brand-purple/40 flex items-center justify-center gap-2 transition-all text-sm font-bold disabled:opacity-40"
              >
                <Video size={17} /> Video
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => callRef.current?.toggleAudio()}
                aria-label={call.media.audioEnabled ? 'Mute' : 'Unmute'}
                className={cn(
                  "p-3 rounded-2xl flex items-center justify-center transition-all",
                  call.media.audioEnabled
                    ? "bg-white/5 text-white/70 border border-white/10 hover:text-white"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                )}
              >
                {call.media.audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button
                onClick={() => callRef.current?.toggleVideo().catch((e) => toast.error(describeMediaError(e)))}
                aria-label={call.media.videoEnabled ? 'Turn camera off' : 'Turn camera on'}
                className={cn(
                  "p-3 rounded-2xl flex items-center justify-center transition-all",
                  call.media.videoEnabled
                    ? "bg-white/5 text-white/70 border border-white/10 hover:text-white"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                )}
              >
                {call.media.videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
              <button
                onClick={() => callRef.current?.leave()}
                aria-label="Leave the call"
                className="p-3 rounded-2xl bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 flex items-center justify-center transition-all"
              >
                <PhoneOff size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Collaborative Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/*
          Phone header. The room used to have no controls at all on a small
          screen once the info panel was scrolled past — no room code, no
          participant count, and no way out.
        */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/5 shrink-0"
             style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
          <button
            onClick={() => setShowInfo(true)}
            aria-label="Room details and participants"
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-white"
          >
            <Users size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-white/40">Room</p>
            <p className="text-sm font-mono font-bold text-white truncate">{activeRoomId}</p>
          </div>
          <span className="text-[10px] font-bold text-white/40 shrink-0">
            {users.length} online
          </span>
          <button
            onClick={onClose}
            aria-label="Leave the room"
            className="p-2 rounded-xl text-white/50 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Collaborative Canvas / Study Material */}
        <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto scrollbar-hide">
          <div className="max-w-4xl mx-auto space-y-8 sm:space-y-12 pb-chrome md:pb-8">
            <div className="text-center space-y-4">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-xs font-black uppercase tracking-[0.2em]"
              >
                <Sparkles size={14} fill="currentColor" />
                Live Collaboration
              </motion.div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">Shared Study Space</h2>
              <p className="text-white/40 text-sm max-w-xl mx-auto">
                Work together on flashcards, summaries, and quizzes in real-time. Changes are synced instantly for everyone.
              </p>
            </div>

            {/* Collaborative Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
              <div className="glass p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] border border-white/10 space-y-4 min-h-[280px] sm:min-h-[400px] flex flex-col">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 shrink-0">
                    <Edit2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Shared Notes</h3>
                    <p className="text-xs text-white/40">Synced live with everyone in the room</p>
                  </div>
                </div>
                <textarea
                  value={sharedNotes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Start typing — everyone in the room sees this in real time..."
                  className="flex-1 w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white/80 leading-relaxed resize-none focus:outline-none focus:border-brand-purple/50 transition-all placeholder:text-white/20 scrollbar-hide"
                />
              </div>

              <div className="glass p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] border border-white/10 space-y-5 min-h-[280px] sm:min-h-[400px] flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center text-white/10">
                  <Brain size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white">Shared Quiz</h3>
                  <p className="text-sm text-white/40">
                    {roomQuiz.length > 0
                      ? `${roomQuiz.length} questions, made from your shared notes.`
                      : sharedNotes.trim().length >= 80
                      ? "Turn the shared notes into a quiz for everyone in the room."
                      : "Write some shared notes first, then make a quiz from them."}
                  </p>
                </div>

                {/*
                  You can now build a quiz inside the room.

                  Previously the only route to a shared quiz was to leave, generate
                  one on the dashboard, and come back — so a room with people in it
                  and notes on the screen still could not produce a single question.
                  The notes everyone is already writing are the input.
                */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <button
                    onClick={generateRoomQuiz}
                    disabled={isMakingQuiz || sharedNotes.trim().length < 80}
                    className="px-6 py-3 rounded-2xl font-bold border border-white/10 bg-white/5 text-white hover:border-brand-purple/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isMakingQuiz ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Making it...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Quiz from notes
                      </>
                    )}
                  </button>

                  <button
                    onClick={onStartQuiz}
                    disabled={!currentStudyKit?.quiz && roomQuiz.length === 0}
                    className="btn-primary px-8 py-3 rounded-2xl font-bold shadow-2xl shadow-brand-purple/20 disabled:opacity-50 disabled:grayscale"
                  >
                    Start Quiz
                  </button>
                </div>
              </div>

              {/* Arcade */}
              <div className="glass p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] border border-white/10 space-y-5 min-h-[220px] flex flex-col items-center justify-center text-center lg:col-span-2">
                <div className="w-16 h-16 rounded-[1.5rem] bg-white/5 flex items-center justify-center text-brand-purple">
                  <Zap size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white">Arcade</h3>
                  <p className="text-sm text-white/40 max-w-md">
                    {roomQuiz.length > 0
                      ? `Play ${MODE_ORDER.map((m) => MODES[m].name).join(', ')} on the room's ${roomQuiz.length} questions. Your score goes in the chat.`
                      : 'Make a quiz from the shared notes first, then race each other through it.'}
                  </p>
                </div>
                <button
                  onClick={() => setPlayingGame(true)}
                  disabled={roomQuiz.length < 4}
                  className="btn-primary px-8 py-3 rounded-2xl font-bold shadow-2xl shadow-brand-purple/20 disabled:opacity-40 disabled:grayscale"
                >
                  Play together
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Chat. Minimised it is a bar; open it is the panel it always was. */}
        {chatMinimised ? (
          <button
            onClick={() => { setChatMinimised(false); setUnread(0); }}
            className="absolute bottom-0 left-0 right-0 md:bottom-5 md:right-5 md:left-auto md:w-64 md:rounded-2xl md:border glass-panel border-t border-white/10 p-4 flex items-center gap-2 text-white hover:bg-white/5 transition-all shadow-2xl"
          >
            <MessageSquare size={16} className="text-brand-purple" />
            <span className="text-xs font-black uppercase tracking-widest">Live Chat</span>
            {unread > 0 && (
              <span className="ml-auto min-w-[1.5rem] px-2 py-0.5 rounded-full bg-brand-purple text-white text-[11px] font-black">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            <ChevronRight size={16} className={unread > 0 ? 'rotate-[-90deg]' : 'ml-auto rotate-[-90deg]'} />
          </button>
        ) : (
        <>
        {/* On a phone the chat is a sheet over the room, so it needs a backdrop
            and a way out. Without one it just appeared and swallowed the bottom
            of the screen with nothing to tap. Desktop keeps it as a column. */}
        <div
          onClick={() => setChatMinimised(true)}
          className="fixed inset-0 bg-black/50 z-[5] md:hidden"
          aria-hidden="true"
        />
        {/*
          A CORNER, NOT A COLUMN.

          On desktop this was `md:relative`, which made it a full-height column
          filling the right of the workspace — so the chat had the same visual
          weight as the shared notes and the quiz, and pushed them into the
          middle of the screen. It is a floating card in the bottom-right corner
          now, the shape people expect a chat to be, and the workspace gets its
          width back. On a phone it stays a bottom sheet with a backdrop.
        */}
        <div className="h-[45vh] md:h-[28rem] md:w-[22rem] glass-panel border-t md:border border-white/10 flex flex-col absolute bottom-0 left-0 right-0 z-10 md:bottom-5 md:right-5 md:left-auto md:top-auto shadow-2xl rounded-t-3xl md:rounded-3xl overflow-hidden">
          <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
            <MessageSquare size={16} className="text-brand-purple" />
            <span className="text-xs font-black uppercase tracking-widest text-white">Live Chat</span>
            <button
              onClick={() => setChatMinimised(true)}
              aria-label="Minimise chat"
              title="Minimise chat"
              className="ml-auto p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide"
          >
            {messages.map((msg) => (
              <div key={msg.id} className={cn(
                "flex flex-col gap-1",
                msg.isMe ? "items-end" : "items-start",
                msg.user === 'System' ? "items-center py-2" : ""
              )}>
                {msg.user === 'System' ? (
                  <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{msg.content}</span>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{msg.user}</span>
                      <span className="text-[10px] text-white/10 font-bold">{msg.timestamp}</span>
                    </div>
                    <div className={cn(
                      "p-3 rounded-2xl text-sm max-w-[90%]",
                      msg.isMe ? "bg-brand-purple text-white shadow-lg" : "bg-white/5 border border-white/10 text-white/80"
                    )}>
                      {msg.content}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-white/10 bg-white/5">
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-1.5 pb-2 text-[11px] text-white/40">
                <span className="w-1 h-1 rounded-full bg-brand-purple animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1 h-1 rounded-full bg-brand-purple animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1 h-1 rounded-full bg-brand-purple animate-bounce" />
                <span className="ml-1">
                  {typingUsers.length === 1
                    ? `${typingUsers[0]} is typing`
                    : `${typingUsers.length} people are typing`}
                </span>
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); signalTyping(); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..."
                className="w-full bg-black/20 border border-white/5 rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-brand-purple/50 transition-all text-white placeholder:text-white/10"
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all",
                  input.trim() ? "text-brand-purple" : "text-white/10"
                )}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
