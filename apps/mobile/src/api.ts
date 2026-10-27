import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { File } from "expo-file-system";

const SERVER_URL_KEY = "carecircle:serverUrl";
const SESSION_KEY = "carecircle:session";

// Point this at the machine running the admin web app, e.g. http://192.168.1.20:3000
export const DEFAULT_SERVER_URL = "http://localhost:3000";

// Who is using this phone: the senior (paired with a 6-digit code from the dashboard)
// or a caregiver (signed in with their dashboard account).
export type Session =
  | { role: "senior"; token: string; elder: Elder }
  | { role: "caregiver"; token: string; caregiver: { id: string; name: string } };

export async function getServerUrl(): Promise<string> {
  return (await AsyncStorage.getItem(SERVER_URL_KEY)) || DEFAULT_SERVER_URL;
}

export async function setServerUrl(url: string) {
  await AsyncStorage.setItem(SERVER_URL_KEY, url.trim().replace(/\/$/, ""));
}

export async function getSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

async function setSession(session: Session) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

async function client() {
  const [baseURL, session] = await Promise.all([getServerUrl(), getSession()]);
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
  });
}

// Pulls the server's { error } message out of axios errors for friendly alerts.
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && !axios.isAxiosError(e) && e.message) return e.message;
  if (axios.isAxiosError(e)) {
    if (e.response?.data?.error) return e.response.data.error;
    if (!e.response) return "Can't reach the server. Check the address and your Wi-Fi.";
  }
  return fallback;
}

export function isUnauthorized(e: unknown) {
  return axios.isAxiosError(e) && e.response?.status === 401;
}

// --- Types ---

export type Elder = { id: string; name: string; avatarColor: string; language?: string; timezone?: string };

export type Reminder = {
  id: string;
  type: string;
  label: string;
  time: string;
  question: string;
  active: boolean;
};

export type CheckIn = {
  id: string;
  status: string;
  scheduledFor: string;
  response: string | null;
};

export type TodayItem = { reminder: Reminder; checkIn: CheckIn };

export type Prompt = {
  kind: string;
  question: string;
  options: { answer: string; emoji: string; label: string }[];
};

export type Mood = "great" | "okay" | "not_great";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

// --- Senior ---

export async function pairWithCode(code: string): Promise<Elder> {
  const api = await client();
  const { data } = await api.post("/api/devices/pair", { code, kind: "APP", name: "Senior's phone" });
  await setSession({ role: "senior", token: data.token, elder: data.elder });
  return data.elder;
}

export async function fetchToday(): Promise<{ elder: Elder; items: TodayItem[]; prompts: Prompt[]; moodToday: Mood | null }> {
  const api = await client();
  const { data } = await api.get("/api/mobile/today");
  return data;
}

export async function respondToCheckIn(checkInId: string, answer: "yes" | "no") {
  const api = await client();
  const { data } = await api.patch(`/api/checkins/${checkInId}`, { answer });
  return data as { checkIn: CheckIn; message?: string };
}

export async function submitMood(mood: Mood) {
  const api = await client();
  const { data } = await api.post("/api/mood", { mood });
  return data as { message: string | null };
}

export async function submitSelfReport(kind: string, answer: string) {
  const api = await client();
  const { data } = await api.post("/api/mobile/self-report", { kind, answer });
  return data as { message: string | null };
}

export async function fetchChat(): Promise<ChatMessage[]> {
  const api = await client();
  const { data } = await api.get("/api/mobile/chat");
  return data.messages;
}

export async function sendChat(text: string) {
  const api = await client();
  const { data } = await api.post("/api/mobile/chat", { text });
  return data as { reply: string; intent: string; alertRaised: boolean };
}

export async function requestHelp() {
  const api = await client();
  const { data } = await api.post("/api/mobile/help", {});
  return data as { message: string };
}

export async function registerSeniorPushToken(pushToken: string | null) {
  const api = await client();
  await api.post("/api/mobile/push-token", { pushToken });
}

// --- Caregiver ---

export async function caregiverLogin(email: string, password: string) {
  const api = await client();
  const { data } = await api.post("/api/auth/login", { email, password });
  await setSession({ role: "caregiver", token: data.token, caregiver: data.caregiver });
  return data.caregiver as { id: string; name: string };
}

export type Alert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  createdAt: string;
};

export type ElderOverview = {
  elder: { id: string; name: string; avatarColor: string; relation: string };
  done: number;
  missed: number;
  pending: number;
  total: number;
  timeline: { id: string; label: string; time: string; type: string; status: string }[];
  openAlerts: Alert[];
  lastMood: { mood: Mood; at: string } | null;
  hub: "online" | "offline" | "none";
};

export async function fetchOverview(): Promise<ElderOverview[]> {
  const api = await client();
  const { data } = await api.get("/api/caregiver/overview");
  return data.elders;
}

export async function acknowledgeAlert(id: string) {
  const api = await client();
  await api.patch(`/api/alerts/${id}`);
}

export async function registerCaregiverPushToken(pushToken: string | null) {
  const api = await client();
  await api.post("/api/caregiver/push-token", { pushToken });
}

// --- Voice (hold-to-talk) ---

export type VoiceReply = {
  transcript: string;
  reply: string;
  audioUrl: string | null; // absolute URL of the spoken reply, or null (fall back to on-device speech)
  alertRaised: boolean;
};

// Uploads a recording; the server transcribes it (ElevenLabs), asks the companion, and speaks the reply.
export async function sendVoice(fileUri: string): Promise<VoiceReply> {
  const [baseURL, session] = await Promise.all([getServerUrl(), getSession()]);
  const form = new FormData();
  // Expo SDK 58's fetch only accepts real Blob-like files in FormData (not RN's old { uri, name, type }
  // objects, which fail with "Unsupported FormDataPart implementation"). expo-file-system's File is one.
  form.append("audio", new File(fileUri));
  const res = await fetch(`${baseURL}/api/mobile/voice`, {
    method: "POST",
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Voice request failed (${res.status})`);
  return { ...data, audioUrl: data.audioUrl ? `${baseURL}${data.audioUrl}` : null };
}

// Leaving the talk screen: lets the server summarise the conversation for the family right away.
export async function endConversation() {
  const api = await client();
  await api.post("/api/mobile/voice/end", {});
}

// --- Spoken reminders & preferences ---

export type DueAnnouncement = {
  key: string; // announce each key once
  checkInId: string;
  kind: "reminder" | "nudge";
  type: string;
  label: string;
  text: string;
  audioUrl: string | null; // absolute URL once resolved below
};

// Reminders due right now, with the sentence (and ElevenLabs audio) to speak.
export async function fetchDue(): Promise<DueAnnouncement[]> {
  const api = await client();
  const baseURL = await getServerUrl();
  const { data } = await api.get("/api/mobile/due");
  return (data.due as DueAnnouncement[]).map((d) => ({ ...d, audioUrl: d.audioUrl ? `${baseURL}${d.audioUrl}` : null }));
}

export async function setLanguagePreference(language: "en" | "hi") {
  const api = await client();
  await api.post("/api/mobile/preferences", { language });
}

// --- Caretaker: conversation summaries ---

export type ConversationSummary = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  usedVoice: boolean;
  summary: string | null;
  mood: "good" | "okay" | "low" | "unwell" | null;
  concerns: string[];
};

export async function fetchConversations(elderId: string): Promise<ConversationSummary[]> {
  const api = await client();
  const { data } = await api.get(`/api/elders/${elderId}/conversations`);
  return data.conversations;
}
