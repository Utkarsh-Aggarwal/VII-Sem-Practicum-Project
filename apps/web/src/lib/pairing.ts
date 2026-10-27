import { prisma } from "@/lib/prisma";
import { newPairingCode } from "@/lib/auth";

// Unique 6-digit pairing code (retries on the rare collision).
export async function uniquePairingCode() {
  for (;;) {
    const code = newPairingCode();
    if (!(await prisma.elder.findUnique({ where: { pairingCode: code } }))) return code;
  }
}
