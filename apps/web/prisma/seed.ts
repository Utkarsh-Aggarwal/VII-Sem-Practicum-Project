import { Prisma, PrismaClient } from "@prisma/client";
import { hashDeviceToken, hashPassword } from "../src/lib/auth-crypto";
import { reminderInstant, zonedTimeToUtc, zonedParts } from "../src/lib/time";

const prisma = new PrismaClient();

// Deterministic pseudo-random so every seed produces the same demo.
let rngState = 42;
function rand() {
  rngState = (rngState * 1664525 + 1013904223) % 2 ** 32;
  return rngState / 2 ** 32;
}
const jitter = (spread: number) => (rand() - 0.5) * 2 * spread;

const DEMO_PASSWORD = "carecircle123";
const DEMO_HUB_TOKEN = "ccd_demo-hub-token-for-local-testing-only";
const DAYS = 21;

async function main() {
  await prisma.alert.deleteMany();
  await prisma.caregiverNote.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.sensorReading.deleteMany();
  await prisma.selfReport.deleteMany();
  await prisma.device.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.moodLog.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.caregiverLink.deleteMany();
  await prisma.elder.deleteMany();
  await prisma.caregiver.deleteMany();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const caregiver = await prisma.caregiver.create({
    data: { name: "Anita Shah", email: "mann42006@gmail.com", passwordHash },
  });
  const sibling = await prisma.caregiver.create({
    data: { name: "Rohan Shah", email: "rohan@example.com", passwordHash },
  });

  const tz = "Asia/Kolkata";
  const elder = await prisma.elder.create({
    data: {
      name: "Rameshbhai Shah",
      phone: "+91-9800000000",
      avatarColor: "#5B8DEF",
      timezone: tz,
      language: "en",
      pairingCode: "123456",
      profile:
        "Retired school teacher, 74. Loves old Hindi film songs, cricket and reading the newspaper. " +
        "Walks in the society garden every morning. Grandson Aarav (6) visits on Sundays. Has high blood pressure.",
      caregivers: {
        create: [
          { caregiverId: caregiver.id, relation: "Daughter" },
          { caregiverId: sibling.id, relation: "Son" },
        ],
      },
    },
  });

  const elder2 = await prisma.elder.create({
    data: {
      name: "Kamlaben Shah",
      phone: "+91-9800000001",
      avatarColor: "#E4864E",
      timezone: tz,
      language: "hi",
      pairingCode: "654321",
      profile: "Loves bhajans and cooking. Diabetic. Talks to her sister in Surat every evening.",
      caregivers: { create: { caregiverId: caregiver.id, relation: "Mother-in-law" } },
    },
  });

  const [bp, lunch, bed, diabetes] = await Promise.all([
    prisma.reminder.create({
      data: { elderId: elder.id, type: "MEDICINE", label: "Blood Pressure Tablet", time: "08:00", question: "Did you take your Blood Pressure medicine?" },
    }),
    prisma.reminder.create({
      data: { elderId: elder.id, type: "MEAL", label: "Lunch", time: "13:00", question: "Have you had your lunch?" },
    }),
    prisma.reminder.create({
      data: { elderId: elder.id, type: "SLEEP", label: "Bedtime", time: "22:00", question: "Are you getting ready for bed?" },
    }),
    prisma.reminder.create({
      data: { elderId: elder2.id, type: "MEDICINE", label: "Diabetes Tablet", time: "09:00", question: "क्या आपने डायबिटीज़ की दवा ले ली?" },
    }),
  ]);

  const hub = await prisma.device.create({
    data: {
      elderId: elder.id,
      kind: "HUB",
      name: "Living room hub",
      tokenHash: hashDeviceToken(DEMO_HUB_TOKEN),
      online: true,
      lastSeenAt: new Date(),
    },
  });

  const now = new Date();
  const nowParts = zonedParts(now, tz);
  const nowMin = nowParts.hour * 60 + nowParts.minute;
  const at = (dayOffset: number, minutes: number) => {
    const d = new Date(now.getTime() - dayOffset * 24 * 3600_000);
    const p = zonedParts(d, tz);
    return zonedTimeToUtc(p.year, p.month, p.day, Math.floor(minutes / 60), Math.round(minutes % 60), tz);
  };

  const readings: { elderId: string; deviceId: string; kind: string; value: number; createdAt: Date }[] = [];
  const checkIns: Prisma.CheckInCreateManyInput[] = [];
  const moods: { elderId: string; mood: string; createdAt: Date }[] = [];
  const reports: { elderId: string; kind: string; answer: string; score: number; source: string; createdAt: Date }[] = [];

  for (let i = DAYS; i >= 0; i--) {
    const isToday = i === 0;
    // Ramesh usually starts the day ~06:45. Today he's unusually late (10:30) — the routine
    // detector should flag it. That's the demo storyline.
    const wake = isToday ? 10 * 60 + 30 : 6 * 60 + 45 + jitter(20);
    const sleep = 22 * 60 + 15 + jitter(15);
    const endMin = isToday ? nowMin : 24 * 60 - 1;

    // Hub telemetry every 15 minutes: motion count, temperature, humidity, sound level.
    for (let m = 0; m < endMin; m += 15) {
      const awake = m >= wake && m <= sleep;
      const motion = awake ? Math.max(0, Math.round(3 + jitter(3) + (m < wake + 90 ? 2 : 0))) : 0;
      const createdAt = at(i, m);
      readings.push({ elderId: elder.id, deviceId: hub.id, kind: "motion", value: motion, createdAt });
      if (m % 60 === 0) {
        const hour = m / 60;
        readings.push(
          { elderId: elder.id, deviceId: hub.id, kind: "temperature", value: 26 + 4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + jitter(0.6), createdAt },
          { elderId: elder.id, deviceId: hub.id, kind: "humidity", value: 55 + jitter(6), createdAt },
          { elderId: elder.id, deviceId: hub.id, kind: "sound_level", value: awake ? 42 + jitter(8) : 28 + jitter(3), createdAt }
        );
      }
    }

    // Reminder history for both elders.
    for (const r of [bp, lunch, bed, diabetes]) {
      const scheduledFor = reminderInstant(r.time, at(i, 12 * 60), tz);
      const [hh, mm] = r.time.split(":").map(Number);
      const due = hh * 60 + mm;
      if (isToday) {
        // Today: Ramesh only took his BP tablet when he got up (late). Later slots are left for the scheduler.
        if (r.id === bp.id && nowMin > wake + 5) {
          checkIns.push({ elderId: r.elderId, reminderId: r.id, scheduledFor, status: "DONE_LATE", response: "yes", respondedAt: at(0, wake + 5), channel: "hub", notifiedAt: scheduledFor });
        }
        continue;
      }
      const roll = rand();
      const status = roll < 0.8 ? "DONE_ON_TIME" : roll < 0.92 ? "DONE_LATE" : "MISSED";
      const respondedAt = status === "MISSED" ? null : at(i, due + (status === "DONE_ON_TIME" ? 3 + rand() * 15 : 40 + rand() * 30));
      checkIns.push({
        elderId: r.elderId,
        reminderId: r.id,
        scheduledFor,
        status,
        response: status === "MISSED" ? null : "yes",
        respondedAt,
        channel: rand() < 0.5 ? "app" : "hub",
        notifiedAt: scheduledFor,
      });
    }

    if (!isToday) {
      const moodRoll = rand();
      moods.push({ elderId: elder.id, mood: moodRoll < 0.6 ? "great" : moodRoll < 0.9 ? "okay" : "not_great", createdAt: at(i, wake + 60) });
      moods.push({ elderId: elder2.id, mood: rand() < 0.7 ? "okay" : "great", createdAt: at(i, 10 * 60 + jitter(30)) });
      const sleepAnswer = rand() < 0.75 ? "good" : "okay";
      reports.push({ elderId: elder.id, kind: "SLEEP", answer: sleepAnswer, score: sleepAnswer === "good" ? 0.7 : 0.2, source: "app", createdAt: at(i, wake + 30) });
      reports.push({ elderId: elder.id, kind: "ACTIVITY", answer: "yes", score: 0.6, source: rand() < 0.5 ? "app" : "chat", createdAt: at(i, wake + 120) });
    }
  }

  await prisma.sensorReading.createMany({ data: readings });
  await prisma.checkIn.createMany({ data: checkIns });
  await prisma.moodLog.createMany({ data: moods });
  await prisma.selfReport.createMany({ data: reports });

  await prisma.chatMessage.createMany({
    data: [
      { elderId: elder.id, role: "user", content: "Good morning! I went for my walk in the garden.", source: "hub", intent: "CHAT", createdAt: at(1, 8 * 60) },
      { elderId: elder.id, role: "assistant", content: "Good morning, Rameshbhai! A garden walk is a lovely start to the day — well done.", source: "hub", createdAt: at(1, 8 * 60) },
      { elderId: elder.id, role: "user", content: "Aarav is coming on Sunday", source: "app", intent: "CHAT", createdAt: at(1, 17 * 60) },
      { elderId: elder.id, role: "assistant", content: "How wonderful! Maybe you can teach him a little cricket. Something lovely to look forward to.", source: "app", createdAt: at(1, 17 * 60) },
    ],
  });

  await prisma.caregiverNote.create({
    data: { elderId: elder.id, caregiverId: sibling.id, body: "Called Papa yesterday evening — BP reading was 132/84, he sounded cheerful.", createdAt: at(1, 19 * 60) },
  });

  console.log("Seeded demo family:");
  console.log(`  Caregiver login: ${caregiver.email} / ${DEMO_PASSWORD}  (sibling: ${sibling.email}, same password)`);
  console.log(`  Senior app pairing codes: ${elder.name} = 123456, ${elder2.name} = 654321`);
  console.log(`  Demo hub token for ${elder.name}: ${DEMO_HUB_TOKEN}`);
  console.log(`  ${readings.length} sensor readings, ${checkIns.length} check-ins over ${DAYS} days`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
