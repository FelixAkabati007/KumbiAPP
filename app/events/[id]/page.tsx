import EventDetailWorkspace from "@/components/events/event-detail-workspace";

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const { print } = await searchParams;
  return <EventDetailWorkspace eventId={id} autoPrint={print === "mock"} />;
}
