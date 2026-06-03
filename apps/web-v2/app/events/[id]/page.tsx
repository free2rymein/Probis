import { EventDetailClient } from "@/components/events/event-detail-client";
import { explorerApi } from "@/lib/api";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialEvent = await explorerApi.event(id).catch(() => null);
  return <EventDetailClient id={id} initialEvent={initialEvent} />;
}
