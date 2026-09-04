import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: () => api.notifications(user!.id),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unread = (query.data ?? []).filter((n) => !n.read_at).length;

  return (
    <AppShell title="Notifications" description="Stay up to date with your school workspace">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base"><Bell className="size-4" /> Notifications {unread > 0 && <Badge>{unread} new</Badge>}</CardTitle>
          <Button variant="outline" size="sm" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}><Check className="size-4" /> Mark all read</Button>
        </CardHeader>
        <CardContent>
          {query.isLoading ? <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin" /></div> : query.isError ? <p className="text-sm text-destructive">Could not load notifications.</p> : (query.data ?? []).length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">You are all caught up.</div> : <div className="space-y-2">{query.data!.map((n) => <div key={n.id} className={`rounded-xl border p-4 ${n.read_at ? "" : "bg-muted/40"}`}><div className="flex items-start justify-between gap-4"><div><p className="font-medium">{n.title}</p><p className="mt-1 text-sm text-muted-foreground">{n.body}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p></div>{!n.read_at && <Button size="sm" variant="ghost" disabled={markRead.isPending} onClick={() => markRead.mutate(n.id)}>Read</Button>}</div></div>)}</div>}
        </CardContent>
      </Card>
    </AppShell>
  );
}
