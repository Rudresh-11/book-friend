import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Book,
  BookStatus,
  CastVoice,
  ComicPanel,
  ComicSheet,
  NarrationLine,
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
  narrationRate: 0.95,
  narrationPitch: 1,
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
    comic: [],
    comicSheets: [],
    narration: [],
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

  addPanels: (sectionId: string, panels: { scene: string; prompt: string }[]) => void;
  updatePanel: (sectionId: string, panelId: string, patch: Partial<ComicPanel>) => void;
  removePanel: (sectionId: string, panelId: string) => void;
  addComicSheet: (sectionId: string, sheet: Omit<ComicSheet, 'id' | 'createdAt'>) => void;
  removeComicSheet: (sectionId: string, sheetId: string) => void;

  setNarration: (sectionId: string, lines: NarrationLine[]) => void;
  setCastVoice: (bookId: string, name: string, patch: Partial<CastVoice>) => void;

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
          openThreads: b.openThreads ?? [],
          keyPeople: b.keyPeople ?? [],
          cast: b.cast ?? [],
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

      addPanels: (sectionId, panels) => {
        const made: ComicPanel[] = panels
          .filter((p) => p.scene?.trim() || p.prompt?.trim())
          .map((p) => ({
            id: uid(),
            scene: (p.scene ?? '').trim(),
            prompt: (p.prompt ?? '').trim(),
            createdAt: Date.now(),
          }));
        if (!made.length) return;
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId ? { ...s, comic: [...s.comic, ...made] } : s
          ),
        });
      },

      updatePanel: (sectionId, panelId, patch) =>
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId
              ? { ...s, comic: s.comic.map((p) => (p.id === panelId ? { ...p, ...patch } : p)) }
              : s
          ),
        }),

      removePanel: (sectionId, panelId) =>
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId ? { ...s, comic: s.comic.filter((p) => p.id !== panelId) } : s
          ),
        }),

      addComicSheet: (sectionId, sheet) =>
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId
              ? { ...s, comicSheets: [...s.comicSheets, { ...sheet, id: uid(), createdAt: Date.now() }] }
              : s
          ),
        }),

      removeComicSheet: (sectionId, sheetId) =>
        set({
          sections: get().sections.map((s) =>
            s.id === sectionId ? { ...s, comicSheets: s.comicSheets.filter((x) => x.id !== sheetId) } : s
          ),
        }),

      setNarration: (sectionId, lines) =>
        set({
          sections: get().sections.map((s) => (s.id === sectionId ? { ...s, narration: lines } : s)),
        }),

      setCastVoice: (bookId, name, patch) =>
        set({
          books: get().books.map((b) => {
            if (b.id !== bookId) return b;
            const found = b.cast.find((c) => c.name.toLowerCase() === name.toLowerCase());
            const cast = found
              ? b.cast.map((c) => (c === found ? { ...c, ...patch } : c))
              : [...b.cast, { name, pitch: 1, rate: 1, ...patch }];
            return { ...b, cast };
          }),
        }),

      addSession: (s) => set({ sessions: [{ ...s, id: uid() }, ...get().sessions] }),
      removeSession: (id) => set({ sessions: get().sessions.filter((s) => s.id !== id) }),

      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

      replaceAll: (data) =>
        set({
          books: (data.books ?? []).map(fillBook),
          sections: (data.sections ?? []).map(fillSection),
          sessions: data.sessions ?? [],
          settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
        }),

      wipe: () => set({ books: [], sections: [], sessions: [], settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'book-friend-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // v1 had review cards and no comic panels.
      migrate: (persisted: any, from) => {
        if (!persisted || from >= 2) return persisted;
        return {
          ...persisted,
          books: (persisted.books ?? []).map(fillBook),
          sections: (persisted.sections ?? []).map(fillSection),
        };
      },
      /**
       * Backfill on EVERY load, not just on a version bump. A saved library is
       * only ever as new as the app that wrote it, so any list added since then
       * is missing — and reading `.length` off it crashes the screen. Migrating
       * on version alone missed exactly that: comic sheets were added after the
       * bump to 2, so libraries already at 2 never got the field.
       */
      merge: (persisted: any, current) => ({
        ...current,
        ...(persisted ?? {}),
        books: ((persisted?.books ?? []) as any[]).map(fillBook),
        sections: ((persisted?.sections ?? []) as any[]).map(fillSection),
        sessions: persisted?.sessions ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(persisted?.settings ?? {}) },
      }),
    }
  )
);

/** Backfill anything a library saved by an older version of the app is missing. */
function fillBook(b: any): Book {
  return {
    ...b,
    tags: b?.tags ?? [],
    blurb: b?.blurb ?? '',
    storySoFar: b?.storySoFar ?? '',
    openThreads: b?.openThreads ?? [],
    keyPeople: b?.keyPeople ?? [],
    cast: b?.cast ?? [],
    myNotes: b?.myNotes ?? '',
    rating: b?.rating ?? 0,
  };
}

function fillSection(s: any): Section {
  const { cards, ...rest } = s ?? {};
  return {
    ...rest,
    pages: (rest.pages ?? []).map((p: any) => ({ ...p, label: p?.label ?? '', text: p?.text ?? '' })),
    recap: rest.recap ?? '',
    summary: rest.summary ?? '',
    keyPoints: rest.keyPoints ?? [],
    themes: rest.themes ?? [],
    characters: rest.characters ?? [],
    quotes: rest.quotes ?? [],
    vocabulary: rest.vocabulary ?? [],
    comic: rest.comic ?? [],
    comicSheets: rest.comicSheets ?? [],
    narration: rest.narration ?? [],
    myNotes: rest.myNotes ?? '',
    mood: rest.mood ?? '',
    difficulty: rest.difficulty ?? 0,
  };
}

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

/**
 * How far through a chapter you are, from its first/last page numbers and the
 * page numbers on the scans you have added. A label like "12-13" counts as
 * having reached p. 13.
 */
export function sectionPageProgress(s: Section) {
  const start = parseInt(s.startPage ?? '', 10);
  const end = parseInt(s.endPage ?? '', 10);
  const seen = s.pages.flatMap((p) => (p.label.match(/\d+/g) ?? []).map(Number)).filter(Number.isFinite);
  const furthest = seen.length ? Math.max(...seen) : undefined;

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { hasRange: false as const, furthest, total: 0, reached: 0, ratio: 0 };
  }
  const total = end - start + 1;
  const reached = furthest === undefined ? 0 : Math.max(0, Math.min(total, furthest - start + 1));
  return { hasRange: true as const, start, end, furthest, total, reached, ratio: total ? reached / total : 0 };
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
