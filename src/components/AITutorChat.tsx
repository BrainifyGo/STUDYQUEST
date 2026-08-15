import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Sparkles, RefreshCw, X, MessageSquare, Brain } from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';
import { callAI } from '../lib/aiService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AITutorChatProps {
  context?: string;
  onClose: () => void;
}

export default function AITutorChat({ context, onClose }: AITutorChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your Brainify AI Tutor. I've analyzed your study material. What would you like me to explain in more detail?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const systemPrompt = `
        You are an expert AI Study Tutor for Brainify AI.
        Your goal is to help the student understand their study material better.

        CONTEXT OF STUDY MATERIAL:
        ${context || 'No specific context provided yet.'}

        INSTRUCTIONS:
        - Be encouraging and clear.
        - Use simple analogies for complex topics.
        - Use Markdown for formatting.
        - If the user asks something outside the context, try to relate it back to the study material if possible.
      `;

      const result = await callAI(input, systemPrompt);

      const assistantMessage: Message = { role: 'assistant', content: result || "I'm sorry, I couldn't process that. Could you try rephrasing?" };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat Error:', error);
      const message = error?.message === 'TOKEN_LIMIT_EXCEEDED'
        ? "You've hit your AI usage limit for now. Try again later or upgrade to Pro."
        : "Oops! Something went wrong. Please check your connection and try again.";
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <motion.div 
      initial={{ x: 400 }}
      animate={{ x: 0 }}
      exit={{ x: 400 }}
      className="fixed top-0 right-0 h-full w-full md:w-[400px] glass border-l border-border-main z-[100] flex flex-col shadow-2xl"
    >
      {/* Header */}
      <div className="p-6 border-b border-border-main flex items-center justify-between bg-glass-bg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center">
            <Brain className="text-brand-purple" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-text-main">AI Study Tutor</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-text-dim uppercase tracking-widest font-bold">Online</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-glass-bg text-text-dim hover:text-text-main transition-all"
        >
          <X size={20} />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
      >
        {messages.map((msg, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex gap-3 max-w-[85%]",
              msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
              msg.role === 'assistant' ? "bg-brand-purple/20 text-brand-purple" : "bg-glass-bg text-text-dim border border-border-main"
            )}>
              {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div className={cn(
              "p-4 rounded-2xl text-sm leading-relaxed",
              msg.role === 'assistant' 
                ? "bg-glass-bg border border-border-main text-text-main" 
                : "bg-brand-purple text-white shadow-lg shadow-brand-purple/20"
            )}>
              <div className={cn(
                "prose prose-sm max-w-none",
                msg.role === 'assistant' ? "prose-slate dark:prose-invert" : "prose-invert"
              )}>
                <Markdown>{msg.content}</Markdown>
              </div>
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <div className="flex gap-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-xl bg-brand-purple/20 text-brand-purple flex items-center justify-center shrink-0">
              <Bot size={16} />
            </div>
            <div className="p-4 rounded-2xl bg-glass-bg border border-border-main flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 border-t border-border-main bg-glass-bg">
        <div className="relative group">
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask your tutor anything..."
            className="w-full bg-glass-bg border border-border-main rounded-2xl p-4 pr-14 resize-none focus:outline-none focus:border-brand-purple/50 transition-all text-sm text-text-main placeholder:text-text-dim/50 h-24"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={cn(
              "absolute bottom-4 right-4 p-2.5 rounded-xl transition-all",
              input.trim() && !isTyping 
                ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20 hover:scale-110" 
                : "bg-glass-bg text-text-dim border border-border-main"
            )}
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-[10px] text-text-dim text-center mt-4 uppercase tracking-widest font-bold">
          Powered by Brainify AI • Gemini 3.1 Pro
        </p>
      </div>
    </motion.div>
  );
}
