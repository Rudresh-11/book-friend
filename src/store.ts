import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Book,
  BookStatus,
  Card,
  LibraryState,
  PageShot,
  ReadingSession,
  Section,
  SectionKind,
  Settings,
} from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultKind: 'Chapter',
  promptFlavour: '',
  language: 'English',
  dailyGoalMinutes: 20,
  spoilerSafe: true,
};

export function emptySection(bookId: string, order: number, kind: SectionKind): Section {
  return {
    id: uid(),
    bookId,
    order,
    kind,
    number: String(order + 1),
    title: '',
    status: 'unread',
    pages: [],
    recap: '',
    summary: '',
    keyPoints: [],
    themes: [],
    characters: [],
    quotes: [],
    vocabulary: [],
    cards: [],
    myNotes: '',
    mood: '',
    difficulty: 0,
    createdAt: Date.now(),
  };
}

type Actions = {
  addBook: (b: Partial<Book> & { title: string }) => string;
  updateBook: (id: string, patch: Partial<Book>) => void;
  removeBook: (id: string) => void;
  setBookStatus: (id: string, status: BookStatus) => void;
  touchBook: (id: string) => void;

  addSection: (bookId: string, patch?: Partial<Section>) => string;
  addSections: (bookId: string, items: Partial<Section>[]) => void;
  updateSection: (id: string, patch: Partial<Section>) => void;
  removeSection: (id: string) => void;
  reorderSection: (id: string, direction: -1 | 1) => void;

  addPage: (sectionId: string, page: Omit<PageShot, 'id' | 'createdAt'>) => string;
  updatePage: (sectionId: string, pageId: string, patch: Partial<PageShot>) => void;
  removePage: (sectionId: string, pageId: string) => void;

  addCards: (sectionId: string, cards: { q: string; a: string }[]) => void;
  gradeCard: (sectionId: string, cardId: string, grade: 0 | 1 | 2) => void;

  addSession: (s: Omit<ReadingSession, 'id'>) => void;
  removeSession: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  replaceAll: (data: Partial<LibraryState>) => void;
  wipe: () => void;
};

export type Store = LibraryState & Actions;

export const useLibrary = create<Store>()(
  persist(
    (set, get) => ({
      books: [],
      sections: [],
      sessions: [],
      settings: DEFAULT_SETTINGS,

      addBook: (b) => {
        const id = uid();
        const book: Book = {
          id,
          title: b.title.trim(),
          author: b.author?.trim() ?? '',
          coverUri: b.coverUri,
          status: b.status ?? 'reading',
          genre: b.genre ?? '',
          tags: b.tags ?? [],
          blurb: b.blurb ?? '',
          totalPages: b.totalPages,
          rating: b.rating ?? 0,
          storySoFar: b.storySoFar ?? '',
          myNotes: b.myNotes ?? '',
          createdAt: Date.now(),
          startedAt: b.status === 'want' ? undefined : Date.now(),
          lastOpenedAt: Date.now(),
        };
        set({ books: [book, ...get().books] });
        return id;
      },

      updateBook: (id, patch) =>
        set({ books: get().books.map((b) => (b.id === id ? { ...b, ...patch } : b)) }),

      removeBook: (id) =>
        set({
          books: get().books.filter((b) => b.id !== id),
          sections: get().sections.filter((s) => s.bookId !== id),
          sessions: get().sessions.filter((s) => s.bookId !== id),
        }),

      setBookStatus: (id, status) =>
        set({
          books: get().books.map((b) =>
            b.id === id
              ? {
                  ...b,
                  status,
                  startedAt: b.startedAt ?? (status === 'reading' ? Date.now() : undefined),
                  finishedAt: status === 'finished' ? Date.now() : b.finishedAt,
                }
              : b
          ),
        }),

      touchBook: (id) =>
        set({ books: get().books.map((b) => (b.id === id ? { ...b, lastOpenedAt: Date.now() } : b)) }),

      addSection: (bookId, patch) => {
        const order = get().sections.filter((s) => s.bookId === bookId).length;
        const base = emptySection(bookId, order, get().settings.defaultKind);
        const section = { ...base, ...patch, id: base.id, bookId, order };
        set({ sections: [...get().sections, section] });
        return section.id;
      },

      addSections: (bookId, items) => {
        let order = get().sections.filter((s) => s.bookId === bookId).length;
        const kind = get().settings.defaultKind;
        const made = items.map((p) => {
          const base = emptySection(bookId, order, kind);
          order += 1;
          return { ...base, ...p, id: base.id, bookId, order: base.order };
        });
        set({ sections: [...get().sections, ...made] });
      },

      updateSection: (id, patch) =>
        set({ sections: get().sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),

      removeSection: (id) =>
        set({
          sections: get()
            .sections.filter((s) => s.id !== id)
            .map((s, i, arr) => ({ ...s, order: arr.filter((o) => o.bookId === s.bookId).indexOf(s) })),
          sessions: get().sessions.map((s) => (s.sectionId === id ? { ...s, sectionId: undefined } : s)),
        }),

      reorderSection: (id, direction) => {
        const all = get().sections;
        const target = all.find((s) => s.id === id);
        if (!target) return;
        const siblings = all
          .filter((s) => s.bookId === target.bookId)
          .sort((a, b) => a.order - b.order);
        const idx = siblings.findIndex((s) => s.id === id);
        const swapWith = siblings[idx + direction];
        if (!swapWith) return;
        set({
          sections: all.map((s) => {
            if (s.id === target.id) return { ...s, order: swapWith.order };
            if (s.id === swapWith.id) return { ...s, order: target.order };
            return s;
          }),
        });
      },

      addPage: (sectionId, page) => {
        const id = uid();
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId ? { ...s, pages: [...s.pages, { ...page, id, createdAt: Date.now() }] } : s
          ),
        });
        return id;
      },

      updatePage: (sectionId, pageId, patch) =>
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId
              ? { ...s, pages: s.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)) }
              : s
          ),
        }),

      removePage: (sectionId, pageId) =>
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId ? { ...s, pages: s.pages.filter((p) => p.id !== pageId) } : s
          ),
        }),

      addCards: (sectionId, cards) => {
        const now = Date.now();
        const made: Card[] = cards
          .filter((c) => c.q?.trim())
          .map((c) => ({
            id: uid(),
            q: c.q.trim(),
            a: (c.a ?? '').trim(),
            ease: 2.5,
            interval: 0,
            dueAt: now,
            reps: 0,
            lapses: 0,
          }));
        if (!made.length) return;
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId ? { ...s, cards: [...s.cards, ...made] } : s
          ),
        });
      },

      gradeCard: (sectionId, cardId, grade) => {
        const DAY = 86400000;
        set({
          sections: get().sections.map((s) => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              cards: s.cards.map((c) => {
                if (c.id !== cardId) return c;
                if (grade === 0) {
                  return {
                    ...c,
                    ease: Math.max(1.3, c.ease - 0.2),
                    interval: 0,
                    reps: c.reps + 1,
                    lapses: c.lapses + 1,
                    dueAt: Date.now() + 10 * 60 * 1000,
                  };
                }
                const ease = grade === 2 ? Math.min(3.2, c.ease + 0.1) : Math.max(1.3, c.ease - 0.05);
                const interval = c.interval === 0 ? 1 : c.interval === 1 ? 3 : Math.round(c.interval * ease);
                return {
                  ...c,
                  ease,
                  interval,
                  reps: c.reps + 1,
                  dueAt: Date.now() + interval * DAY,
                };
              }),
            };
          }),
        });
      },

      addSession: (s) => set({ sessions: [{ ...s, id: uid() }, ...get().sessions] }),
      removeSession: (id) => set({ sessions: get().sessions.filter((s) => s.id !== id) }),

      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

      replaceAll: (data) =>
        set({
          books: data.books ?? [],
          sections: data.sections ?? [],
          sessions: data.sessions ?? [],
          settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
        }),

      wipe: () => set({ books: [], sections: [], sessions: [], settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'book-friend-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);

/* ---------- selectors / derived helpers ---------- */

export const sectionsOf = (state: LibraryState, bookId: string) =>
  state.sections.filter((s) => s.bookId === bookId).sort((a, b) => a.order - b.order);

export function bookProgress(state: LibraryState, bookId: string) {
  const list = sectionsOf(state, bookId);
  const read = list.filter((s) => s.status === 'read').length;
  return { read, total: list.length, ratio: list.length ? read / list.length : 0 };
}

export function sectionLabel(s: Section) {
  const head = [s.kind, s.number].filter(Boolean).join(' ');
  return s.title ? `${head} — ${s.title}` : head;
}

export function dueCards(state: LibraryState) {
  const now = Date.now();
  return state.sections.flatMap((s) =>
    s.cards.filter((c) => c.dueAt <= now).map((c) => ({ card: c, section: s }))
  );
}

export function streakDays(sessions: ReadingSession[]) {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map((s) => new Date(s.endedAt).toDateString()));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function minutesToday(sessions: ReadingSession[]) {
  const today = new Date().toDateString();
  return sessions
    .filter((s) => new Date(s.endedAt).toDateString() === today)
    .reduce((sum, s) => sum + s.minutes, 0);
}
