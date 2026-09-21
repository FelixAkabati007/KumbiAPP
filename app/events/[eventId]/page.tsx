import EventDetailWorkspace from "@/components/events/event-detail-workspace";

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ print?: string }> }) {
  const { eventId } = await params;
  const { print } = await searchParams;
  return <EventDetailWorkspace eventId={eventId} autoPrint={print === "mock"} />;
}
