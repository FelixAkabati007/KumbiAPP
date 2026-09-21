import EventDetailWorkspace from "@/components/events/event-detail-workspace";

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventDetailWorkspace eventId={eventId} />;
}
