import { create } from 'zustand';
import { deleteNote as deleteNoteRepo } from '../../services/storage/notesRepo';
import { deleteAudioFiles } from '../../services/storage/files';
import { listNotes } from '../../services/storage/notesRepo';
import type { Note } from '../../services/models/types';

interface NotesState {
  notes: Note[];
  isLoading: boolean;
  deletingId: string | null;
}

interface NotesActions {
  loadNotes: (limit?: number) => void;
  deleteNote: (noteId: string) => Promise<void>;
  setDeletingId: (noteId: string | null) => void;
}

export const useNotesStore = create<NotesState & NotesActions>((set, get) => ({
  notes: [],
  isLoading: false,
  deletingId: null,

  loadNotes: (limit = 50) => {
    const notes = listNotes(limit);
    set({ notes });
  },

  setDeletingId: (noteId: string | null) => {
    set({ deletingId: noteId });
  },

  deleteNote: async (noteId: string) => {
    try {
      // Wrap DB delete in Promise to allow Promise.all
      const dbDeletePromise = Promise.resolve().then(() => {
        deleteNoteRepo(noteId);
      });

      // Run DB delete and file deletion in parallel
      await Promise.all([dbDeletePromise, deleteAudioFiles(noteId)]);

      // Refresh the notes list after deletion
      const notes = listNotes(50);
      set({ notes });
    } catch (error) {
      console.error('[useNotesStore] Error deleting note:', noteId, error);
      throw error;
    }
  },
}));

