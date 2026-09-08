# Book Friend

A private reading journal for one person — yours. Every book, page photo, summary and
comic panel lives on your phone. There is no server, no account and no database:
the whole library is a JSON blob in local storage, and page photos are files in the
app's own folder.

## What it does

**Track what you're reading.** Books with covers, status, rating, tags and progress.
Each book breaks into whatever the book calls its pieces — chapters, parts, episodes,
cantos, lessons — and each one is marked unread / reading / read.

**Photograph the pages.** Point the camera at an open book; one photo can hold a
two-page spread, and there is a checkbox saying so. Photos are copied out of the
OS cache into permanent storage so they survive. A page does not need a photo at
all — you can add a text-only page, or let a transcription create one, just to
mark how far you have got.

**Pull the text out of the photos.** On-device text recognition (Google ML Kit)
reads the scans with nothing leaving the phone. It de-hyphenates words split across
lines and re-flows the hard line wraps into paragraphs. You can fix any misread
text by hand, and the corrected text is what the AI prompts are built from.

**The AI bridge — copy a prompt out, paste an answer back.** The app never calls an
AI service. It writes a careful prompt, you copy it into whichever AI app you like,
and you paste the reply back. The reply is parsed and fanned out across the UI:
summary, recap, key points, themes, who's-who, quotes, vocabulary and comic panels
all appear in their own places. Seven prompts ship with it:

| Prompt | What comes back |
| --- | --- |
| Transcribe page photos | Text for each scan (when on-device OCR isn't available) |
| Summarise this chapter | The full chapter screen — summary, recap, key points, characters, quotes, words |
| Recap before I continue | A "previously on…" refresher built from everything read so far |
| Draw it as a comic | The chapter split into scenes, each with an image prompt |
| Go deeper | Themes, symbolism, discussion questions |
| Outline the book | Blurb, genre, tags and the whole chapter list — creates the chapters for you |
| Story so far | One running summary of the book, plus the threads still hanging |

After you apply a reply you get a receipt: one small card per thing that was saved,
saying where in the app it landed — long text collapses behind "Show more", long
lists behind "Show N more", and merged lists say plainly how much was actually new
("1 new, 2 already there").

The parser is deliberately forgiving: it digs the JSON out of a code fence or out of
a chatty "Sure, here you go!" reply, repairs trailing commas and smart quotes, and
if the AI ignored the format entirely it still saves the plain text rather than
losing your round trip. Nothing is overwritten blindly — characters, quotes and
vocabulary merge with what's already there.

**Draw the chapter as a comic.** Ask for a comic and the chapter comes back broken
into its scenes — a caption for each one and a full image prompt to go with it,
written so every panel keeps the same art style and the same faces. Two ways to draw it. Copy the
whole-page brief and the image AI returns **one comic page** with every scene laid
out in a grid — save that single picture and it becomes the chapter's comic page.
Or copy one panel's prompt at a time and drop each picture onto its own panel;
"fill empty panels" takes a batch at once and lays them out in order. Panels can
also be written by hand.

**Know where you are.** Give a chapter its first and last page and the chapter
screen draws a progress bar from the page numbers on your scans — "you are on
p. 21 · 10 of 19 · 9 to go" — and the chapter list on the book screen shows the
same thing in miniature.

**Reading sessions.** A timer on every chapter, a daily goal, a streak, a two-week
bar chart and a session log in the Progress tab.

**Your data stays yours.** Export the whole library to a JSON file and restore it
from Settings.

## Running it

```bash
npm install
npx expo start
```

Then press `a` for Android, `i` for iOS, or `w` for the browser.

### Turning on on-device text extraction

Text recognition uses `@react-native-ml-kit/text-recognition`, a native module, so
it does not exist in Expo Go. Build the app once and it switches on by itself:

```bash
npx expo run:android     # or: npx expo run:ios
```

Until then the app runs fine — Settings shows the scanner as off, and the scan
screen offers "Transcribe with AI" instead, which is the same copy/paste round trip
with the photos attached in the other app.

## How it's put together

```
app/                       expo-router screens
  (tabs)/                  Library · Progress · Settings
  book/new, book/[id]/     add, view and edit a book
  section/[id]/            a chapter, its page scans and its comic
  ai.tsx                   the copy-prompt / paste-answer bridge
src/
  store.ts                 zustand + AsyncStorage, the whole data model
  types.ts                 Book, Section, PageShot, ComicPanel, ReadingSession
  theme.ts                 warm paper palette, light and dark
  lib/prompts.ts           prompt text and the JSON contract for each kind
  lib/parse.ts             forgiving parser for whatever the AI replied
  lib/ocr.ts               ML Kit wrapper, with a graceful fallback
  lib/files.ts             photo storage, backup export/import
  components/              shared UI
```
