import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import {
  type AudioPlayer,
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as Speech from "expo-speech";
import { errorMessage, sendVoice, type VoiceReply } from "./api";
import { Lang, say, t } from "./i18n";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

const MIN_RECORDING_MS = 600;

// Hold-to-talk + playback, shared by the home screen and the chat screen.
//   start()/stop()  — wire to a button's onPressIn/onPressOut
//   speak()         — play server audio (ElevenLabs) or fall back to on-device speech
// `phase` drives the Saathi avatar animation.
export function useVoiceTalk(lang: Lang, onTurn?: (turn: VoiceReply) => void) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useRef<AudioPlayer | null>(null);
  const startedAt = useRef(0);
  const phaseRef = useRef<VoicePhase>("idle");
  phaseRef.current = phase;

  useEffect(() => {
    requestRecordingPermissionsAsync().catch(() => {});
    return () => {
      player.current?.remove();
      Speech.stop();
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    player.current?.remove();
    player.current = null;
    Speech.stop();
    setPhase("idle");
  }, []);

  const speak = useCallback(
    async (text: string, audioUrl: string | null) => {
      player.current?.remove();
      player.current = null;
      setPhase("speaking");
      const fallback = () => say(text, lang, () => setPhase((p) => (p === "speaking" ? "idle" : p)));
      if (!audioUrl) return fallback();
      try {
        // Playback mode: loudspeaker, and audible even with the silent switch on.
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const p = createAudioPlayer({ uri: audioUrl });
        player.current = p;
        p.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish || status.error) {
            p.remove();
            if (player.current === p) player.current = null;
            if (status.error) fallback();
            else setPhase((ph) => (ph === "speaking" ? "idle" : ph));
          }
        });
        p.play();
      } catch {
        fallback();
      }
    },
    [lang]
  );

  const start = useCallback(async () => {
    if (phaseRef.current === "thinking") return;
    if (phaseRef.current === "speaking") stopSpeaking();
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t(lang, "micDenied"));
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setPhase("listening");
    } catch (e) {
      Alert.alert("Microphone", errorMessage(e, "Couldn't start recording."));
      setPhase("idle");
    }
  }, [lang, recorder, stopSpeaking]);

  const stop = useCallback(async () => {
    if (phaseRef.current !== "listening") return;
    const heldFor = Date.now() - startedAt.current;
    try {
      await recorder.stop();
    } catch {}
    const uri = recorder.uri;
    if (heldFor < MIN_RECORDING_MS || !uri) {
      setPhase("idle");
      say(t(lang, "tooShort"), lang);
      return;
    }
    setPhase("thinking");
    try {
      const turn = await sendVoice(uri);
      onTurn?.(turn);
      await speak(turn.reply, turn.audioUrl);
    } catch (e) {
      setPhase("idle");
      Alert.alert("Saathi", errorMessage(e, "Sorry, I couldn't hear you just now."));
    }
  }, [lang, onTurn, recorder, speak]);

  return { phase, start, stop, speak, stopSpeaking, setPhase };
}
