import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Bot, Loader2, TrendingUp } from "lucide-react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/insights")({ component: InsightsPage });

type Row = { score: number | null; assessment_id: string; assessments: { subject_id: string; subjects: { name: string } | null } | null };
type Insight = { subject: string; average: number; count: number };

function InsightsPage() {
  const schoolId = useSchoolId();
  const { user, primaryRole } = useAuth();
  const query = useQuery<Insight[]>({
    queryKey: ["academic-insights", schoolId, user?.id, primaryRole],
    enabled: !!schoolId && !!user,
    queryFn: async () => {
      let studentId: string | null = null;
      if (primaryRole === "student") {
        const { data, error } = await supabase.from("students").select("id").eq("school_id", schoolId!).eq("user_id", user!.id).maybeSingle();
        if (error) throw error;
        studentId = data?.id ?? null;
      }
      const assessments = supabase.from("assessment_scores").select("score,assessment_id,assessments(subject_id,subjects(name))").eq("school_id", schoolId!);
      if (studentId) assessments.eq("student_id", studentId);
      const { data, error } = await assessments;
      if (error) throw error;
      const buckets = new Map<string, { sum: number; count: number }>();
      for (const row of (data ?? []) as unknown as Row[]) {
        const name = row.assessments?.subjects?.name ?? "Unassigned subject";
        const bucket = buckets.get(name) ?? { sum: 0, count: 0 };
        bucket.sum += Number(row.score ?? 0);
        bucket.count += 1;
        buckets.set(name, bucket);
      }
      return [...buckets.entries()].map(([subject, value]) => ({ subject, average: value.count ? value.sum / value.count : 0, count: value.count })).sort((a, b) => a.average - b.average);
    },
  });

  if (!schoolId) return <AppShell title="Academic Insights"><EmptyState icon={BarChart3} title="School setup required" description="Complete onboarding first." /></AppShell>;
  if (query.isLoading) return <AppShell title="Academic Insights"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div></AppShell>;
  if (query.isError) return <AppShell title="Academic Insights"><p className="text-sm text-destructive">Unable to calculate academic insights.</p></AppShell>;
  const insights = query.data ?? [];
  const weak = insights.filter((item) => item.average < 50);
  return <AppShell title="Academic Insights" description="Use real assessment data to find strengths and topics that need more practice.">
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardContent className="p-5"><TrendingUp className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Subjects tracked</p><p className="text-2xl font-bold">{insights.length}</p></CardContent></Card>
      <Card><CardContent className="p-5"><AlertTriangle className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Needs attention</p><p className="text-2xl font-bold">{weak.length}</p></CardContent></Card>
      <Card><CardContent className="p-5"><Bot className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">AI support</p><p className="text-sm font-medium">Use EduFlow AI to practise weak areas.</p></CardContent></Card>
    </div>
    <Card className="mt-6"><CardHeader><CardTitle className="text-base">Performance by subject</CardTitle></CardHeader><CardContent className="space-y-3">{insights.length === 0 ? <EmptyState icon={BarChart3} title="Not enough assessment data" description="Record assessment scores to generate insights." /> : insights.map((item) => <div key={item.subject} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{item.subject}</p><p className="text-xs text-muted-foreground">{item.count} recorded score{item.count === 1 ? "" : "s"}</p></div><Badge variant={item.average < 50 ? "destructive" : item.average < 70 ? "secondary" : "default"}>{item.average.toFixed(1)}%</Badge></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, item.average))}%` }} /></div></div>)}</CardContent></Card>
  </AppShell>;
}
