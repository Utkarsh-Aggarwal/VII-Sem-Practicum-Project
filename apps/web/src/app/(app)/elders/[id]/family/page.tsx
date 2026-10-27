import { prisma } from "@/lib/prisma";
import { loadElderPage, plain } from "@/lib/elder-page";
import { NotesThread } from "@/components/NotesThread";
import { CaregiversCard } from "@/components/CaregiversCard";

export const dynamic = "force-dynamic";

export default async function FamilyTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caregiver, elder } = await loadElderPage(id);
  const notes = await prisma.caregiverNote.findMany({
    where: { elderId: id },
    include: { caregiver: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <NotesThread elderId={id} notes={plain(notes)} />
      </div>
      <div className="lg:col-span-2">
        <CaregiversCard elderId={id} links={plain(elder.caregivers)} meId={caregiver.id} />
      </div>
    </div>
  );
}
