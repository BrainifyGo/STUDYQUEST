import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ChevronRight, 
  Sparkles,
  BookOpen,
  Target,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db, auth, collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, handleFirestoreError, OperationType } from '../lib/firebase';
import { callAI } from '../lib/aiService';
import { toast } from 'sonner';

interface Exam {
  id: string;
  subject: string;
  date: string;
  importance: 'low' | 'medium' | 'high';
  completed: boolean;
}

interface StudyTask {
  id: string;
  title: string;
  subject: string;
  duration: number; // minutes
  date: string;
  completed: boolean;
}

export default function StudyPlanner() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAddExam, setShowAddExam] = useState(false);
  
  const [newExam, setNewExam] = useState({
    subject: '',
    date: '',
    importance: 'medium' as 'low' | 'medium' | 'high'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const examsQuery = query(collection(db, 'exams'), where('userId', '==', auth.currentUser.uid));
      const tasksQuery = query(collection(db, 'study_tasks'), where('userId', '==', auth.currentUser.uid));
      
      const [examsSnap, tasksSnap] = await Promise.all([
        getDocs(examsQuery),
        getDocs(tasksQuery)
      ]);

      setExams(examsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)));
      setTasks(tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyTask)));
    } catch (err) {
      // Fail quiet: fall back to the empty state instead of an error banner
      console.warn('Firestore permission error in StudyPlanner:', err);
      setExams([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const addExam = async () => {
    if (!newExam.subject || !newExam.date || !auth.currentUser) return;

    try {
      const docRef = await addDoc(collection(db, 'exams'), {
        userId: auth.currentUser.uid,
        ...newExam,
        completed: false,
        createdAt: new Date().toISOString()
      });
      setExams([...exams, { id: docRef.id, ...newExam, completed: false }]);
      setNewExam({ subject: '', date: '', importance: 'medium' });
      setShowAddExam(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'exams');
    }
  };

  const deleteExam = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'exams', id));
      setExams(exams.filter(e => e.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `exams/${id}`);
    }
  };

  const toggleTask = async (id: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, 'study_tasks', id), { completed: !completed });
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: !completed } : t));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `study_tasks/${id}`);
    }
  };

  const generateSchedule = async () => {
    if (exams.length === 0 || !auth.currentUser) return;
    
    setIsGenerating(true);
    try {
      const prompt = `
        Based on these upcoming exams, generate a 7-day study schedule.
        Exams: ${JSON.stringify(exams.map(e => ({ subject: e.subject, date: e.date, importance: e.importance })))}
        Current Date: ${new Date().toISOString().split('T')[0]}

        Output ONLY a JSON array of tasks, no other text:
        [{ "title": "Study Chapter 1", "subject": "Math", "duration": 60, "date": "YYYY-MM-DD" }]
        Focus on higher importance exams and closer dates.
      `;

      const result = await callAI(prompt);
      let generatedTasks;
      try {
        generatedTasks = JSON.parse(result);
      } catch {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        generatedTasks = JSON.parse(jsonMatch ? jsonMatch[0] : result);
      }

      // Save tasks to Firestore
      const savedTasks = [];
      for (const task of generatedTasks) {
        const docRef = await addDoc(collection(db, 'study_tasks'), {
          userId: auth.currentUser.uid,
          ...task,
          completed: false,
          createdAt: new Date().toISOString()
        });
        savedTasks.push({ id: docRef.id, ...task, completed: false });
      }
      
      setTasks([...tasks, ...savedTasks]);
    } catch (err: any) {
      console.error("Failed to generate schedule:", err);
      if (err?.message === 'TOKEN_LIMIT_EXCEEDED') {
        toast.error("You've hit your AI usage limit for now.");
      } else {
        toast.error('Failed to generate schedule. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-12 py-8 max-w-5xl mx-auto animate-pulse">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="h-5 w-32 rounded-full bg-glass-bg border border-border-main" />
            <div className="h-9 w-56 rounded-xl bg-glass-bg border border-border-main" />
            <div className="h-4 w-72 rounded-lg bg-glass-bg border border-border-main" />
          </div>
          <div className="h-12 w-36 rounded-2xl bg-glass-bg border border-border-main" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-glass-bg border border-border-main" />
            ))}
          </div>
          <div className="lg:col-span-2">
            <div className="h-64 rounded-[2.5rem] bg-glass-bg border border-border-main" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-xs font-black uppercase tracking-[0.2em]"
          >
            <CalendarIcon size={14} />
            Study Planner
          </motion.div>
          <h1 className="text-4xl font-black text-text-main tracking-tight">Your Schedule</h1>
          <p className="text-text-dim text-sm">Organize your exams and let AI build the perfect study plan.</p>
        </div>
        
        <button 
          onClick={() => setShowAddExam(true)}
          className="btn-primary px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-brand-purple/20"
        >
          <Plus size={20} />
          Add Exam
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Exams List */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-text-main flex items-center gap-2">
              <Target size={20} className="text-brand-purple" />
              Upcoming Exams
            </h3>
            <span className="text-xs font-bold text-text-dim px-2 py-1 bg-glass-bg rounded-lg border border-border-main">
              {exams.length} Total
            </span>
          </div>

          <div className="space-y-4">
            {exams.length === 0 ? (
              <div className="glass p-8 rounded-3xl border border-dashed border-border-main text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-glass-bg flex items-center justify-center mx-auto">
                  <AlertCircle className="text-text-dim" size={24} />
                </div>
                <p className="text-sm font-bold text-text-main">No study plans yet — create your first</p>
                <p className="text-sm text-text-dim font-medium">Add your first exam to start planning.</p>
              </div>
            ) : (
              exams.map((exam) => (
                <motion.div 
                  key={exam.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="glass p-5 rounded-2xl border border-border-main group hover:border-brand-purple/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h4 className="font-bold text-text-main">{exam.subject}</h4>
                      <div className="flex items-center gap-2 text-xs text-text-dim font-medium">
                        <CalendarIcon size={12} />
                        {new Date(exam.date).toLocaleDateString()}
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteExam(exam.id)}
                      className="p-2 rounded-lg text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest",
                      exam.importance === 'high' ? "bg-red-500/10 text-red-400" :
                      exam.importance === 'medium' ? "bg-yellow-500/10 text-yellow-400" :
                      "bg-blue-500/10 text-blue-400"
                    )}>
                      {exam.importance} Priority
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {exams.length > 0 && (
            <button 
              onClick={generateSchedule}
              disabled={isGenerating}
              className="w-full p-4 rounded-2xl bg-brand-purple/10 border border-brand-purple/20 text-brand-purple font-bold flex items-center justify-center gap-3 hover:bg-brand-purple/20 transition-all group disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Generating Plan...
                </>
              ) : (
                <>
                  <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
                  AI Generate Study Plan
                </>
              )}
            </button>
          )}
        </div>

        {/* Tasks / Schedule */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-text-main flex items-center gap-2">
              <Clock size={20} className="text-brand-purple" />
              Daily Study Plan
            </h3>
          </div>

          <div className="space-y-4">
            {tasks.length === 0 ? (
              <div className="glass p-12 rounded-[2.5rem] border border-border-main text-center space-y-6">
                <div className="w-20 h-20 rounded-[2rem] bg-glass-bg flex items-center justify-center mx-auto">
                  <BookOpen className="text-text-dim" size={40} />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-bold text-text-main">No study tasks yet</h4>
                  <p className="text-text-dim text-sm max-w-xs mx-auto">
                    Add your exams and click "AI Generate Study Plan" to get a personalized schedule.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Group tasks by date */}
                {Array.from(new Set(tasks.map(t => t.date))).sort().map(date => (
                  <div key={date} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-border-main" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-text-dim">
                        {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                      </span>
                      <div className="h-px flex-1 bg-border-main" />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {tasks.filter(t => t.date === date).map(task => (
                        <motion.div 
                          key={task.id}
                          layout
                          className={cn(
                            "glass p-4 rounded-2xl border flex items-center gap-4 transition-all",
                            task.completed ? "border-green-500/30 bg-green-500/5 opacity-60" : "border-border-main hover:border-brand-purple/30"
                          )}
                        >
                          <button 
                            onClick={() => toggleTask(task.id, task.completed)}
                            className={cn(
                              "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                              task.completed ? "bg-green-500 border-green-500 text-white" : "border-border-main hover:border-brand-purple"
                            )}
                          >
                            {task.completed && <CheckCircle2 size={14} />}
                          </button>
                          
                          <div className="flex-1">
                            <h5 className={cn("font-bold text-sm", task.completed ? "line-through text-text-dim" : "text-text-main")}>
                              {task.title}
                            </h5>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-brand-purple bg-brand-purple/10 px-2 py-0.5 rounded">
                                {task.subject}
                              </span>
                              <span className="text-[10px] font-bold text-text-dim flex items-center gap-1">
                                <Clock size={10} />
                                {task.duration} mins
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Exam Modal */}
      <AnimatePresence>
        {showAddExam && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md glass p-8 rounded-[2.5rem] border border-border-main space-y-6 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-text-main tracking-tight">Add New Exam</h3>
                <button onClick={() => setShowAddExam(false)} className="p-2 hover:bg-glass-bg rounded-xl text-text-dim transition-all">
                  <Trash2 size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-dim ml-1">Subject Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Advanced Mathematics"
                    value={newExam.subject}
                    onChange={(e) => setNewExam({ ...newExam, subject: e.target.value })}
                    className="w-full bg-glass-bg border border-border-main rounded-2xl px-5 py-4 text-text-main focus:outline-none focus:border-brand-purple transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-dim ml-1">Exam Date</label>
                  <input 
                    type="date" 
                    value={newExam.date}
                    onChange={(e) => setNewExam({ ...newExam, date: e.target.value })}
                    className="w-full bg-glass-bg border border-border-main rounded-2xl px-5 py-4 text-text-main focus:outline-none focus:border-brand-purple transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-dim ml-1">Importance</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map((imp) => (
                      <button
                        key={imp}
                        onClick={() => setNewExam({ ...newExam, importance: imp })}
                        className={cn(
                          "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          newExam.importance === imp 
                            ? "bg-brand-purple border-brand-purple text-white shadow-lg shadow-brand-purple/20" 
                            : "bg-glass-bg border-border-main text-text-dim hover:border-text-dim"
                        )}
                      >
                        {imp}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={addExam}
                className="w-full btn-primary py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-brand-purple/20"
              >
                Save Exam
                <ArrowRight size={20} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
