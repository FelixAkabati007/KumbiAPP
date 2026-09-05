"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Plus, Users, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleGuard } from "@/components/role-guard";

const overviewCards = [
  { label: "Upcoming events", value: "0", icon: CalendarDays },
  { label: "Active planning", value: "0", icon: ClipboardList },
  { label: "Assigned staff", value: "0", icon: Users },
  { label: "Confirmed menus", value: "0", icon: Utensils },
];

function EventsWorkspace() {
  return (
    <main className="min-h-screen bg-background p-3 pt-5 sm:p-4 md:p-8 md:pt-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-primary">Operations workspace</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Event Organization</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Coordinate event planning, venues, menus, timelines, and assigned teams from one operational view.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="min-h-10 rounded-2xl">
              <Link href="/"><ArrowLeft data-icon="inline-start" />Back to Dashboard</Link>
            </Button>
            <Button className="min-h-10 rounded-2xl" disabled>
              <Plus data-icon="inline-start" />Create event
            </Button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Event organization summary">
          {overviewCards.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="rounded-3xl border-border bg-card shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
                </div>
                <Icon className="size-5 text-primary" aria-hidden="true" />
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card className="rounded-3xl border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border">
              <div><CardTitle>Upcoming events</CardTitle><p className="mt-1 text-sm text-muted-foreground">Your event calendar will appear here.</p></div>
              <Badge variant="outline">Planning</Badge>
            </CardHeader>
            <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-2xl bg-muted p-3"><CalendarDays className="size-6 text-primary" aria-hidden="true" /></div>
              <div><h2 className="font-semibold text-foreground">No events scheduled</h2><p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Create an event to start coordinating dates, venues, guests, menus, and staff assignments.</p></div>
              <Button variant="outline" className="rounded-2xl" disabled><Plus data-icon="inline-start" />Create first event</Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border bg-card shadow-sm">
            <CardHeader><CardTitle>Event readiness</CardTitle><p className="text-sm text-muted-foreground">Operational checks for each event.</p></CardHeader>
            <CardContent className="space-y-3">
              {["Venue confirmed", "Menu approved", "Team assigned", "Timeline published"].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl border border-border p-3 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />{item}<Badge className="ml-auto" variant="secondary">Pending</Badge></div>)}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

export default function EventsPage() {
  return <RoleGuard section="events"><EventsWorkspace /></RoleGuard>;
}
