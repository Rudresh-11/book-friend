# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm install
npx expo start          # then a / i / w for Android, iOS, web
npm run android|ios|web # same, pre-targeted
npx tsc --noEmit        # the only check in the repo — no linter, no test runner
npx expo run:android    # development build; the ONLY way to get on-device OCR
```

There are no tests and no lint config. `tsconfig.json` extends `expo/tsconfig.base` with `strict: true`, so typecheck is the gate.

Expo SDK 57 / React Native 0.86 / React 19.2. Native module work goes through EAS (`eas.json` has development / preview / production profiles).

## Architecture

A local-only reading journal. **There is no server, no account, no network call anywhere in the app** — including for AI. Do not add one; the AI feature is deliberately a manual copy/paste round trip (see "the AI bridge" below). Anything that would send user text off the device breaks the premise of the product.

### Data

One zustand store, `src/store.ts`, holds the entire app state: `books`, `sections`, `sessions`, `settings` — flat arrays, joined by `bookId` / `sectionId`. All types live in `src/types.ts`. Screens read the store directly with `useLibrary(...)` and mutate through named actions; there are no other data layers.

Persistence is `zustand/persist` over a custom `libraryStorage` (`src/lib/storage.ts`), not plain AsyncStorage. Native writes a single `library.json` in the document directory, because AsyncStorage on Android is SQLite with a ~6 MB ceiling that the library blows past once chapters carry page text plus narration lines. Writes are debounced 300 ms and flushed on `AppState` change. Web still uses AsyncStorage (expo-file-system's `File` class is native-only).

**Adding a field to `Book` or `Section` means updating `fillBook` / `fillSection` in `src/store.ts`.** These backfill on *every* load via `merge`, not only on a version bump — a library saved by an older build is missing any newer array, and reading `.length` off `undefined` crashes the screen. The store's `version`/`migrate` pair alone is not sufficient and has already failed this way once.

Derived data lives as pure selectors at the bottom of `store.ts` (`sectionsOf`, `bookProgress`, `sectionPageProgress`, `streakDays`, `minutesToday`) — put new derivations there rather than inside components.

### The AI bridge

`app/ai.tsx` is one screen that does the whole loop: build a prompt → user copies it into any AI app → user pastes the reply back → parse → fan out into the store. Three files cooperate:

- `src/lib/prompts.ts` — `PROMPTS` (eight `PromptKind`s) and `buildPrompt()`. Each prompt ends with an explicit JSON shape; that shape is the contract. Long chapters are clipped from the **start** (`clipToTail`), on the assumption the prompt is pasted into an ongoing chat that already has the earlier pages.
- `src/lib/parse.ts` — `parseAiResponse(kind, raw)`. Deliberately forgiving: digs the outermost `{...}` out of a code fence or chatty prose, repairs trailing commas and smart quotes, accepts field aliases (`key_points`, `scenes`, `who`, …), and if there is no usable JSON at all falls back to saving the raw text into that kind's main field rather than losing the round trip. `normalise()` is where new payload fields are accepted.
- `app/ai.tsx`'s `apply()` — routes a parsed payload onto the book, the chapters, the page scans or the narration, and builds a per-item receipt (`Saved[]`) telling the user where each thing landed. Lists **merge** rather than overwrite (`merge`, `mergeBy`, `countNote`); long prose replaces and says so.

Adding a prompt kind means touching all three: `PromptKind` + `PROMPTS` + a `buildPrompt` case, an `AiPayload` field in `parse.ts`, and an apply branch.

### Screens

expo-router, file-based, under `app/`. `(tabs)/` is Library · Listen · Progress · Settings; `book/[id]/`, `section/[id]/` (index, `scan`, `comic`), and `ai` are stack screens registered in `app/_layout.tsx`. Typed routes are off.

### Platform seams

Several helpers exist purely because a platform misbehaves — use them instead of the raw API:

- `src/lib/alert.ts` `notify()` — `Alert.alert` is a silent no-op on react-native-web; this bridges to `window.confirm`/`alert`.
- `src/lib/nav.ts` `goBack()` — `router.back()` throws when a screen was opened by deep link or reloaded on web.
- `src/lib/files.ts` — `persistPhoto()` copies picker photos out of the OS cache and shrinks them first (`PHOTO_SIZES`; a 300-page book of raw camera photos is ~600 MB). `readTextFile`/`readBytesFile` handle the web `File` vs native URI split and the Android `content://` permission trap; `COPY_PICKED_FILE` must stay false on Android.
- `src/lib/ocr.ts` — ML Kit is `require`d lazily inside a try/catch so the app still runs in Expo Go, where the native module does not exist. Gate any OCR UI on `isOcrAvailable()`.
- `src/lib/archive.ts` — zip export/import (fflate). JSON alone only stores picture *paths*, so the archive carries `photos/`, `covers/`, `comics/` alongside `backup.json` and rewrites every URI on the way in and out.
- `src/lib/useNarrator.ts` — `Speech.pause()/resume()` are iOS/web only, so pause is implemented as stop-and-remember; a generation counter (`genRef`) discards the late `onDone` that `Speech.stop()` fires.

### UI

`src/components/ui.tsx` is the whole design system (`Screen`, `Card`, `Button`, `Field`, `Chip`, `Collapsible`, `CollapsibleList`, `Slider`, `Dropdown`, …) — compose these rather than styling raw `View`s. Colours come only from `useTheme()` in `src/theme.ts` (warm paper palette, light + dark, honouring `settings.theme`); use `radius` and `space()` from the same file. No hard-coded hex in screens.

### Voice

`src/lib/narrate.ts` splits a chapter into `NarrationLine[]` two ways: `scriptFromText()` detects dialogue by quotation marks and "said X" attribution when nothing has been cast, and `scriptFor(section)` prefers the AI-cast `section.narration` when the "Cast it for reading aloud" prompt has been applied. Mood maps to rate/pitch in `MOODS`; per-character voices are stored on `book.cast`.
