import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Folder, Plus, Search, MoreVertical, BookOpen, 
  Clock, Trash2, Edit2, ChevronRight, Grid, List, 
  Filter, Star, Share2, Download, ExternalLink,
  Loader2, Save, X, FolderOpen, Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db, auth, collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, addDoc, handleFirestoreError, OperationType } from '../lib/firebase';

interface HistoryItem {
  id: string;
  subject: string;
  timestamp: string;
  mode: string;
  content: string;
  outputModes: any;
  created_at: string;
}

interface LibraryProps {
  onOpenItem: (item: HistoryItem) => void;
}

export default function Library({ onOpenItem }: LibraryProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState<HistoryItem | null>(null);
  const [editForm, setEditForm] = useState({ subject: '', content: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [newCollectionForm, setNewCollectionForm] = useState({ subject: '', content: '' });

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail === 'dashboard') {
        // Signal parent to navigate — parent listens
      }
    };
    window.addEventListener('brainify:navigate', handler);
    return () => window.removeEventListener('brainify:navigate', handler);
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'study_history'), 
      where('user_id', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryItem[];

      setItems(historyData.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
      setLoading(false);
    }, (err) => {
      // Fail quiet: fall back to the empty state instead of an error banner
      console.warn('Firestore permission error in Library:', err);
      setItems([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredItems = items.filter(item => 
    item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteDoc(doc(db, 'study_history', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `study_history/${id}`);
    }
  };

  const handleEditClick = (e: React.MouseEvent, item: HistoryItem) => {
    e.stopPropagation();
    setEditingItem(item);
    setEditForm({ subject: item.subject, content: item.content });
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editForm.subject.trim()) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'study_history', editingItem.id), {
        subject: editForm.subject,
        content: editForm.content
      });
      setEditingItem(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `study_history/${editingItem.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionForm.subject.trim() || !auth.currentUser) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'study_history'), {
        user_id: auth.currentUser.uid,
        subject: newCollectionForm.subject,
        content: newCollectionForm.content,
        mode: 'summary',
        outputModes: { summary: 'New collection created. Add your notes here.' },
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString()
      });
      setShowCreateModal(false);
      setNewCollectionForm({ subject: '', content: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'study_history');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-12 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 animate-pulse">
          <div className="space-y-3">
            <div className="h-5 w-32 rounded-full bg-glass-bg border border-border-main" />
            <div className="h-9 w-56 rounded-xl bg-glass-bg border border-border-main" />
            <div className="h-4 w-72 rounded-lg bg-glass-bg border border-border-main" />
          </div>
          <div className="h-12 w-40 rounded-2xl bg-glass-bg border border-border-main" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-6 rounded-[2rem] border border-border-main bg-glass-bg space-y-6 animate-pulse">
              <div className="w-16 h-16 rounded-2xl bg-border-main/50" />
              <div className="space-y-2">
                <div className="h-4 w-3/4 rounded bg-border-main/50" />
                <div className="h-3 w-1/2 rounded bg-border-main/50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple text-xs font-black uppercase tracking-[0.2em]"
          >
            <Folder size={14} />
            Your Collections
          </motion.div>
          <h1 className="text-4xl font-black text-text-main tracking-tight">The Library</h1>
          <p className="text-text-dim text-sm">Organize your study materials by subject or project.</p>
        </div>
        
        <button 
          onClick={() => setShowCreateModal(true)}
          className="btn-primary px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-2xl shadow-brand-purple/20"
        >
          <Plus size={20} />
          New Collection
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={18} />
          <input 
            type="text" 
            placeholder="Search your library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-glass-bg border border-border-main rounded-2xl py-3 pl-12 pr-4 text-sm text-text-main focus:outline-none focus:border-brand-purple/50 transition-all placeholder:text-text-dim/50"
          />
        </div>
        
        <div className="flex items-center gap-2 p-1.5 bg-glass-bg rounded-2xl border border-border-main shrink-0">
          <button 
            onClick={() => setViewMode('grid')}
            className={cn(
              "p-2 rounded-xl transition-all",
              viewMode === 'grid' ? "bg-glass-bg text-text-main shadow-lg border border-border-main" : "text-text-dim hover:text-text-main"
            )}
          >
            <Grid size={18} />
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={cn(
              "p-2 rounded-xl transition-all",
              viewMode === 'list' ? "bg-glass-bg text-text-main shadow-lg border border-border-main" : "text-text-dim hover:text-text-main"
            )}
          >
            <List size={18} />
          </button>
        </div>

        <button className="p-3 rounded-2xl bg-glass-bg border border-border-main text-text-dim hover:text-text-main transition-all shrink-0">
          <Filter size={18} />
        </button>
      </div>

      {/* Collections Grid */}
      {filteredItems.length > 0 ? (
        <div className={cn(
          "grid gap-6",
          viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
        )}>
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, i) => (
              <motion.div 
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -5, scale: 1.02 }}
                onClick={() => onOpenItem(item)}
                className={cn(
                  "glass group cursor-pointer transition-all hover:bg-glass-bg hover:border-brand-purple/30 border border-border-main",
                  viewMode === 'grid' ? "p-6 rounded-[2rem] space-y-6" : "p-4 rounded-2xl flex items-center gap-6"
                )}
              >
                <div className={cn(
                  "rounded-2xl flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform",
                  "bg-brand-purple/20 border border-brand-purple/30",
                  viewMode === 'grid' ? "w-16 h-16" : "w-12 h-12 shrink-0"
                )}>
                  <BookOpen size={viewMode === 'grid' ? 32 : 24} className="text-brand-purple" />
                </div>

                <div className="flex-1 space-y-1">
                  <h3 className="font-bold text-lg text-text-main group-hover:text-brand-purple transition-colors truncate">{item.subject}</h3>
                  <div className="flex items-center gap-3 text-xs text-text-dim font-medium">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-border-main" />
                    <span className="capitalize">{item.mode}</span>
                  </div>
                </div>

                <div className={cn(
                  "flex items-center gap-2 transition-opacity",
                  viewMode === 'grid' ? "pt-4 border-t border-border-main" : "hover-reveal"
                )}>
                  <button 
                    onClick={(e) => handleEditClick(e, item)}
                    className="p-2 rounded-xl hover:bg-glass-bg text-text-dim hover:text-text-main transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={(e) => handleDelete(e, item.id)}
                    className="p-2 rounded-xl hover:bg-glass-bg text-text-dim hover:text-red-400 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                  {viewMode === 'grid' && (
                    <div className="ml-auto">
                      <ChevronRight size={18} className="text-text-dim group-hover:text-brand-purple group-hover:translate-x-1 transition-all" />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center space-y-6"
        >
          <div className="w-24 h-24 rounded-[2rem] bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center">
            <FolderOpen size={40} className="text-brand-purple/60" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-text-main">No study kits yet — generate your first one</h3>
            <p className="text-text-dim text-sm max-w-xs mx-auto leading-relaxed">
              It'll be saved here automatically so you can come back to it anytime.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('brainify:navigate', { detail: 'dashboard' }))}
              className="px-6 py-3 bg-brand-purple text-white font-bold rounded-xl hover:bg-brand-purple/90 transition-all flex items-center gap-2"
            >
              <Sparkles size={16} />
              Generate my first kit
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-glass-bg border border-border-main text-text-muted font-medium rounded-xl hover:text-text-main transition-all flex items-center gap-2"
            >
              <Plus size={16} />
              Create manually
            </button>
          </div>
          {/* Example of what a saved kit looks like */}
          <div className="mt-4 p-4 rounded-xl bg-glass-bg border border-border-main border-dashed max-w-sm w-full opacity-50">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-brand-purple/20 flex items-center justify-center">
                <BookOpen size={14} className="text-brand-purple" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-text-main">The Water Cycle — Summary</p>
                <p className="text-[10px] text-text-dim">Saved 2 minutes ago</p>
              </div>
            </div>
            <p className="text-[10px] text-text-dim/60 italic">Your saved study kits will look like this</p>
          </div>
        </motion.div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingItem(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative glass w-full max-w-2xl p-8 rounded-[2.5rem] border border-border-main space-y-8 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-text-main tracking-tight">Edit Study Item</h2>
                  <p className="text-text-dim text-sm">Update the subject or content of your study kit.</p>
                </div>
                <button 
                  onClick={() => setEditingItem(null)}
                  className="p-2 rounded-xl hover:bg-glass-bg text-text-dim hover:text-text-main transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-text-dim uppercase tracking-widest">Subject</label>
                  <input 
                    type="text" 
                    value={editForm.subject}
                    onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                    className="w-full bg-glass-bg border border-border-main rounded-2xl p-4 text-text-main focus:outline-none focus:border-brand-purple/50 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-text-dim uppercase tracking-widest">Content</label>
                  <textarea 
                    value={editForm.content}
                    onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    className="w-full h-64 bg-glass-bg border border-border-main rounded-2xl p-4 text-text-main resize-none focus:outline-none focus:border-brand-purple/50 transition-all"
                  />
                </div>
                
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setEditingItem(null)}
                    className="flex-1 py-4 rounded-2xl font-bold text-text-dim hover:text-text-main hover:bg-glass-bg transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveEdit}
                    disabled={isSaving || !editForm.subject.trim()}
                    className="flex-1 btn-primary py-4 rounded-2xl font-bold shadow-2xl shadow-brand-purple/20 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative glass w-full max-w-2xl p-8 rounded-[2.5rem] border border-border-main space-y-8 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-text-main tracking-tight">New Collection</h2>
                  <p className="text-text-dim text-sm">Create a new study kit to organize your notes.</p>
                </div>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 rounded-xl hover:bg-glass-bg text-text-dim hover:text-text-main transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-text-dim uppercase tracking-widest">Subject Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Molecular Biology"
                    value={newCollectionForm.subject}
                    onChange={(e) => setNewCollectionForm({ ...newCollectionForm, subject: e.target.value })}
                    className="w-full bg-glass-bg border border-border-main rounded-2xl p-4 text-text-main focus:outline-none focus:border-brand-purple/50 transition-all placeholder:text-text-dim/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-text-dim uppercase tracking-widest">Initial Notes (Optional)</label>
                  <textarea 
                    placeholder="Paste your notes or initial thoughts here..."
                    value={newCollectionForm.content}
                    onChange={(e) => setNewCollectionForm({ ...newCollectionForm, content: e.target.value })}
                    className="w-full h-48 bg-glass-bg border border-border-main rounded-2xl p-4 text-text-main resize-none focus:outline-none focus:border-brand-purple/50 transition-all placeholder:text-text-dim/50"
                  />
                </div>
                
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-text-dim hover:text-text-main hover:bg-glass-bg transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCreateCollection}
                    disabled={isSaving || !newCollectionForm.subject.trim()}
                    className="flex-1 btn-primary py-4 rounded-2xl font-bold shadow-2xl shadow-brand-purple/20 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                    Create Collection
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
