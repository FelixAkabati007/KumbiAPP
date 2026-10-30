import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AnnouncementCard } from "@/components/announcement-card";
import { Button } from "@/components/ui/button";
import { LogoDisplay } from "@/components/logo-display";

export default function AnnouncementsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-white/80 px-3 py-3 backdrop-blur-md dark:border-orange-700 dark:bg-gray-900/80 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button asChild variant="outline" size="sm" className="rounded-xl border-orange-200 bg-white/80 dark:border-orange-700 dark:bg-gray-800/80">
            <Link href="/">
              <ArrowLeft data-icon="inline-start" />
              Back to Dashboard
            </Link>
          </Button>
          <LogoDisplay size="sm" />
          <span className="text-base font-semibold text-gray-800 dark:text-gray-200 sm:text-lg">Announcements</span>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-primary">Management announcements</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Announcements</h1>
          <p className="max-w-2xl text-pretty leading-6 text-muted-foreground">
            Read official updates from management or publish clear broadcast notices for eligible teams. Use Technical Operations for maintenance tickets and issue resolution.
          </p>
        </div>
        <AnnouncementCard variant="page" />
      </div>
    </main>
  );
}
