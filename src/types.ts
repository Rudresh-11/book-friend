export type SectionKind = 'Chapter' | 'Part' | 'Section' | 'Episode' | 'Canto' | 'Act' | 'Lesson' | 'Entry';

export type BookStatus = 'want' | 'reading' | 'paused' | 'finished' | 'abandoned';

export type PageShot = {
  id: string;
  uri: string;
  /** e.g. "12-13" when one photo holds a two-page spread */
  label: string;
  /** true when the photo captures a left+right spread */
  spread: boolean;
  text: string;
  textSource: 'none' | 'ocr' | 'manual' | 'ai';
  width?: number;
  height?: number;
  createdAt: number;
};

export type Quote = { text: string; page?: string; note?: string };
export type Person = { name: string; note: string };
export type Term = { word: string; meaning: string };

/**
 * A whole comic page in one picture — what an image AI hands back when you give
 * it every panel prompt at once, with all the scenes laid out in a grid.
 */
export type ComicSheet = {
  id: string;
  uri: string;
  /** the picture's own proportions, so it can be shown without squashing */
  width?: number;
  height?: number;
  createdAt: number;
};

/** One comic panel for a scene in a chapter. */
export type ComicPanel = {
  id: string;
  /** what happens in this scene, in a line or two — the caption under the picture */
  scene: string;
  /** the image prompt to paste into an image AI */
  prompt: string;
  /** the drawing itself, once you have made one and saved it back here */
  uri?: string;
  createdAt: number;
};

export type Section = {
  id: string;
  bookId: string;
  order: number;
  kind: SectionKind;
  number: string;
  title: string;
  status: 'unread' | 'reading' | 'read';
  startPage?: string;
  endPage?: string;
  pages: PageShot[];
  /** short "previously on" style refresher */
  recap: string;
  /** longer summary */
  summary: string;
  keyPoints: string[];
  themes: string[];
  characters: Person[];
  quotes: Quote[];
  vocabulary: Term[];
  /** the chapter drawn out scene by scene */
  comic: ComicPanel[];
  /** whole-page versions of the comic, one picture holding every panel */
  comicSheets: ComicSheet[];
  myNotes: string;
  mood: string;
  difficulty: number;
  aiUpdatedAt?: number;
  readAt?: number;
  createdAt: number;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  coverUri?: string;
  status: BookStatus;
  genre: string;
  tags: string[];
  blurb: string;
  totalPages?: number;
  rating: number;
  /** cumulative "story so far" across everything read */
  storySoFar: string;
  /** loose ends the story has not tied off yet, from "story so far" and book-level recaps */
  openThreads: string[];
  /** who matters right now, from the same answers */
  keyPeople: Person[];
  myNotes: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  lastOpenedAt?: number;
};

export type ReadingSession = {
  id: string;
  bookId: string;
  sectionId?: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  pages: number;
  note: string;
};

export type Settings = {
  theme: 'system' | 'light' | 'dark';
  defaultKind: SectionKind;
  /** appended to every generated prompt */
  promptFlavour: string;
  language: string;
  dailyGoalMinutes: number;
  spoilerSafe: boolean;
};

export type LibraryState = {
  books: Book[];
  sections: Section[];
  sessions: ReadingSession[];
  settings: Settings;
};
