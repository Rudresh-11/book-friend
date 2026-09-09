import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CastVoice, NarrationLine } from '../types';
import { deliveryFor } from './narrate';

export type NarratorOptions = {
  cast: CastVoice[];
  rate: number;
  pitch: number;
  narratorVoice?: string;
  /** 0 silences the voice while the reading keeps moving through the lines */
  volume?: number;
};

/**
 * Speaks a script one line at a time, moving on in each utterance's onDone.
 *
 * Speech.pause()/resume() only exist on iOS and web, so pausing here means
 * stopping and remembering the line — which behaves the same everywhere and
 * also gives us the current line to highlight while it reads.
 */
export function useNarrator(lines: NarrationLine[], options: NarratorOptions) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  // the callbacks live for as long as an utterance does, so they read live values
  const linesRef = useRef(lines);
  const optionsRef = useRef(options);
  const playingRef = useRef(false);
  const indexRef = useRef(0);
  linesRef.current = lines;
  optionsRef.current = options;

  /**
   * Bumped every time the playhead is moved by hand. Speech.stop() makes the
   * utterance it interrupts fire onDone, and that late callback used to advance
   * the playhead one line past wherever you had just tapped — so the highlight
   * ran ahead of the voice. A callback from an older generation is ignored.
   */
  const genRef = useRef(0);

  const speakFrom = useCallback((start: number, gen: number) => {
    const script = linesRef.current;
    if (gen !== genRef.current) return;
    if (start >= script.length) {
      playingRef.current = false;
      setPlaying(false);
      setIndex(0);
      indexRef.current = 0;
      return;
    }
    indexRef.current = start;
    setIndex(start);

    const line = script[start];
    const o = optionsRef.current;
    const delivery = deliveryFor(line, o.cast, o.rate, o.pitch, o.narratorVoice);

    const carryOn = () => {
      if (gen !== genRef.current || !playingRef.current) return;
      speakFrom(start + 1, gen);
    };

    Speech.speak(line.text, {
      voice: delivery.voice,
      rate: delivery.rate,
      pitch: delivery.pitch,
      // a silenced utterance still takes its normal time, so the highlight and
      // the auto-scroll carry on at reading pace with the sound turned off
      volume: o.volume ?? 1,
      onDone: carryOn,
      onError: carryOn,
    });
  }, []);

  const play = useCallback(
    (from?: number) => {
      const gen = ++genRef.current; // invalidates callbacks from the utterance we are about to stop
      Speech.stop();
      playingRef.current = true;
      setPlaying(true);
      speakFrom(from ?? indexRef.current, gen);
    },
    [speakFrom]
  );

  const pause = useCallback(() => {
    genRef.current += 1;
    playingRef.current = false;
    setPlaying(false);
    Speech.stop();
  }, []);

  const stop = useCallback(() => {
    genRef.current += 1;
    playingRef.current = false;
    setPlaying(false);
    Speech.stop();
    setIndex(0);
    indexRef.current = 0;
  }, []);

  const jumpTo = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(linesRef.current.length - 1, to));
      if (playingRef.current) {
        play(clamped); // moves the playhead and the highlight together
        return;
      }
      genRef.current += 1;
      Speech.stop();
      indexRef.current = clamped;
      setIndex(clamped);
    },
    [play]
  );

  // never leave a voice talking after the screen is gone
  useEffect(() => {
    return () => {
      genRef.current += 1;
      playingRef.current = false;
      Speech.stop();
    };
  }, []);

  return { index, playing, play, pause, stop, jumpTo, toggle: () => (playingRef.current ? pause() : play()) };
}

/** Voices installed on this phone, best-sounding first where we can tell. */
export async function listVoices(language = 'en') {
  try {
    const all = await Speech.getAvailableVoicesAsync();
    return all
      .filter((v) => !language || v.language?.toLowerCase().startsWith(language.toLowerCase()))
      .sort((a, b) => (a.quality === b.quality ? 0 : a.quality === 'Enhanced' ? -1 : 1));
  } catch {
    return [];
  }
}
