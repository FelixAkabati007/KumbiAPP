"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { Megaphone, Plus, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth-provider";
import { getRoleDisplayName, managementRoles, UserRole } from "@/lib/roles";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const audienceRoles: UserRole[] = ["manager", "restaurantManager", "hotelManager", "finance", "operationsManager", "staff", "kitchen", "frontDesk", "housekeeping"];

export function AnnouncementCard({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { data, mutate } = useSWR<{ announcements: Array<{ id: string; title: string; message: string; priority: string; created_by_name: string; created_by_role: string; created_at: string; is_read: boolean }> }>("/api/announcements", fetcher, { refreshInterval: 30000 });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [audienceType, setAudienceType] = useState("all");
  const [audienceRole, setAudienceRole] = useState("staff");
  const [sending, setSending] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishResult, setPublishResult] = useState("");
  const canPublish = !!user && managementRoles.includes(user.role as UserRole);
  const announcements = data?.announcements ?? [];

  async function publish() {
    if (!title.trim() || !message.trim()) {
      setPublishError("Add a title and message before publishing.");
      return;
    }
    setPublishError("");
    setPublishResult("");
    setSending(true);
    try {
      const response = await fetch("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, message, priority, audienceType, audienceRoles: audienceType === "roles" ? [audienceRole] : [] }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "The announcement could not be published.");
      setTitle(""); setMessage(""); setPublishError(""); setOpen(false);
      setPublishResult(`Published to ${result?.recipientCount ?? 0} active recipient${result?.recipientCount === 1 ? "" : "s"}.`);
      await mutate();
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "The announcement could not be published. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className={embedded ? "border-0 bg-transparent shadow-none" : "border-orange-200 bg-card/90 shadow-sm dark:border-orange-800"}>
      <CardHeader className={embedded ? "flex flex-col gap-3 border-b border-orange-100 px-0 pb-4 dark:border-orange-800 sm:flex-row sm:items-center sm:justify-between" : "flex flex-row items-start justify-between gap-3 pb-3"}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-orange-100 p-2 text-orange-700 dark:bg-orange-950 dark:text-orange-300"><Megaphone className="size-5" aria-hidden="true" /></div>
          <div><CardTitle className="text-base">{embedded ? "Announcement workspace" : "Announcement"}</CardTitle><CardDescription>{embedded ? "Publish, review, and manage updates for your operational teams." : "Publish important updates for your operational teams."}</CardDescription></div>
        </div>
        {canPublish && <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) setPublishError(""); }}><DialogTrigger asChild><Button size="sm" className="shrink-0"><Plus data-icon="inline-start" />Post</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Publish announcement</DialogTitle><DialogDescription>Send a clear update to eligible staff below your role in the hierarchy. Management recipients can be included when selected.</DialogDescription><p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{audienceType === "all" ? "All active staff, including your own management team, will be notified." : `Only active ${getRoleDisplayName(audienceRole)} staff will be notified.`}</p>{publishError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{publishError}</p>}</DialogHeader><div className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label htmlFor="announcement-title">Title</Label><Input id="announcement-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend service briefing" maxLength={160} /></div><div className="flex flex-col gap-2"><Label htmlFor="announcement-message">Message</Label><Textarea id="announcement-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write the announcement for your team..." rows={5} maxLength={5000} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="important">Important</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="flex flex-col gap-2"><Label>Audience</Label><Select value={audienceType} onValueChange={setAudienceType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All staff</SelectItem><SelectItem value="roles">One role</SelectItem></SelectContent></Select></div></div>{audienceType === "roles" && <div className="flex flex-col gap-2"><Label>Role</Label><Select value={audienceRole} onValueChange={setAudienceRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{audienceRoles.filter((role) => (role === user?.role || role === "staff" || role === "kitchen" || role === "frontDesk" || role === "housekeeping" || user?.role === "admin")).map((role) => <SelectItem key={role} value={role}>{getRoleDisplayName(role)}</SelectItem>)}</SelectContent></Select></div>}</div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void publish()} disabled={sending || !title.trim() || !message.trim()}><Send data-icon="inline-start" />{sending ? "Publishing…" : "Publish announcement"}</Button></DialogFooter></DialogContent></Dialog>}
      </CardHeader>
      {publishResult && <p role="status" className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{publishResult}</p>}<CardContent className={embedded ? "flex flex-col gap-3 px-0 pt-4" : "flex flex-col gap-3 pt-0"}>
        {announcements.length === 0 ? <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><ShieldAlert className="size-4" />No active announcements.</div> : announcements.slice(0, embedded ? 3 : 1).map((item) => <article key={item.id} className="rounded-xl border bg-background/70 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3>{item.priority !== "normal" && <Badge variant={item.priority === "urgent" ? "destructive" : "secondary"}>{item.priority}</Badge>}</div><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.message}</p></div>{!item.is_read && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread announcement" />}</div><div className="mt-2 text-xs text-muted-foreground">{item.created_by_name} · {getRoleDisplayName(item.created_by_role)} · {new Date(item.created_at).toLocaleString()}</div></article>)}
        {!embedded && <Link href="/announcements" className="inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">Open announcements</Link>}
      </CardContent>
    </Card>
  );
}
