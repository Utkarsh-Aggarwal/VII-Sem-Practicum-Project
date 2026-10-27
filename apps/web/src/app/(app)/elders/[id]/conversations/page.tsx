import { prisma } from "@/lib/prisma";
import { loadConversations, loadElderPage } from "@/lib/elder-page";
import { llmConfigured, resolveProvider } from "@/lib/ai/llm";
import { ConversationsCard } from "@/components/ConversationsCard";
import { CompanionPanel } from "@/components/CompanionPanel";

export const dynamic = "force-dynamic";

export default async function ConversationsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { elder } = await loadElderPage(id);
  const [conversations, older] = await Promise.all([
    loadConversations(id, 20),
    // Messages from before conversations were grouped (no summary), so nothing is lost.
    prisma.chatMessage.count({ where: { elderId: id, conversationId: null, source: { not: "dashboard" } } }),
  ]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <ConversationsCard conversations={conversations} elderName={elder.name} />
        {older > 0 && <p className="mt-2 px-1 text-xs text-muted">{older} older messages from before summaries were turned on aren&apos;t shown.</p>}
      </div>
      <div className="lg:col-span-2">
        <CompanionPanel elderId={id} elderName={elder.name} llm={llmConfigured() ? resolveProvider()!.name : null} />
      </div>
    </div>
  );
}
