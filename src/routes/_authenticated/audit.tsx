import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, ShieldCheck } from "lucide-react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type AuditRow = { id: string; action: string; entity: string; entity_id: string | null; actor_id: string | null; before_data: unknown; after_data: unknown; created_at: string };
export const Route = createFileRoute("/_authenticated/audit")({ component: AuditPage });

function AuditPage() {
  const schoolId = useSchoolId(); const { isManager } = useAuth();
  const q = useQuery<AuditRow[]>({ queryKey: ["audit-logs", schoolId], enabled: !!schoolId && isManager, queryFn: async () => { const { data, error } = await supabase.from("audit_logs").select("id,action,entity,entity_id,actor_id,before_data,after_data,created_at").eq("school_id", schoolId!).order("created_at", { ascending: false }).limit(100); if (error) throw error; return (data ?? []) as AuditRow[]; } });
  if (!isManager) return <AppShell title="Audit Log"><EmptyState icon={ShieldCheck} title="Manager access only" description="Audit history is restricted to school administrators and principals." /></AppShell>;
  return <AppShell title="Audit Log" description="Trace important changes across your school workspace">{q.isLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin"/></div> : q.isError ? <p className="text-sm text-destructive">Unable to load audit history.</p> : q.data?.length === 0 ? <EmptyState icon={History} title="No audit events yet" description="Important changes will appear here as the platform records them."/> : <Card><CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader><CardContent className="space-y-2">{q.data?.map((row) => <div key={row.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant="secondary">{row.action}</Badge><span className="font-medium">{row.entity}</span>{row.entity_id && <span className="font-mono text-xs text-muted-foreground">{row.entity_id.slice(0, 8)}…</span>}</div><span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span></div>{row.after_data && <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">View change payload</summary><pre className="mt-2 overflow-auto rounded-lg bg-muted p-3">{JSON.stringify(row.after_data, null, 2)}</pre></details>}</div>)}</CardContent></Card>}</AppShell>;
}
