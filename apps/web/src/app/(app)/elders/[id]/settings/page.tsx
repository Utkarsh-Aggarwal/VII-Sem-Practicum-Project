import { prisma } from "@/lib/prisma";
import { loadElderPage, plain } from "@/lib/elder-page";
import { uniquePairingCode } from "@/lib/pairing";
import { ProfileSettings } from "@/components/ProfileSettings";
import { DevicesCard } from "@/components/DevicesCard";
import { DangerZone } from "@/components/DangerZone";

export const dynamic = "force-dynamic";

export default async function SettingsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let { elder } = await loadElderPage(id);
  if (!elder.pairingCode) {
    elder = { ...elder, ...(await prisma.elder.update({ where: { id }, data: { pairingCode: await uniquePairingCode() } })) };
  }
  const devices = await prisma.device.findMany({ where: { elderId: id }, orderBy: { createdAt: "asc" } });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <ProfileSettings elder={plain(elder)} />
        <DangerZone elderId={id} elderName={elder.name} />
      </div>
      <div className="lg:col-span-2">
        <DevicesCard
          elderId={id}
          elderName={elder.name}
          pairingCode={elder.pairingCode}
          devices={plain(devices.map(({ tokenHash: _t, pushToken, ...d }) => (void _t, { ...d, pushEnabled: !!pushToken })))}
        />
      </div>
    </div>
  );
}
