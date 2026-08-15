import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Mic, FileText, Youtube, Type, Send, Loader2, Zap, Brain, Flame, Timer, Globe, CheckCircle2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { cn } from '../lib/utils';
import { useUserStore } from '../store/useUserStore';
import { usePdfUpload } from '../hooks/usePdfUpload';
import { toast } from 'sonner';

export const DashboardView: React.FC = () => {
  const { userData, dailyGenerationCount, incrementGenerationCount, resetGenerationCount, lastGenerationDate } = useUserStore();
  const [inputMethod, setInputMethod] = useState<'text' | 'pdf' | 'youtube' | 'article'>('text');
  const [outputType, setOutputType] = useState<'summary' | 'flashcards' | 'quiz' | 'explain'>('summary');
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const today = new Date().toDateString();
    if (lastGenerationDate !== today) {
      resetGenerationCount();
    }
  }, [lastGenerationDate, resetGenerationCount]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const examplePrompts = [
    "Quantum Physics",
    "The French Revolution",
    "How photosynthesis works",
    "React Hooks basics"
  ];

  const limit = 10;
  const remaining = Math.max(0, limit - dailyGenerationCount);
  const isPro = userData?.isPro || userData?.plan === 'pro';

  const handleGenerate = () => {
    if (!isPro && remaining === 0) {
      toast.error("Daily limit reached! Upgrade to Pro for unlimited generations.");
      return;
    }
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      incrementGenerationCount();
      toast.success("Study Kit generated successfully!");
    }, 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-up">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            {greeting()}, {userData?.displayName?.split(' ')[0] || 'Scholar'}! 👋
          </h1>
          <p className="text-gray-500 font-medium mt-1">Ready to crush your studies today?</p>
        </div>
        
        {/* Quick Stats */}
        <div className="flex gap-3">
          {[
            { label: 'Study Kits Created', value: '24', icon: FileText, color: 'text-primary' },
            { label: 'Day Streak', value: userData?.streak || '7', icon: Flame, color: 'text-orange-500' },
            { label: 'Time Studied', value: '12.5h', icon: Timer, color: 'text-secondary' },
          ].map((stat, i) => (
            <div key={i} className="card-bright p-4 flex flex-col items-center justify-center min-w-[120px]">
              <stat.icon size={20} className={cn("mb-1", stat.color)} />
              <span className="text-xl font-black text-white">{stat.value}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Panel: Input Area */}
        <div className="lg:col-span-7 space-y-6">
          <div className="card-bright overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-100 bg-gray-50/50">
              {[
                { id: 'text', icon: Type, label: 'Text' },
                { id: 'youtube', icon: Youtube, label: 'YouTube' },
                { id: 'pdf', icon: FileText, label: 'PDF' },
                { id: 'article', icon: Globe, label: 'Article' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setInputMethod(tab.id as any)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold transition-all border-b-2",
                    inputMethod === tab.id 
                      ? "bg-white text-primary border-primary" 
                      : "text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-100/50"
                  )}
                >
                  <tab.icon size={18} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="p-6 space-y-6">
              {/* Textarea */}
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    inputMethod === 'text' ? "Paste your notes or a topic here..." :
                    inputMethod === 'youtube' ? "Paste YouTube video URL here..." :
                    inputMethod === 'pdf' ? "Upload your PDF file..." :
                    "Paste article URL here..."
                  }
                  className="w-full h-48 bg-white border border-gray-200 rounded-2xl p-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all resize-none font-medium"
                />
                
                {/* Example Chips */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-xs font-bold text-gray-400 self-center mr-1">Try:</span>
                  {examplePrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInputText(prompt)}
                      className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold hover:bg-primary/10 hover:text-primary transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Type Selector */}
              <div className="space-y-3">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Select Output Type</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'summary', label: 'Summary', icon: FileText },
                    { id: 'flashcards', label: 'Flashcards', icon: Brain },
                    { id: 'quiz', label: 'Quiz', icon: CheckCircle2 },
                    { id: 'explain', label: 'Explain Simple', icon: Sparkles },
                  ].map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setOutputType(type.id as any)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
                        outputType === type.id 
                          ? "bg-primary text-white shadow-lg shadow-primary/20" 
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      <type.icon size={16} />
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Smart Options */}
              <div className="flex flex-wrap gap-4 pt-2">
                {['Make it shorter', 'Exam focused', 'Bullet points'].map((opt, i) => (
                  <label key={i} className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    <span className="text-xs font-bold text-gray-500 group-hover:text-gray-700 transition-colors">{opt}</span>
                  </label>
                ))}
              </div>

              {/* Generate Button */}
              <div className="space-y-3">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || (!isPro && remaining === 0)}
                  className="w-full btn-vibrant flex items-center justify-center gap-2 py-4 group"
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
                      <span>✨ Generate Study Kit</span>
                    </>
                  )}
                </button>
                
                {!isPro && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <span>Daily Usage</span>
                      <span>{remaining} of {limit} left</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(remaining / limit) * 100}%` }}
                        className={cn(
                          "h-full transition-all duration-500",
                          remaining > 5 ? "bg-success" : remaining >= 3 ? "bg-warning" : "bg-energy"
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pro Tip Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <Zap size={20} className="text-orange-500 fill-orange-500" />
            </div>
            <div>
              <h4 className="font-bold text-orange-900">Pro Tip</h4>
              <p className="text-sm text-orange-800/70 mt-1 leading-relaxed">
                Use clear, structured notes for best AI results. Bullet points work great!
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel: Output Placeholder */}
        <div className="lg:col-span-5">
          <div className="card-bright h-full min-h-[600px] flex flex-col items-center justify-center p-12 text-center relative overflow-hidden group">
            {/* Background Decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.03)_0%,transparent_70%)]" />
            
            <div className="relative space-y-6">
              <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mx-auto relative">
                <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse-ring" />
                <Brain size={48} className="text-primary animate-bounce" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Your study kit will appear here</h3>
                <p className="text-gray-500 text-sm max-w-xs mx-auto">
                  Your AI-powered study kit will appear here in seconds
                </p>
              </div>

              <div className="flex justify-center gap-3">
                {['📝 Summary', '🃏 Flashcards', '❓ Quiz'].map((pill, i) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-white border border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest shadow-sm">
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
