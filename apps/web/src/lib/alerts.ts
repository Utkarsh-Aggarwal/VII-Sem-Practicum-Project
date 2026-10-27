import type { Alert } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitCareEvent } from "@/lib/events";
import { sendPush } from "@/lib/push";

export type AlertKind =
  | "MISSED_REMINDER"
  | "ROUTINE_ANOMALY"
  | "NO_ACTIVITY"
  | "LOW_MOOD"
  | "HEALTH_CONCERN"
  | "HELP_REQUEST"
  | "DISTRESS"
  | "HUB_OFFLINE";

export type NewAlert = {
  elderId: string;
  kind: AlertKind;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  data?: unknown;
  dedupeKey?: string;
};

// Creates the alert (once per dedupeKey), streams it to open dashboards and pushes it to
// caregivers' phones for anything above "info".
export async function raiseAlert(input: NewAlert): Promise<Alert | null> {
  if (input.dedupeKey) {
    const existing = await prisma.alert.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing) return null;
  }

  let alert: Alert;
  try {
    alert = await prisma.alert.create({
      data: {
        elderId: input.elderId,
        kind: input.kind,
        severity: input.severity,
        title: input.title,
        message: input.message,
        data: input.data === undefined ? null : JSON.stringify(input.data),
        dedupeKey: input.dedupeKey ?? null,
      },
    });
  } catch (err) {
    // Unique violation: a concurrent tick raised the same alert first.
    if (typeof err === "object" && err && "code" in err && err.code === "P2002") return null;
    throw err;
  }

  emitCareEvent({ elderId: alert.elderId, type: "alert.created", payload: alert });

  if (alert.severity !== "info") {
    const links = await prisma.caregiverLink.findMany({
      where: { elderId: alert.elderId },
      include: { caregiver: true, elder: true },
    });
    await sendPush(
      links
        .filter((l) => l.caregiver.pushToken)
        .map((l) => ({
          to: l.caregiver.pushToken!,
          title: `${l.elder.name.split(" ")[0]}: ${alert.title}`,
          body: alert.message,
          data: { alertId: alert.id, elderId: alert.elderId },
          channelId: "alerts",
        }))
    );
  }

  return alert;
}

// For alerts that should collect several events instead of firing once: while today's alert is still
// open, new events are added to it (and it moves back to the top); once a caregiver has handled it,
// the next event raises a fresh alert.
export async function raiseOrMergeAlert(
  input: NewAlert & { dedupeKey: string },
  merge: (existing: Alert) => { message: string; data?: unknown }
): Promise<Alert | null> {
  const open = await prisma.alert.findFirst({
    where: { elderId: input.elderId, dedupeKey: { startsWith: input.dedupeKey }, acknowledgedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!open) {
    const taken = await prisma.alert.findUnique({ where: { dedupeKey: input.dedupeKey } });
    return raiseAlert(taken ? { ...input, dedupeKey: `${input.dedupeKey}:${Date.now()}` } : input);
  }
  const next = merge(open);
  const updated = await prisma.alert.update({
    where: { id: open.id },
    data: {
      message: next.message,
      ...(next.data !== undefined ? { data: JSON.stringify(next.data) } : {}),
      createdAt: new Date(),
    },
  });
  emitCareEvent({ elderId: updated.elderId, type: "alert.updated", payload: updated });
  return updated;
}
