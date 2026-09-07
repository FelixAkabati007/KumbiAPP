import { AnnouncementCard } from "@/components/announcement-card";

export default function AnnouncementsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-primary">Operations communication</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Announcements</h1>
          <p className="max-w-2xl text-pretty leading-6 text-muted-foreground">
            Review updates from management and publish clear notices for eligible operational teams.
          </p>
        </header>
        <AnnouncementCard embedded />
      </div>
    </main>
  );
}
