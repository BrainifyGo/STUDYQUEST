import { useState, useRef, useEffect } from 'react';
import { X, Mic, MicOff, AlertCircle, Sparkles, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { callAI } from '../lib/aiService';

interface VoiceBuddyProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void;
}

export const VoiceBuddy = ({ 
  isOpen, 
  onClose, 
  onTranscript 
}: VoiceBuddyProps) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const supported = 'SpeechRecognition' in window || 
      'webkitSpeechRecognition' in window;
    setIsSupported(supported);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      setTranscript('');
      setInterimText('');
      setError('');
      setAiResponse('');
      setIsAsking(false);
      window.speechSynthesis?.cancel();
    }
  }, [isOpen]);

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  };

  const startListening = () => {
    if (!isSupported) {
      setError('Speech recognition not supported. Use Chrome or Edge.');
      return;
    }

    stopListening();
    setError('');
    setTranscript('');
    setInterimText('');

    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      if (interim) setInterimText(interim);
      if (final) {
        setTranscript(prev => prev + ' ' + final);
        setInterimText('');
      }
    };

    recognition.onerror = (event: any) => {
      const errors: Record<string, string> = {
        'network': 'Network error. Check your internet connection.',
        'not-allowed': 'Microphone blocked. Click the padlock icon in your browser address bar and allow microphone access.',
        'no-speech': 'No speech detected. Please try speaking again.',
        'audio-capture': 'No microphone found. Please connect a microphone.',
        'service-not-allowed': 'Speech service not available. Make sure you are on localhost.',
        'aborted': '',
      };
      const msg = errors[event.error] ?? 
        'Voice error: ' + event.error;
      if (msg) setError(msg);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      setError('Failed to start microphone. Please try again.');
      setIsListening(false);
    }
  };

  const handleUseTranscript = () => {
    const finalText = transcript.trim();
    if (!finalText) {
      toast.error('No speech recorded yet. Please speak first.');
      return;
    }
    onTranscript(finalText);
    onClose();
    toast.success('Text added to input!');
  };

  const handleAskAI = async () => {
    const question = transcript.trim();
    if (!question) {
      toast.error('No speech recorded yet. Please speak first.');
      return;
    }
    setIsAsking(true);
    setAiResponse('');
    try {
      const response = await callAI(
        question,
        'You are Voice Buddy, a friendly study assistant. Answer briefly and clearly in a couple of sentences, suitable for reading aloud.'
      );
      setAiResponse(response);
      window.speechSynthesis?.cancel();
      const utterance = new SpeechSynthesisUtterance(response);
      window.speechSynthesis?.speak(utterance);
    } catch (err: any) {
      if (err?.message === 'TOKEN_LIMIT_EXCEEDED') {
        toast.error("You've hit your AI usage limit for now.");
      } else {
        console.error('Voice Buddy AI error:', err);
        toast.error('Could not get a response. Please try again.');
      }
    } finally {
      setIsAsking(false);
    }
  };

  const handleClose = () => {
    stopListening();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 
          backdrop-blur-sm z-40"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="fixed top-1/2 left-1/2 
        -translate-x-1/2 -translate-y-1/2 
        w-full max-w-sm bg-[#0f0f1a] border 
        border-white/10 rounded-2xl p-6 z-50 
        shadow-2xl">

        {/* Header */}
        <div className="flex items-center 
          justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white">
              Voice Buddy
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Speak your notes or topic
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center 
              justify-center rounded-full bg-white/10 
              hover:bg-white/20 text-white/60 
              hover:text-white transition-colors 
              cursor-pointer"
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {/* Not supported warning */}
        {!isSupported && (
          <div className="flex items-start gap-3 p-3 
            bg-red-500/10 border border-red-500/20 
            rounded-xl mb-4">
            <AlertCircle size={16} 
              className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">
              Voice input not supported in this browser. 
              Please use Chrome or Edge.
            </p>
          </div>
        )}

        {/* Mic Button */}
        <div className="flex flex-col items-center 
          gap-4 my-6">
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!isSupported}
            type="button"
            className={`w-20 h-20 rounded-full flex 
              items-center justify-center transition-all 
              cursor-pointer disabled:opacity-40 
              disabled:cursor-not-allowed ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {isListening 
              ? <MicOff size={32} className="text-white" />
              : <Mic size={32} className="text-white" />
            }
          </button>
          <p className="text-sm text-white/50">
            {isListening
              ? 'Listening... click to stop'
              : isAsking
                ? 'Processing...'
                : 'Click to start speaking'
            }
          </p>
        </div>

        {/* Interim text */}
        {interimText && (
          <div className="p-3 bg-white/5 rounded-xl 
            mb-3 min-h-12">
            <p className="text-sm text-white/40 italic">
              {interimText}
            </p>
          </div>
        )}

        {/* Final transcript */}
        {transcript && (
          <div className="p-3 bg-white/5 border
            border-white/10 rounded-xl mb-4">
            <p className="text-xs text-white/40
              uppercase tracking-wider mb-1">
              Transcript
            </p>
            <p className="text-sm text-white leading-relaxed">
              {transcript}
            </p>
          </div>
        )}

        {/* AI response */}
        {aiResponse && (
          <div className="p-3 bg-purple-500/10 border
            border-purple-500/20 rounded-xl mb-4">
            <p className="text-xs text-purple-300
              uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Volume2 size={12} />
              Voice Buddy says
            </p>
            <p className="text-sm text-white leading-relaxed">
              {aiResponse}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 
            bg-red-500/10 border border-red-500/20 
            rounded-xl mb-4">
            <AlertCircle size={14} 
              className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-300">
                {error}
              </p>
              <button
                onClick={startListening}
                className="text-xs text-purple-400 
                  hover:text-purple-300 underline mt-1"
                type="button"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleUseTranscript}
            disabled={!transcript.trim()}
            type="button"
            className="flex-1 py-3 bg-white/10
              hover:bg-white/20 disabled:opacity-30
              disabled:cursor-not-allowed text-white
              rounded-xl font-semibold transition-colors
              cursor-pointer text-sm"
          >
            Use This Text
          </button>
          <button
            onClick={handleAskAI}
            disabled={!transcript.trim() || isAsking}
            type="button"
            className="flex-1 py-3 bg-purple-600
              hover:bg-purple-700 disabled:opacity-30
              disabled:cursor-not-allowed text-white
              rounded-xl font-semibold transition-colors
              cursor-pointer text-sm flex items-center
              justify-center gap-1.5"
          >
            <Sparkles size={14} />
            {isAsking ? 'Asking...' : 'Ask AI'}
          </button>
        </div>
      </div>
    </>
  );
};

export default VoiceBuddy;
