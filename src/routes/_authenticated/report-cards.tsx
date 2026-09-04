import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/report-cards")({ component: ReportCards });

function ReportCards() {
  const schoolId = useSchoolId();
  const { isManager } = useAuth();
  const q = useQuery({
    queryKey: ["report-cards", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("report_cards").select("id, student_id, session_id, term_id, average_score, position, status, students(first_name, last_name, student_id), academic_sessions(name), terms(name)").eq("school_id", schoolId!).order("updated_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return <AppShell title="Report Cards" description="Academic report cards and published results">
    {!isManager && <div className="mb-4 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">Report cards are visible to school managers in this workspace. Students and parents receive published results through their portal.</div>}
    {q.isLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin"/></div> : q.isError ? <p className="text-sm text-destructive">Could not load report cards.</p> : q.data?.length === 0 ? <EmptyState icon={FileText} title="No report cards yet" description="Create and publish report cards after assessment results are available."/> : <Card><CardHeader><CardTitle className="text-base">Recent report cards</CardTitle></CardHeader><CardContent className="space-y-2">{q.data?.map((r: any) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">{r.students?.first_name} {r.students?.last_name}</p><p className="text-xs text-muted-foreground">{r.students?.student_id} · {r.academic_sessions?.name} · {r.terms?.name}</p></div><div className="flex items-center gap-3"><div className="text-right"><p className="font-semibold">{r.average_score ?? 0}%</p><p className="text-xs text-muted-foreground">Average</p></div>{typeof r.position === "number" && <Badge variant="secondary">#{r.position}</Badge>}<Badge variant={r.status === "published" ? "default" : "outline"}>{r.status}</Badge></div></div>)}</CardContent></Card>}
  </AppShell>;
}
