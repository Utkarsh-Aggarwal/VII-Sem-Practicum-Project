import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  acknowledgeAlert,
  ConversationSummary,
  ElderOverview,
  errorMessage,
  fetchConversations,
  fetchOverview,
  isUnauthorized,
  registerCaregiverPushToken,
} from "../api";
import { getPushToken } from "../notifications";
import { Lang, t } from "../i18n";

const DOT: Record<string, { color: string; symbol: string }> = {
  DONE_ON_TIME: { color: "#10b981", symbol: "✓" },
  DONE_LATE: { color: "#f59e0b", symbol: "✓" },
  MISSED: { color: "#f43f5e", symbol: "✕" },
  SKIPPED: { color: "#94a3b8", symbol: "–" },
  PENDING: { color: "#e2e8f0", symbol: "" },
};

const SEVERITY: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: "#fff1f2", fg: "#e11d48", label: "URGENT" },
  warning: { bg: "#fffbeb", fg: "#d97706", label: "CHECK" },
  info: { bg: "#f8fafc", fg: "#64748b", label: "FYI" },
};

const MOOD: Record<string, { label: string; color: string; bg: string }> = {
  good: { label: "☺ Good", color: "#059669", bg: "#ecfdf5" },
  okay: { label: "• Okay", color: "#475569", bg: "#f1f5f9" },
  low: { label: "▾ Low", color: "#d97706", bg: "#fffbeb" },
  unwell: { label: "⚠ Unwell", color: "#e11d48", bg: "#fff1f2" },
};

const MOOD_EMOJI: Record<string, string> = { great: "😄", okay: "🙂", not_great: "😕" };

// Caretaker side: today's status for each parent, alerts to act on, and what they talked about with Saathi.
export function CaregiverScreen({ name, lang, onSignOut }: { name: string; lang: Lang; onSignOut: () => void }) {
  const [elders, setElders] = useState<ElderOverview[] | null>(null);
  const [talks, setTalks] = useState<Record<string, ConversationSummary | null>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchOverview();
      setElders(list);
      const latest = await Promise.all(
        list.map(async (e) => {
          const convos = await fetchConversations(e.elder.id).catch(() => []);
          return [e.elder.id, convos.find((c) => c.summary) ?? convos[0] ?? null] as const;
        })
      );
      setTalks(Object.fromEntries(latest));
    } catch (e) {
      if (isUnauthorized(e)) return onSignOut();
      Alert.alert("Couldn't load", errorMessage(e, "Please try again."));
    }
  }, [onSignOut]);

  useEffect(() => {
    load();
    getPushToken().then((token) => {
      if (token) registerCaregiverPushToken(token).catch(() => {});
    });
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function ack(id: string) {
    await acknowledgeAlert(id).catch(() => {});
    load();
  }

  if (!elders) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 60 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Text style={styles.title}>
        {t(lang, "hi")} {name.split(" ")[0]}
      </Text>
      <Text style={styles.subtitle}>{t(lang, "familyToday")}</Text>

      {elders.length === 0 && <Text style={styles.empty}>{t(lang, "noFamily")}</Text>}

      {elders.map((e) => {
        const talk = talks[e.elder.id];
        const mood = talk?.mood ? MOOD[talk.mood] : null;
        return (
          <View key={e.elder.id} style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: e.elder.avatarColor }]}>
                <Text style={styles.avatarText}>{e.elder.name.slice(0, 1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{e.elder.name}</Text>
                <Text style={styles.meta}>
                  {e.elder.relation}
                  {e.hub !== "none" ? ` · hub ${e.hub}` : ""}
                  {e.lastMood ? ` · ${MOOD_EMOJI[e.lastMood.mood] ?? ""} ${e.lastMood.mood.replace("_", " ")}` : ""}
                </Text>
              </View>
            </View>

            <View style={styles.stats}>
              <Stat label={t(lang, "doneStat")} value={e.done} color="#059669" />
              <Stat label={t(lang, "pendingStat")} value={e.pending} color="#475569" />
              <Stat label={t(lang, "missedStat")} value={e.missed} color="#e11d48" />
            </View>

            {e.timeline.length > 0 && (
              <View style={styles.timeline}>
                {e.timeline.map((c) => {
                  const d = DOT[c.status] ?? DOT.PENDING;
                  return (
                    <View key={c.id} style={styles.timelineItem}>
                      <View style={[styles.dot, { backgroundColor: d.color }]}>
                        <Text style={styles.dotText}>{d.symbol}</Text>
                      </View>
                      <Text style={styles.dotLabel} numberOfLines={1}>
                        {c.time}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.talk}>
              <View style={[styles.row, { gap: 8 }]}>
                <Text style={styles.talkTitle}>
                  {talk?.usedVoice ? "🎙 " : "💬 "}
                  {t(lang, "lastTalk")}
                </Text>
                {mood && (
                  <Text style={[styles.moodPill, { color: mood.color, backgroundColor: mood.bg }]}>{mood.label}</Text>
                )}
              </View>
              <Text style={styles.talkText}>{talk?.summary ?? (talk ? "…" : t(lang, "noTalk"))}</Text>
              {talk?.concerns?.length ? (
                <View style={styles.concerns}>
                  {talk.concerns.map((c) => (
                    <Text key={c} style={styles.concern}>
                      ⚠ {c}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            {e.openAlerts.map((a) => {
              const s = SEVERITY[a.severity] ?? SEVERITY.info;
              return (
                <View key={a.id} style={[styles.alert, { backgroundColor: s.bg }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.alertLabel, { color: s.fg }]}>
                      ⚠ {s.label} · {a.title}
                    </Text>
                    <Text style={styles.alertMessage}>{a.message}</Text>
                  </View>
                  <TouchableOpacity style={styles.ackButton} onPress={() => ack(a.id)}>
                    <Text style={styles.ackText}>{t(lang, "onIt")}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        );
      })}

      <TouchableOpacity style={{ marginTop: 16, alignItems: "center" }} onPress={onSignOut}>
        <Text style={{ color: "#94a3b8", fontSize: 14 }}>{t(lang, "signOut")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "700", color: "#1e293b" },
  subtitle: { fontSize: 16, color: "#64748b", marginTop: 4, marginBottom: 20 },
  empty: { fontSize: 16, color: "#64748b" },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#e2e8f0" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  name: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  meta: { fontSize: 13, color: "#64748b", marginTop: 2 },
  stats: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: { flex: 1, backgroundColor: "#f8fafc", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 12, color: "#64748b" },
  timeline: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  timelineItem: { alignItems: "center", width: 44 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dotText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  dotLabel: { fontSize: 10, color: "#94a3b8", marginTop: 2 },
  talk: { marginTop: 14, backgroundColor: "#f8fafc", borderRadius: 12, padding: 12 },
  talkTitle: { fontSize: 13, fontWeight: "700", color: "#475569" },
  moodPill: { fontSize: 12, fontWeight: "700", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  talkText: { fontSize: 14, color: "#334155", marginTop: 6, lineHeight: 20 },
  concerns: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  concern: { fontSize: 12, fontWeight: "600", color: "#b45309", backgroundColor: "#fffbeb", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  alert: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 12, marginTop: 10 },
  alertLabel: { fontSize: 13, fontWeight: "700" },
  alertMessage: { fontSize: 14, color: "#334155", marginTop: 2 },
  ackButton: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  ackText: { fontSize: 13, fontWeight: "600", color: "#334155" },
});
