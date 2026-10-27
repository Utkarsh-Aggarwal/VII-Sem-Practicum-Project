import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  DueAnnouncement,
  errorMessage,
  fetchDue,
  fetchToday,
  isUnauthorized,
  Mood,
  Prompt,
  registerSeniorPushToken,
  requestHelp,
  respondToCheckIn,
  submitMood,
  submitSelfReport,
  TodayItem,
  VoiceReply,
} from "../api";
import {
  cancelLocalReminders,
  ensureNotificationPermission,
  getPushToken,
  notificationsAvailable,
  setupAndroidChannel,
  syncDailyReminderNotifications,
} from "../notifications";
import { Lang, t } from "../i18n";
import { useVoiceTalk } from "../useVoiceTalk";
import { SaathiAvatar } from "../components/SaathiAvatar";

const TYPE_EMOJI: Record<string, string> = {
  MEDICINE: "💊",
  MEAL: "🍽️",
  SLEEP: "🌙",
  WAKE: "☀️",
  CUSTOM: "🔔",
};

const MOODS: { key: Mood; emoji: string; label: "great" | "okay" | "notGreat" }[] = [
  { key: "great", emoji: "😄", label: "great" },
  { key: "okay", emoji: "🙂", label: "okay" },
  { key: "not_great", emoji: "😕", label: "notGreat" },
];

const ANNOUNCED_KEY = "carecircle:announced";
const DUE_POLL_MS = 15_000;
const TODAY_POLL_MS = 60_000;

export function HomeScreen({
  lang,
  onChangeLang,
  onSwitchProfile,
  onOpenChat,
}: {
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
  onSwitchProfile: () => void;
  onOpenChat: () => void;
}) {
  const [elderName, setElderName] = useState("");
  const [items, setItems] = useState<TodayItem[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [moodToday, setMoodToday] = useState<Mood | null>(null);
  const [due, setDue] = useState<DueAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastTurn, setLastTurn] = useState<{ heard: string; reply: string } | null>(null);
  const pushSetUp = useRef(false);
  const announced = useRef<Set<string>>(new Set());

  const loadToday = useCallback(async () => {
    try {
      const data = await fetchToday();
      setElderName(data.elder.name);
      setItems(data.items);
      setPrompts(data.prompts);
      setMoodToday(data.moodToday);

      if (!pushSetUp.current) {
        pushSetUp.current = true;
        // Prefer server push; without a push token fall back to local daily notifications.
        const token = await getPushToken();
        if (token) {
          await registerSeniorPushToken(token);
          await cancelLocalReminders();
        } else {
          await ensureNotificationPermission();
          await setupAndroidChannel();
          await syncDailyReminderNotifications(data.items.map((i) => i.reminder));
        }
      }
    } catch (e) {
      if (isUnauthorized(e)) {
        Alert.alert("This phone was unpaired", "Ask your family for a new pairing code.");
        onSwitchProfile();
        return;
      }
      throw e;
    }
  }, [onSwitchProfile]);

  // Voice turns may answer a reminder ("haan le li"), so refresh after each one.
  const onTurn = useCallback(
    (turn: VoiceReply) => {
      setLastTurn({ heard: turn.transcript, reply: turn.reply });
      loadToday().catch(() => {});
      fetchDue().then(setDue).catch(() => {});
    },
    [loadToday]
  );
  const voice = useVoiceTalk(lang, onTurn);
  const { speak } = voice; // stable callback; `voice` itself is a new object every render
  const phaseRef = useRef(voice.phase);
  phaseRef.current = voice.phase;

  // Poll for due reminders and speak each new one once, by itself.
  const checkDue = useCallback(async () => {
    let list: DueAnnouncement[];
    try {
      list = await fetchDue();
    } catch {
      return;
    }
    setDue(list);
    const next = list.find((d) => !announced.current.has(d.key));
    if (!next || phaseRef.current !== "idle") return;
    announced.current.add(next.key);
    AsyncStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...announced.current].slice(-60))).catch(() => {});
    setLastTurn({ heard: "", reply: next.text });
    await speak(next.text, next.audioUrl);
  }, [speak]);

  useEffect(() => {
    AsyncStorage.getItem(ANNOUNCED_KEY)
      .then((raw) => {
        if (raw) announced.current = new Set(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => checkDue());
    loadToday()
      .catch((e) => Alert.alert("Couldn't load today", errorMessage(e, "Please try again.")))
      .finally(() => setLoading(false));

    const dueTimer = setInterval(() => {
      if (AppState.currentState === "active") checkDue();
    }, DUE_POLL_MS);
    const todayTimer = setInterval(() => loadToday().catch(() => {}), TODAY_POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        checkDue();
        loadToday().catch(() => {});
      }
    });
    return () => {
      clearInterval(dueTimer);
      clearInterval(todayTimer);
      sub.remove();
    };
  }, [checkDue, loadToday]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadToday().catch(() => {}), checkDue()]);
    setRefreshing(false);
  }

  function say(message: string | null | undefined) {
    if (!message) return;
    setLastTurn({ heard: "", reply: message });
    voice.speak(message, null);
  }

  async function answer(checkInId: string, yes: boolean) {
    try {
      const { checkIn, message } = await respondToCheckIn(checkInId, yes ? "yes" : "no");
      setItems((prev) => prev.map((i) => (i.checkIn.id === checkInId ? { ...i, checkIn } : i)));
      setDue((d) => d.filter((x) => x.checkInId !== checkInId));
      say(message);
    } catch (e) {
      Alert.alert("Couldn't save", errorMessage(e, "Please try again."));
    }
  }

  async function pickMood(mood: Mood) {
    try {
      const { message } = await submitMood(mood);
      setMoodToday(mood);
      say(message ?? t(lang, "thanksMood"));
    } catch (e) {
      Alert.alert("Couldn't save", errorMessage(e, "Please try again."));
    }
  }

  async function answerPrompt(prompt: Prompt, answerValue: string) {
    try {
      const { message } = await submitSelfReport(prompt.kind, answerValue);
      setPrompts((p) => p.filter((x) => x.kind !== prompt.kind));
      say(message ?? t(lang, "thanksMood"));
    } catch (e) {
      Alert.alert("Couldn't save", errorMessage(e, "Please try again."));
    }
  }

  function askForHelp() {
    Alert.alert(t(lang, "helpConfirmTitle"), t(lang, "helpConfirmBody"), [
      { text: t(lang, "cancel"), style: "cancel" },
      {
        text: t(lang, "helpYes"),
        style: "destructive",
        onPress: async () => {
          try {
            const { message } = await requestHelp();
            say(message);
          } catch (e) {
            Alert.alert("Couldn't reach your family", errorMessage(e, "Please call them directly."));
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  const hour = new Date().getHours();
  const greeting = t(lang, hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening");
  const phase = voice.phase;
  const talkLabel =
    phase === "listening" ? t(lang, "listening") : phase === "thinking" ? t(lang, "thinking") : phase === "speaking" ? t(lang, "speaking") : t(lang, "holdToTalk");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Text style={styles.greeting}>
        {greeting}, {elderName.split(" ")[0]}!
      </Text>
      <Text style={styles.date}>
        {new Date().toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "long", month: "long", day: "numeric" })}
      </Text>

      {/* Saathi: talk right from the home screen */}
      <View style={styles.hero}>
        <SaathiAvatar phase={phase} size={130} />
        <Text style={styles.caption} numberOfLines={4}>
          {lastTurn?.reply ?? t(lang, "talkCaption")}
        </Text>
        {lastTurn?.heard ? (
          <Text style={styles.heard} numberOfLines={2}>
            {t(lang, "youSaid")}: “{lastTurn.heard}”
          </Text>
        ) : null}
        <Pressable
          onPressIn={voice.start}
          onPressOut={voice.stop}
          onPress={() => phase === "speaking" && voice.stopSpeaking()}
          disabled={phase === "thinking"}
          accessibilityRole="button"
          accessibilityLabel={talkLabel}
          style={({ pressed }) => [
            styles.talkButton,
            phase === "listening" && { backgroundColor: "#e11d48" },
            phase === "thinking" && { backgroundColor: "#94a3b8" },
            phase === "speaking" && { backgroundColor: "#059669" },
            pressed && phase === "idle" && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.talkText}>
            {phase === "speaking" ? "🔊" : "🎙️"}  {talkLabel}
          </Text>
        </Pressable>
      </View>

      {/* Reminders that are due right now (also spoken aloud automatically) */}
      {due.map((d) => (
        <View key={d.key} style={styles.dueCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>{TYPE_EMOJI[d.type] ?? "🔔"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.dueTitle}>{t(lang, "dueNow")}</Text>
              <Text style={styles.cardLabel}>{d.label}</Text>
            </View>
            <TouchableOpacity onPress={() => voice.speak(d.text, d.audioUrl)} accessibilityLabel="Repeat">
              <Text style={styles.speaker}>🔊</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardQuestion}>{d.text}</Text>
          <View style={styles.answerRow}>
            <TouchableOpacity style={[styles.answerButton, styles.yesButton]} onPress={() => answer(d.checkInId, true)}>
              <Text style={styles.answerButtonText}>{t(lang, "yes")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.answerButton, styles.noButton]} onPress={() => answer(d.checkInId, false)}>
              <Text style={[styles.answerButtonText, { color: "#334155" }]}>{t(lang, "notYet")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionButton, styles.chatButton]} onPress={onOpenChat}>
          <Text style={[styles.actionText, { color: "#3730a3" }]}>{t(lang, "openChat")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.helpButton]} onPress={askForHelp}>
          <Text style={styles.actionText}>{t(lang, "help")}</Text>
        </TouchableOpacity>
      </View>

      {!notificationsAvailable() && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t(lang, "noPopups")}</Text>
        </View>
      )}

      {!moodToday && (
        <>
          <Text style={styles.sectionTitle}>{t(lang, "feeling")}</Text>
          <View style={styles.moodRow}>
            {MOODS.map((m) => (
              <TouchableOpacity key={m.key} style={styles.moodButton} onPress={() => pickMood(m.key)}>
                <Text style={styles.moodEmoji}>{m.emoji}</Text>
                <Text style={styles.moodLabel}>{t(lang, m.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {prompts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t(lang, "quickQuestions")}</Text>
          {prompts.map((p) => (
            <View key={p.kind} style={styles.card}>
              <TouchableOpacity onPress={() => voice.speak(p.question, null)}>
                <Text style={styles.promptQuestion}>{p.question}</Text>
              </TouchableOpacity>
              <View style={styles.answerRow}>
                {p.options.map((o) => (
                  <TouchableOpacity key={o.answer} style={[styles.answerButton, styles.optionButton]} onPress={() => answerPrompt(p, o.answer)}>
                    <Text style={styles.optionText}>
                      {o.emoji} {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>{t(lang, "checkins")}</Text>
      {items.length === 0 && <Text style={styles.empty}>{t(lang, "none")}</Text>}

      {items.map((item) => {
        const { status, response } = item.checkIn;
        const done = status.startsWith("DONE");
        const missed = status === "MISSED";
        const notYet = status === "PENDING" && response === "not_yet";
        return (
          <View key={item.checkIn.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>{TYPE_EMOJI[item.reminder.type] ?? "🔔"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTime}>{item.reminder.time}</Text>
                <Text style={styles.cardLabel}>{item.reminder.label}</Text>
              </View>
              <TouchableOpacity onPress={() => voice.speak(item.reminder.question, null)} accessibilityLabel="Read aloud">
                <Text style={styles.speaker}>🔊</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardQuestion}>{item.reminder.question}</Text>

            {done ? (
              <View style={[styles.answeredPill, styles.pillYes]}>
                <Text style={styles.answeredText}>{t(lang, "done")}</Text>
              </View>
            ) : missed || notYet ? (
              <>
                <Text style={missed ? styles.missedText : styles.notYetText}>{missed ? t(lang, "missed") : t(lang, "willRemind")}</Text>
                <TouchableOpacity style={[styles.answerButton, styles.yesButton]} onPress={() => answer(item.checkIn.id, true)}>
                  <Text style={styles.answerButtonText}>{t(lang, "tookItNow")}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.answerRow}>
                <TouchableOpacity style={[styles.answerButton, styles.yesButton]} onPress={() => answer(item.checkIn.id, true)}>
                  <Text style={styles.answerButtonText}>{t(lang, "yes")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.answerButton, styles.noButton]} onPress={() => answer(item.checkIn.id, false)}>
                  <Text style={[styles.answerButtonText, { color: "#334155" }]}>{t(lang, "notYet")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      <TouchableOpacity style={styles.footerLink} onPress={() => onChangeLang(lang === "hi" ? "en" : "hi")}>
        <Text style={styles.langText}>{t(lang, "language")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerLink} onPress={onSwitchProfile}>
        <Text style={styles.switchProfileText}>{t(lang, "switch")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" },
  greeting: { fontSize: 30, fontWeight: "700", color: "#1e293b" },
  date: { fontSize: 16, color: "#64748b", marginTop: 4 },
  hero: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 18,
    paddingBottom: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  caption: { fontSize: 19, lineHeight: 27, color: "#1e293b", textAlign: "center", fontWeight: "600", minHeight: 54 },
  heard: { fontSize: 14, color: "#64748b", marginTop: 6, textAlign: "center" },
  talkButton: {
    marginTop: 16,
    alignSelf: "stretch",
    backgroundColor: "#4f46e5",
    borderRadius: 20,
    paddingVertical: 22,
    alignItems: "center",
  },
  talkText: { color: "#fff", fontSize: 21, fontWeight: "800" },
  dueCard: {
    marginTop: 16,
    backgroundColor: "#fffbeb",
    borderRadius: 18,
    padding: 18,
    borderWidth: 2,
    borderColor: "#f59e0b",
  },
  dueTitle: { fontSize: 15, fontWeight: "800", color: "#b45309" },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  actionButton: { flex: 1, borderRadius: 16, paddingVertical: 18, alignItems: "center" },
  chatButton: { backgroundColor: "#eef2ff" },
  helpButton: { backgroundColor: "#e11d48" },
  actionText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  notice: { backgroundColor: "#fef3c7", borderRadius: 12, padding: 14, marginTop: 16 },
  noticeText: { fontSize: 14, color: "#92400e", lineHeight: 20 },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#334155", marginTop: 28, marginBottom: 12 },
  moodRow: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
  moodButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  moodEmoji: { fontSize: 32 },
  moodLabel: { marginTop: 6, fontSize: 14, fontWeight: "600", color: "#475569" },
  empty: { fontSize: 16, color: "#64748b" },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#e2e8f0" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardEmoji: { fontSize: 34 },
  cardTime: { fontSize: 14, color: "#94a3b8", fontWeight: "600" },
  cardLabel: { fontSize: 20, fontWeight: "700", color: "#1e293b" },
  speaker: { fontSize: 26, padding: 4 },
  cardQuestion: { fontSize: 18, color: "#334155", marginTop: 14, marginBottom: 16, lineHeight: 25 },
  promptQuestion: { fontSize: 19, fontWeight: "600", color: "#1e293b", marginBottom: 14 },
  answerRow: { flexDirection: "row", gap: 12 },
  answerButton: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  yesButton: { backgroundColor: "#16a34a" },
  noButton: { backgroundColor: "#f1f5f9" },
  optionButton: { backgroundColor: "#eef2ff" },
  optionText: { fontSize: 17, fontWeight: "700", color: "#3730a3" },
  answerButtonText: { fontSize: 18, fontWeight: "700", color: "#fff" },
  answeredPill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  pillYes: { backgroundColor: "#dcfce7" },
  answeredText: { fontSize: 15, fontWeight: "700", color: "#166534" },
  missedText: { fontSize: 15, color: "#be123c", fontWeight: "600", marginBottom: 10 },
  notYetText: { fontSize: 15, color: "#64748b", fontWeight: "600", marginBottom: 10 },
  footerLink: { marginTop: 18, alignItems: "center" },
  langText: { color: "#4f46e5", fontSize: 16, fontWeight: "700" },
  switchProfileText: { color: "#94a3b8", fontSize: 14 },
});
