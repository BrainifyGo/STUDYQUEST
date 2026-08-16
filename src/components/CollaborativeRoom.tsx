import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Send, Share2, Copy, Check, MessageSquare, 
  Video, Mic, MicOff, VideoOff, Settings, X, 
  Sparkles, Brain, Zap, Target, Award, Calendar, 
  ChevronRight, Activity, Plus, Search, MoreVertical,
  Clock, Trash2, Edit2, Grid, List, ChevronDown,
  Filter, Star, Download, ExternalLink, User, Bot
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { callAI } from '../lib/aiService';
import { buildStudyPrompt, parseJsonReply, normaliseQuiz } from '../lib/studyPrompts';
import type { QuizQuestion } from '../App';

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

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export default function CollaborativeRoom({ roomId: initialRoomId, userName, onClose, onPickStudyKit, currentStudyKit, onStartQuiz }: CollaborativeRoomProps) {
  const [activeRoomId, setActiveRoomId] = useState(initialRoomId || '');
  const [joinInput, setJoinInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [users, setUsers] = useState<{ id: string, name: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(true);
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

  const [roomQuiz, setRoomQuiz] = useState<QuizQuestion[]>([]);
  const [isMakingQuiz, setIsMakingQuiz] = useState(false);

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

    socketRef.current.on('connect', () => {
      console.log('Connected to study room');
      socketRef.current?.emit('join-room', { roomId: activeRoomId, userName });
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

  if (!activeRoomId) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-dark p-6">
        <div className="w-full max-w-md glass rounded-[2.5rem] border border-white/10 p-8 space-y-8 relative">
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

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">Or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            onClick={handleCreateRoom}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:border-brand-purple/40 hover:bg-white/10 transition-all"
          >
            Create New Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-row bg-bg-dark overflow-hidden">
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
            <div className="text-[10px] text-white/20 font-black uppercase tracking-widest">Share This Room</div>
            <div className="flex items-center gap-2 p-3 bg-white/5 rounded-2xl border border-white/10 group">
              <code className="flex-1 text-sm font-mono text-white/60 truncate">{activeRoomId}</code>
              <button
                onClick={copyRoomId}
                className="p-2 rounded-xl hover:bg-white/10 text-white/20 hover:text-white transition-all"
              >
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {/* User List */}
          <div className="space-y-4">
            <div className="text-[10px] text-white/20 font-black uppercase tracking-widest">Participants</div>
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5 group hover:border-brand-purple/30 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white/40 group-hover:bg-brand-purple/20 group-hover:text-brand-purple transition-all">
                    <User size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">{user.name}</div>
                    <div className="text-[10px] text-white/20 font-medium">{user.id === socketRef.current?.id ? 'You' : 'Student'}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-6 border-t border-white/10 bg-white/5 grid grid-cols-3 gap-3">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "p-3 rounded-2xl flex items-center justify-center transition-all",
              isMuted ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-white/5 text-white/40 border border-white/10 hover:text-white"
            )}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button 
            onClick={() => setIsVideoOff(!isVideoOff)}
            className={cn(
              "p-3 rounded-2xl flex items-center justify-center transition-all",
              isVideoOff ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-white/5 text-white/40 border border-white/10 hover:text-white"
            )}
          >
            {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button className="p-3 rounded-2xl bg-white/5 text-white/40 border border-white/10 hover:text-white flex items-center justify-center transition-all">
            <Settings size={20} />
          </button>
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
          <div className="max-w-4xl mx-auto space-y-8 sm:space-y-12 pb-28 md:pb-8">
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
            </div>
          </div>
        </div>

        {/* Chat. Minimised it is a bar; open it is the panel it always was. */}
        {chatMinimised ? (
          <button
            onClick={() => { setChatMinimised(false); setUnread(0); }}
            className="absolute bottom-0 right-0 left-0 md:left-auto md:w-96 glass-panel border-t md:border-l border-white/10 p-4 flex items-center gap-2 text-white hover:bg-white/5 transition-all shadow-2xl"
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
        <div className="h-[45vh] md:h-auto md:w-96 glass-panel border-t md:border-t-0 md:border-l border-white/10 flex flex-col absolute bottom-0 left-0 right-0 z-10 md:z-auto md:relative md:inset-auto shadow-2xl rounded-t-3xl md:rounded-none">
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
