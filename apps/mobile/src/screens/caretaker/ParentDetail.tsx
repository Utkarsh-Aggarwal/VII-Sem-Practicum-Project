import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  acknowledgeAlert,
  addNote,
  type CheckInRow,
  type ConversationSummary,
  createReminder,
  deleteParent,
  deleteReminder,
  type ElderOverview,
  type Environment,
  errorMessage,
  fetchCheckIns,
  fetchConversations,
  fetchEnvironment,
  fetchBathroomSensor,
  type BathroomSensor,
  fetchInsights,
  fetchNotes,
  fetchPairing,
  fetchParent,
  fetchReminders,
  fetchSelfReports,
  type Insights,
  inviteCaregiver,
  newPairingCode,
  type NoteRow,
  type Pairing,
  type ParentDetails,
  type ReminderRow,
  type SelfReportRow,
  updateParent,
  updateReminder,
} from "../../api";
import { Lang, t } from "../../i18n";
import { Card } from "../../ui/Card";
import { Icon, type IconName } from "../../ui/Icon";
import { Pill } from "../../ui/Pill";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { colors, radius } from "../../ui/theme";
import { MessagesSection } from "./MessagesSection";
import { ago, clock, DOT, MOOD, time12 } from "./shared";

// One parent, everything the website shows, in the same seven tabs.
type PTab = "overview" | "messages" | "reminders" | "conversations" | "health" | "family" | "settings";

const TABS: { key: PTab; label: string; icon: IconName }[] = [
  { key: "overview", label: "Overview", icon: "grid-outline" },
  { key: "messages", label: "Messages", icon: "mail-outline" },
  { key: "reminders", label: "Reminders", icon: "alarm-outline" },
  { key: "conversations", label: "Conversations", icon: "chatbubbles-outline" },
  { key: "health", label: "Health & home", icon: "heart-outline" },
  { key: "family", label: "Family", icon: "people-outline" },
  { key: "settings", label: "Settings", icon: "settings-outline" },
];

type TabProps = { parent: ElderOverview; lang: Lang; reload: number; onChanged: () => void };

export function ParentDetail({
  parent,
  lang,
  refreshKey,
  onBack,
  onChanged,
  onRemoved,
}: {
  parent: ElderOverview;
  lang: Lang;
  refreshKey: number;
  onBack: () => void;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [tab, setTab] = useState<PTab>("overview");
  const [pulls, setPulls] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const reload = refreshKey + pulls;
  const props: TabProps = { parent, lang, reload, onChanged };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={parent.elder.name} onBack={onBack} />
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((tb) => {
          const active = tb.key === tab;
          const badge = tb.key === "overview" ? parent.openAlerts.length : 0;
          return (
            <Pressable
              key={tb.key}
              onPress={() => setTab(tb.key)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Icon name={tb.icon} size={16} color={active ? colors.accent : colors.muted} />
              <Text style={[styles.chipText, active && { color: colors.accent }]}>{tb.label}</Text>
              {badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setPulls((n) => n + 1);
              onChanged();
              setTimeout(() => setRefreshing(false), 600);
            }}
          />
        }
      >
        {tab === "overview" && <OverviewTab {...props} onOpen={setTab} />}
        {tab === "messages" && <MessagesSection elderId={parent.elder.id} elderName={parent.elder.name} lang={lang} refreshKey={reload} />}
        {tab === "reminders" && <RemindersTab {...props} />}
        {tab === "conversations" && <ConversationsTab {...props} />}
        {tab === "health" && <HealthTab {...props} />}
        {tab === "family" && <FamilyTab {...props} />}
        {tab === "settings" && <SettingsTab {...props} onRemoved={onRemoved} />}
      </ScrollView>
    </View>
  );
}

// --- Small building blocks ---

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, "Couldn't load")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { data, error, reload: run, setData };
}

function Section({ title, icon, children, right }: { title: string; icon?: IconName; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.sectionHead}>
        {icon && <Icon name={icon} size={20} color={colors.accent} />}
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {children}
    </Card>
  );
}

function Loading({ error }: { error?: string | null }) {
  return error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.accent} />;
}

function Empty({ text }: { text: string }) {
  return <Text style={styles.muted}>{text}</Text>;
}

function SmallButton({ label, onPress, tone = "plain", icon, disabled }: { label: string; onPress: () => void; tone?: "plain" | "primary" | "danger"; icon?: IconName; disabled?: boolean }) {
  const bg = tone === "primary" ? colors.accent : tone === "danger" ? colors.bad : colors.surface;
  const fg = tone === "plain" ? colors.ink : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, borderColor: tone === "plain" ? colors.line : bg }, (pressed || disabled) && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      {icon && <Icon name={icon} size={16} color={fg} />}
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, ...input }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...input} style={[styles.input, input.multiline && { minHeight: 90, textAlignVertical: "top" }, input.style]} />
    </View>
  );
}

function Timeline({ items }: { items: { id: string; label: string; time: string; status: string }[] }) {
  if (!items.length) return <Empty text="No reminders today." />;
  return (
    <View style={{ gap: 10 }}>
      {items.map((c) => {
        const d = DOT[c.status] ?? DOT.PENDING;
        return (
          <View key={c.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: d.color }]}>{d.icon && <Icon name={d.icon} size={14} color={colors.white} />}</View>
            <Text style={{ width: 76, color: colors.muted, fontWeight: "600" }}>{time12(c.time)}</Text>
            <Text style={{ flex: 1, color: colors.ink, fontWeight: "600" }}>{c.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TalkCard({ c, lang }: { c: ConversationSummary; lang: Lang }) {
  const mood = c.mood ? MOOD[c.mood] : null;
  return (
    <Card style={{ gap: 8 }}>
      <View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}>
        <Text style={styles.meta}>{new Date(c.startedAt).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}</Text>
        {c.usedVoice && <Pill label="Voice" tone="accent" icon="mic" />}
        {mood && <Pill label={mood.label} tone={mood.tone} />}
        {!c.endedAt && <Pill label={t(lang, "talkingNow")} tone="good" />}
      </View>
      <Text style={styles.body}>
        {!c.endedAt && c.summary ? <Text style={{ fontWeight: "700", color: colors.accent }}>{t(lang, "soFar")} </Text> : null}
        {c.summary ?? "…"}
      </Text>
      {c.concerns.length > 0 && (
        <View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}>
          {c.concerns.map((x) => (
            <Pill key={x} label={x} tone="warn" />
          ))}
        </View>
      )}
    </Card>
  );
}

// --- Overview: what matters today ---

function OverviewTab({ parent, lang, reload, onChanged, onOpen }: TabProps & { onOpen: (t: PTab) => void }) {
  const id = parent.elder.id;
  const first = parent.elder.name.split(" ")[0];
  const talks = useLoad(() => fetchConversations(id), [id, reload]);
  const env = useLoad(() => fetchEnvironment(id), [id, reload]);
  const temp = env.data?.readings.temperature?.value;

  return (
    <>
      {parent.elder.phone && (
        <Pressable onPress={() => Linking.openURL(`tel:${parent.elder.phone}`)} style={styles.callButton} accessibilityRole="button">
          <Icon name="call" size={20} color={colors.white} />
          <Text style={styles.callText}>
            {t(lang, "call")} {first}
          </Text>
        </Pressable>
      )}

      <View style={[styles.statusBox, { backgroundColor: parent.status.tone === "good" ? colors.goodSoft : parent.status.tone === "warn" ? colors.warnSoft : colors.badSoft }]}>
        <Text style={[styles.statusLabel, { color: parent.status.tone === "good" ? colors.good : parent.status.tone === "warn" ? colors.warn : colors.bad }]}>{parent.status.label}</Text>
        {!!parent.status.detail && <Text style={styles.body}>{parent.status.detail}</Text>}
      </View>

      {parent.openAlerts.map((a) => (
        <Card key={a.id} style={{ gap: 6, borderLeftWidth: 5, borderLeftColor: a.severity === "critical" ? colors.bad : colors.warn }}>
          <Text style={styles.alertTitle}>{a.title}</Text>
          <Text style={styles.body}>{a.message}</Text>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Text style={styles.meta}>{ago(a.createdAt)}</Text>
            <SmallButton
              label={t(lang, "onIt")}
              onPress={async () => {
                await acknowledgeAlert(a.id).catch(() => {});
                onChanged();
              }}
            />
          </View>
        </Card>
      ))}

      <Section title={t(lang, "today")} icon="calendar-outline" right={<SmallButton label="Manage" onPress={() => onOpen("reminders")} />}>
        <Timeline items={parent.timeline} />
      </Section>

      <Section title="Latest conversation" icon="chatbubbles-outline" right={<SmallButton label="All" onPress={() => onOpen("conversations")} />}>
        {!talks.data ? <Loading error={talks.error} /> : talks.data.length === 0 ? <Empty text={`When ${first} talks to Saathi, a short summary appears here.`} /> : <TalkCard c={talks.data[0]} lang={lang} />}
      </Section>

      <Section title="At home" icon="home-outline" right={<SmallButton label="Details" onPress={() => onOpen("health")} />}>
        {!env.data ? (
          <Loading error={env.error} />
        ) : env.data.hubs.length === 0 ? (
          <Empty text="No home hub connected." />
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={styles.body}>{env.data.activeSince ? `Active since ${clock(env.data.activeSince)}` : "No movement seen today yet."}</Text>
            {temp !== undefined && <Text style={styles.body}>Room temperature {temp.toFixed(1)}°C</Text>}
            <Text style={styles.meta}>Hub {env.data.hubs.some((h) => h.online) ? "online" : "offline"}</Text>
          </View>
        )}
      </Section>
    </>
  );
}

// --- Reminders: add, edit, pause, delete + recent check-ins ---

const PRESETS: { label: string; type: string; time: string; question: string }[] = [
  { label: "Morning medicine", type: "MEDICINE", time: "08:00", question: "Did you take your morning medicine?" },
  { label: "Breakfast", type: "MEAL", time: "09:00", question: "Have you had your breakfast?" },
  { label: "Lunch", type: "MEAL", time: "13:00", question: "Have you had your lunch?" },
  { label: "Evening medicine", type: "MEDICINE", time: "20:00", question: "Did you take your evening medicine?" },
  { label: "Bedtime", type: "SLEEP", time: "22:00", question: "Are you getting ready for bed?" },
];

const TYPE_ICON: Record<string, IconName> = { MEDICINE: "medkit-outline", MEAL: "restaurant-outline", SLEEP: "moon-outline", WAKE: "sunny-outline", CUSTOM: "notifications-outline" };

type Draft = { id?: string; type: string; label: string; time: string; question: string };
const EMPTY: Draft = { type: "CUSTOM", label: "", time: "", question: "" };

function RemindersTab({ parent, reload, onChanged }: TabProps) {
  const id = parent.elder.id;
  const reminders = useLoad(() => fetchReminders(id), [id, reload]);
  const history = useLoad(() => fetchCheckIns(id, 7), [id, reload]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft) return;
    const time = draft.time.trim().padStart(5, "0");
    if (!draft.label.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      Alert.alert("Check the reminder", "Add a name and a time like 08:30 (24-hour).");
      return;
    }
    setSaving(true);
    try {
      const body = { type: draft.type, label: draft.label.trim(), time, question: draft.question.trim() || `${draft.label.trim()}?` };
      if (draft.id) await updateReminder(draft.id, body);
      else await createReminder({ ...body, elderId: id, daysOfWeek: "1,2,3,4,5,6,7" });
      setDraft(null);
      reminders.reload();
      onChanged();
    } catch (e) {
      Alert.alert("Couldn't save", errorMessage(e, "Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Section title="Reminders" icon="alarm-outline" right={!draft && <SmallButton label="Add" icon="add" tone="primary" onPress={() => setDraft({ ...EMPTY })} />}>
        {draft && (
          <View style={styles.form}>
            {!draft.id && (
              <View style={styles.wrap}>
                {PRESETS.map((p) => (
                  <Pressable key={p.label} onPress={() => setDraft({ ...p })} style={styles.preset}>
                    <Text style={styles.presetText}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Field label="Name" value={draft.label} onChangeText={(v) => setDraft({ ...draft, label: v })} placeholder="e.g. Morning medicine" />
            <Field label="Time (24-hour)" value={draft.time} onChangeText={(v) => setDraft({ ...draft, time: v })} placeholder="08:30" keyboardType="numbers-and-punctuation" maxLength={5} />
            <Field label="What Saathi asks" value={draft.question} onChangeText={(v) => setDraft({ ...draft, question: v })} placeholder="Did you take your medicine?" />
            <View style={styles.row}>
              <SmallButton label={saving ? "Saving…" : draft.id ? "Save changes" : "Add reminder"} tone="primary" onPress={save} disabled={saving} />
              <SmallButton label="Cancel" onPress={() => setDraft(null)} />
            </View>
          </View>
        )}
        {!reminders.data ? (
          <Loading error={reminders.error} />
        ) : reminders.data.length === 0 ? (
          <Empty text="No reminders yet. Start with medicine or meal times." />
        ) : (
          reminders.data.map((r: ReminderRow) => (
            <View key={r.id} style={[styles.listRow, !r.active && { opacity: 0.55 }]}>
              <Icon name={TYPE_ICON[r.type] ?? TYPE_ICON.CUSTOM} size={22} color={colors.accent} />
              <Pressable style={{ flex: 1 }} onPress={() => setDraft({ id: r.id, type: r.type, label: r.label, time: r.time, question: r.question })}>
                <Text style={styles.itemTitle}>{r.label}</Text>
                <Text style={styles.meta}>
                  {time12(r.time)} · {r.active ? "On" : "Paused"} · tap to edit
                </Text>
              </Pressable>
              <Switch
                value={r.active}
                onValueChange={async (v) => {
                  reminders.setData((list) => list?.map((x) => (x.id === r.id ? { ...x, active: v } : x)) ?? null);
                  await updateReminder(r.id, { active: v }).catch(() => reminders.reload());
                  onChanged();
                }}
                trackColor={{ true: colors.accent }}
              />
              <Pressable
                onPress={() =>
                  Alert.alert(`Delete "${r.label}"?`, "Its history stays.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        await deleteReminder(r.id).catch(() => {});
                        reminders.reload();
                        onChanged();
                      },
                    },
                  ])
                }
                hitSlop={10}
                accessibilityLabel={`Delete ${r.label}`}
              >
                <Icon name="trash-outline" size={20} color={colors.muted} />
              </Pressable>
            </View>
          ))
        )}
      </Section>

      <Section title="Last 7 days" icon="checkmark-done-outline">
        {!history.data ? (
          <Loading error={history.error} />
        ) : history.data.length === 0 ? (
          <Empty text="No check-ins yet." />
        ) : (
          history.data.slice(0, 30).map((c: CheckInRow) => {
            const d = DOT[c.status] ?? DOT.PENDING;
            return (
              <View key={c.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: d.color }]}>{d.icon && <Icon name={d.icon} size={14} color={colors.white} />}</View>
                <Text style={{ flex: 1, color: colors.ink }}>{c.reminder.label}</Text>
                <Text style={styles.meta}>{new Date(c.scheduledFor).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}</Text>
              </View>
            );
          })
        )}
      </Section>
    </>
  );
}

// --- Conversations ---

function ConversationsTab({ parent, lang, reload }: TabProps) {
  const talks = useLoad(() => fetchConversations(parent.elder.id), [parent.elder.id, reload]);
  if (!talks.data) return <Loading error={talks.error} />;
  if (!talks.data.length) return <Empty text={t(lang, "noTalk")} />;
  return (
    <>
      {talks.data.map((c) => (
        <TalkCard key={c.id} c={c} lang={lang} />
      ))}
    </>
  );
}

// --- Health & home: routine, sensors, camera, mood, check-ins ---

const SENSORS: { kind: string; label: string; unit: string; digits: number; icon: IconName }[] = [
  { kind: "temperature", label: "Temperature", unit: "°C", digits: 1, icon: "thermometer-outline" },
  { kind: "humidity", label: "Humidity", unit: "%", digits: 0, icon: "water-outline" },
  { kind: "air_quality", label: "Air quality", unit: "", digits: 0, icon: "leaf-outline" },
  { kind: "sound_level", label: "Sound level", unit: "", digits: 0, icon: "volume-medium-outline" },
  { kind: "light", label: "Light", unit: "", digits: 0, icon: "sunny-outline" },
];

const REPORT: Record<string, string> = { FEELING: "Feeling", MEAL: "Meal", SLEEP: "Sleep", ACTIVITY: "Activity", SOCIAL: "Social" };
const DAILY_MOOD: Record<string, { label: string; tone: "good" | "neutral" | "warn" }> = {
  great: { label: "Great", tone: "good" },
  okay: { label: "Okay", tone: "neutral" },
  not_great: { label: "Not great", tone: "warn" },
};

function HealthTab({ parent, reload }: TabProps) {
  const id = parent.elder.id;
  const first = parent.elder.name.split(" ")[0];
  const insights = useLoad(() => fetchInsights(id), [id, reload]);
  const env = useLoad(() => fetchEnvironment(id), [id, reload]);
  const details = useLoad(() => fetchParent(id), [id, reload]);
  const reports = useLoad(() => fetchSelfReports(id), [id, reload]);
  const bathroom = useLoad(() => fetchBathroomSensor(id), [id, reload]);

  return (
    <>
      <RoutineSection insights={insights.data} error={insights.error} first={first} />
      <EnvironmentSection env={env.data} error={env.error} />
      <CameraSection cameraUrl={details.data?.cameraUrl ?? null} streamUrl={details.data?.streamUrl ?? null} first={first} />
      {bathroom.data && <BathroomSection sensor={bathroom.data} />}

      <Section title="Mood" icon="happy-outline">
        {!details.data ? (
          <Loading error={details.error} />
        ) : details.data.moodLogs.length === 0 ? (
          <Empty text="No mood check-ins yet." />
        ) : (
          details.data.moodLogs.map((m) => {
            const s = DAILY_MOOD[m.mood] ?? DAILY_MOOD.okay;
            return (
              <View key={m.id} style={[styles.row, { justifyContent: "space-between" }]}>
                <Pill label={s.label} tone={s.tone} />
                <Text style={styles.meta}>{ago(m.createdAt)}</Text>
              </View>
            );
          })
        )}
      </Section>

      <Section title="What they told us" icon="clipboard-outline">
        {!reports.data ? (
          <Loading error={reports.error} />
        ) : reports.data.length === 0 ? (
          <Empty text="No answers this week." />
        ) : (
          reports.data.slice(0, 20).map((r: SelfReportRow) => (
            <View key={r.id} style={{ gap: 2 }}>
              <Text style={styles.itemTitle}>
                {REPORT[r.kind] ?? r.kind}: <Text style={{ fontWeight: "400" }}>{r.answer}</Text>
              </Text>
              {!!r.text && <Text style={styles.meta}>“{r.text}”</Text>}
              <Text style={styles.meta}>{ago(r.createdAt)}</Text>
            </View>
          ))
        )}
      </Section>
    </>
  );
}

function RoutineSection({ insights, error, first }: { insights: Insights | null; error: string | null; first: string }) {
  const max = Math.max(1, ...(insights?.days.map((d) => d.score) ?? [1]));
  return (
    <Section title="Daily routine" icon="pulse-outline">
      {!insights ? (
        <Loading error={error} />
      ) : (
        <>
          {insights.lateStart.late && <Pill label={`${first} hasn't been up and about yet: later than usual`} tone="warn" icon="time-outline" />}
          {insights.today.deviations.length ? (
            insights.today.deviations.map((d) => (
              <View key={d.key} style={{ gap: 2 }}>
                <Text style={styles.itemTitle}>{d.label}</Text>
                <Text style={styles.body}>{d.explanation}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.body}>
              {insights.today.baselineDays < 5 ? `Still learning ${first}'s usual routine.` : `Today looks like a normal day for ${first}.`}
            </Text>
          )}
          <View style={styles.bars} accessibilityLabel="How unusual each day was">
            {insights.days.map((d) => (
              <View key={d.day} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <View style={{ height: 70, justifyContent: "flex-end", width: "100%" }}>
                  <View style={{ height: Math.max(4, (d.score / max) * 70), borderRadius: 4, backgroundColor: d.flagged ? colors.warn : colors.accentSoft }} />
                </View>
                <Text style={styles.barLabel}>{d.day.slice(8)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.meta}>Taller bars are days that were more unusual than normal.</Text>
        </>
      )}
    </Section>
  );
}

const BATHROOM_STATE: Record<BathroomSensor["state"], string> = {
  empty: "Empty",
  occupied: "In use",
  on_floor: "Someone at floor level",
  checking: "Asking “Are you OK?”",
};

// Only rendered once a mmWave bathroom sensor has reported (homes without one see no change).
function BathroomSection({ sensor }: { sensor: BathroomSensor }) {
  const online = Date.now() - new Date(sensor.at).getTime() < 3 * 60_000;
  const room = sensor.room[0].toUpperCase() + sensor.room.slice(1);
  return (
    <Section title={`${room} sensor`} icon="pulse-outline">
      {sensor.radar === "missing" ? (
        <Text style={styles.body}>The sensor board is online, but the radar is not connected.</Text>
      ) : (
        <Text style={[styles.body, sensor.state === "on_floor" && { color: colors.bad, fontWeight: "700" }]}>
          {BATHROOM_STATE[sensor.state]}
        </Text>
      )}
      <Text style={styles.meta}>
        {online ? "Online" : `Offline, last report ${ago(sensor.at)}`} · mmWave radar, no camera or microphone
      </Text>
    </Section>
  );
}

function EnvironmentSection({ env, error }: { env: Environment | null; error: string | null }) {
  return (
    <Section title="At home" icon="home-outline">
      {!env ? (
        <Loading error={error} />
      ) : env.hubs.length === 0 ? (
        <Empty text="No home hub connected." />
      ) : (
        <>
          <View style={styles.wrap}>
            {SENSORS.filter((s) => env.readings[s.kind]).map((s) => (
              <View key={s.kind} style={styles.tile}>
                <Icon name={s.icon} size={18} color={colors.accent} />
                <Text style={styles.tileValue}>
                  {env.readings[s.kind].value.toFixed(s.digits)}
                  <Text style={styles.meta}>{s.unit}</Text>
                </Text>
                <Text style={styles.meta}>{s.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.body}>{env.activeSince ? `Active since ${clock(env.activeSince)}` : "No movement seen today yet."}</Text>
          {env.lastMotionAt && <Text style={styles.meta}>Last movement {ago(env.lastMotionAt)}</Text>}
          {env.hubs.map((h) => (
            <Text key={h.id} style={styles.meta}>
              {h.name}: {h.online ? "online" : `offline${h.lastSeenAt ? `, last seen ${ago(h.lastSeenAt)}` : ""}`}
            </Text>
          ))}
        </>
      )}
    </Section>
  );
}

// The ESP32-CAM serves MJPEG at {cameraUrl}/stream (or the camera AI relays it, streamUrl); React
// Native's Image can't play that, a WebView can.
function CameraSection({ cameraUrl, streamUrl, first }: { cameraUrl: string | null; streamUrl: string | null; first: string }) {
  const [failed, setFailed] = useState(false);
  const url = cameraUrl?.replace(/\/$/, "");
  const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#111;height:100%;display:flex;align-items:center;justify-content:center}img{width:100%;height:100%;object-fit:contain}</style></head><body><img src="${streamUrl ?? `${url}/stream`}" onerror="window.ReactNativeWebView.postMessage('error')"/></body></html>`;
  return (
    <Section title="Live camera" icon="videocam-outline">
      {!url ? (
        <Empty text={`No camera set for ${first}. Add its address in Settings.`} />
      ) : failed ? (
        <View style={{ gap: 8 }}>
          <Empty text={`Can't reach the camera at ${url}. The phone and the camera must be on the same Wi-Fi.`} />
          <SmallButton label="Try again" onPress={() => setFailed(false)} />
        </View>
      ) : (
        <View style={styles.camera}>
          <WebView
            source={{ html, baseUrl: url }}
            originWhitelist={["*"]}
            scrollEnabled={false}
            onMessage={(e) => e.nativeEvent.data === "error" && setFailed(true)}
            mixedContentMode="always"
            style={{ backgroundColor: "#111" }}
          />
        </View>
      )}
    </Section>
  );
}

// --- Family: everyone looking after them, and shared notes ---

function FamilyTab({ parent, reload }: TabProps) {
  const id = parent.elder.id;
  const details = useLoad(() => fetchParent(id), [id, reload]);
  const notes = useLoad(() => fetchNotes(id), [id, reload]);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Section title="Family notes" icon="document-text-outline">
        <Text style={styles.meta}>Shared with the family. Saathi also uses them to answer practical questions, like visits and appointments.</Text>
        <Field label="New note" value={note} onChangeText={setNote} placeholder="e.g. Doctor visit on Friday at 11" multiline />
        <SmallButton
          label="Share note"
          tone="primary"
          disabled={!note.trim() || busy}
          onPress={async () => {
            setBusy(true);
            await addNote(id, note.trim()).catch((e) => Alert.alert("Couldn't share", errorMessage(e, "Please try again.")));
            setBusy(false);
            setNote("");
            notes.reload();
          }}
        />
        {!notes.data ? (
          <Loading error={notes.error} />
        ) : notes.data.length === 0 ? (
          <Empty text="No notes yet." />
        ) : (
          notes.data.map((n: NoteRow) => (
            <View key={n.id} style={styles.note}>
              <Text style={styles.body}>{n.body}</Text>
              <Text style={styles.meta}>
                {n.caregiver.name} · {ago(n.createdAt)}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section title="Who looks after them" icon="people-outline">
        {!details.data ? (
          <Loading error={details.error} />
        ) : (
          details.data.caregivers.map((c) => (
            <View key={c.caregiver.id} style={styles.listRow}>
              <Icon name="person-circle-outline" size={28} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{c.caregiver.name}</Text>
                <Text style={styles.meta}>
                  {c.relation}
                  {c.caregiver.phone ? ` · ${c.caregiver.phone}` : ""}
                </Text>
              </View>
              {c.caregiver.phone && (
                <Pressable onPress={() => Linking.openURL(`tel:${c.caregiver.phone}`)} hitSlop={10} accessibilityLabel={`Call ${c.caregiver.name}`}>
                  <Icon name="call-outline" size={22} color={colors.accent} />
                </Pressable>
              )}
            </View>
          ))
        )}
        <Text style={[styles.label, { marginTop: 6 }]}>Add a sibling or relative (they need a CareCircle account)</Text>
        <Field label="Their email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" />
        <Field label="Relation" value={relation} onChangeText={setRelation} placeholder="e.g. Son" />
        <SmallButton
          label="Add"
          tone="primary"
          disabled={!email.trim() || busy}
          onPress={async () => {
            setBusy(true);
            try {
              await inviteCaregiver(id, email.trim(), relation.trim() || "Family");
              setEmail("");
              setRelation("");
              details.reload();
            } catch (e) {
              Alert.alert("Couldn't add", errorMessage(e, "Please check the email."));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Section>
    </>
  );
}

// --- Settings: profile for Saathi, Help button, pairing, camera, remove ---

function SettingsTab({ parent, reload, onChanged, onRemoved }: TabProps & { onRemoved: () => void }) {
  const id = parent.elder.id;
  const details = useLoad(() => fetchParent(id), [id, reload]);
  const pairing = useLoad(() => fetchPairing(id), [id, reload]);
  const [form, setForm] = useState<Partial<ParentDetails> | null>(null);
  const [saving, setSaving] = useState(false);

  const d = details.data;
  const f = form ?? d;
  if (!d || !f) return <Loading error={details.error} />;

  const set = (patch: Partial<ParentDetails>) => setForm({ ...(form ?? d), ...patch });
  const callable = d.caregivers.filter((c) => c.caregiver.phone);
  const helpId = (form?.helpCaregiverId !== undefined ? form.helpCaregiverId : d.helpCaregiverId) ?? callable[0]?.caregiver.id ?? null;

  async function save() {
    if (!f) return;
    setSaving(true);
    try {
      await updateParent(id, {
        name: f.name?.trim(),
        phone: f.phone?.trim() || null,
        language: f.language,
        timezone: f.timezone,
        profile: f.profile?.trim() || null,
        cameraUrl: f.cameraUrl?.trim() || null,
        helpCaregiverId: helpId,
      });
      setForm(null);
      details.reload();
      onChanged();
      Alert.alert("Saved");
    } catch (e) {
      Alert.alert("Couldn't save", errorMessage(e, "Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Section title="Companion & profile" icon="person-outline">
        <Field label="Name" value={f.name ?? ""} onChangeText={(v) => set({ name: v })} />
        <Field label="Their phone number" value={f.phone ?? ""} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" placeholder="+91 98765 43210" />
        <Text style={styles.label}>Language Saathi speaks</Text>
        <View style={styles.row}>
          {(["en", "hi"] as const).map((l) => (
            <Pressable key={l} onPress={() => set({ language: l })} style={[styles.chip, f.language === l && styles.chipActive]}>
              <Text style={[styles.chipText, f.language === l && { color: colors.accent }]}>{l === "en" ? "English" : "हिन्दी"}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Timezone" value={f.timezone ?? ""} onChangeText={(v) => set({ timezone: v })} autoCapitalize="none" />
        <Field
          label={`About ${d.name.split(" ")[0]} (Saathi uses this)`}
          value={f.profile ?? ""}
          onChangeText={(v) => set({ profile: v })}
          multiline
          placeholder="Interests, family names, routine, things that cheer them up."
        />
        <Field label="Camera address" value={f.cameraUrl ?? ""} onChangeText={(v) => set({ cameraUrl: v })} autoCapitalize="none" keyboardType="url" placeholder="http://192.168.1.50" />
      </Section>

      <Section title="Help button calls" icon="call-outline">
        {callable.length === 0 ? (
          <Empty text="Nobody has added a phone number yet. Add yours on the website's Settings page." />
        ) : (
          <View style={styles.wrap}>
            {callable.map((c) => (
              <Pressable key={c.caregiver.id} onPress={() => set({ helpCaregiverId: c.caregiver.id })} style={[styles.chip, helpId === c.caregiver.id && styles.chipActive]}>
                <Text style={[styles.chipText, helpId === c.caregiver.id && { color: colors.accent }]}>
                  {c.caregiver.name} · {c.caregiver.phone}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Section>

      <SmallButton label={saving ? "Saving…" : "Save settings"} tone="primary" onPress={save} disabled={saving} />

      <Section title="Connect a device" icon="phone-portrait-outline">
        {!pairing.data ? (
          <Loading error={pairing.error} />
        ) : (
          <PairingView
            pairing={pairing.data}
            onNewCode={async () => {
              const code = await newPairingCode(id).catch(() => null);
              if (code) pairing.setData({ ...pairing.data!, pairingCode: code });
            }}
          />
        )}
      </Section>

      <Section title="Remove profile" icon="trash-outline">
        <Text style={styles.meta}>Deletes {d.name}&apos;s reminders, history and messages for everyone. This can&apos;t be undone.</Text>
        <SmallButton
          label={`Remove ${d.name.split(" ")[0]}`}
          tone="danger"
          onPress={() =>
            Alert.alert(`Remove ${d.name}?`, "Everything about them is deleted for the whole family.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Remove",
                style: "destructive",
                onPress: async () => {
                  try {
                    await deleteParent(id);
                    onRemoved();
                  } catch (e) {
                    Alert.alert("Couldn't remove", errorMessage(e, "Please try again."));
                  }
                },
              },
            ])
          }
        />
      </Section>
    </>
  );
}

function PairingView({ pairing, onNewCode }: { pairing: Pairing; onNewCode: () => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.meta}>On their phone, open CareCircle, choose &quot;I&apos;m the parent&quot; and enter:</Text>
      <Text style={styles.code} selectable>
        {pairing.pairingCode.replace(/(\d{3})(\d{3})/, "$1 $2")}
      </Text>
      <SmallButton label="New code" icon="refresh" onPress={onNewCode} />
      {pairing.devices.map((dv) => (
        <View key={dv.id} style={styles.listRow}>
          <Icon name={dv.kind === "HUB" ? "hardware-chip-outline" : "phone-portrait-outline"} size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>{dv.name}</Text>
            <Text style={styles.meta}>{dv.lastSeenAt ? `Last seen ${ago(dv.lastSeenAt)}` : "Not seen yet"}</Text>
          </View>
          <Pill label={dv.online || (dv.lastSeenAt && Date.now() - new Date(dv.lastSeenAt).getTime() < 10 * 60_000) ? "Online" : "Offline"} tone={dv.online ? "good" : "neutral"} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.bg },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.bad, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: "800" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  muted: { fontSize: 15, color: colors.muted },
  meta: { fontSize: 13, color: colors.muted },
  body: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  itemTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  alertTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  callButton: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, borderRadius: radius.md, minHeight: 56 },
  callText: { color: colors.white, fontSize: 17, fontWeight: "800" },
  statusBox: { borderRadius: radius.md, padding: 14, gap: 4 },
  statusLabel: { fontSize: 16, fontWeight: "800" },
  btn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 9 },
  btnText: { fontSize: 14, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  form: { gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  preset: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface },
  presetText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  bars: { flexDirection: "row", gap: 3, marginTop: 6 },
  barLabel: { fontSize: 10, color: colors.muted },
  tile: { minWidth: 96, flexGrow: 1, gap: 2, padding: 10, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  tileValue: { fontSize: 20, fontWeight: "800", color: colors.ink },
  camera: { height: 240, borderRadius: radius.sm, overflow: "hidden", backgroundColor: "#111" },
  note: { gap: 4, padding: 10, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  code: { fontSize: 36, fontWeight: "900", letterSpacing: 4, color: colors.ink, textAlign: "center" },
});
