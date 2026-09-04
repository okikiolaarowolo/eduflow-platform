import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, Bot, ClipboardCheck, FileText, Loader2, Users } from "lucide-react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

type Metric = { label: string; value: string; detail: string; icon: typeof Users };

function AnalyticsPage() {
  const schoolId = useSchoolId();
  const query = useQuery({
    queryKey: ["school-analytics", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [students, teachers, classes, assessments, scores, attendance, assignments, submissions, aiUsage] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId!).eq("is_archived", false),
        supabase.from("assessments").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("assessment_scores").select("score, assessment_id").eq("school_id", schoolId!),
        supabase.from("attendance_records").select("status").eq("school_id", schoolId!),
        supabase.from("assignments").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("ai_usage").select("input_tokens, output_tokens, estimated_cost").eq("school_id", schoolId!),
      ]);
      const errors = [students, teachers, classes, assessments, scores, attendance, assignments, submissions, aiUsage].filter((r) => r.error);
      if (errors.length) throw errors[0].error;
      const scoreRows = scores.data ?? [];
      const average = scoreRows.length ? scoreRows.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / scoreRows.length : 0;
      const attendanceRows = attendance.data ?? [];
      const attendanceRate = attendanceRows.length ? attendanceRows.filter((row) => row.status === "present" || row.status === "late").length / attendanceRows.length * 100 : 0;
      const aiTokens = (aiUsage.data ?? []).reduce((sum, row) => sum + Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0), 0);
      const aiCost = (aiUsage.data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0);
      const assignmentCount = assignments.count ?? 0;
      const submissionCount = submissions.count ?? 0;
      return { students: students.count ?? 0, teachers: teachers.count ?? 0, classes: classes.count ?? 0, assessments: assessments.count ?? 0, average, attendanceRate, assignmentCount, submissionCount, aiTokens, aiCost };
    },
  });

  if (!schoolId) return <AppShell title="Analytics"><EmptyState icon={BarChart3} title="School setup required" description="Complete school onboarding before viewing analytics." /></AppShell>;
  if (query.isLoading) return <AppShell title="Analytics" description="School-wide performance and operations"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div></AppShell>;
  if (query.isError || !query.data) return <AppShell title="Analytics"><p className="text-sm text-destructive">Unable to load school analytics.</p></AppShell>;

  const d = query.data;
  const metrics: Metric[] = [
    { label: "Students", value: d.students.toLocaleString(), detail: "Active school records", icon: Users },
    { label: "Teachers", value: d.teachers.toLocaleString(), detail: "Teacher records", icon: Users },
    { label: "Classes", value: d.classes.toLocaleString(), detail: "Non-archived classes", icon: Activity },
    { label: "Assessments", value: d.assessments.toLocaleString(), detail: "Created assessments", icon: FileText },
    { label: "Average score", value: `${d.average.toFixed(1)}%`, detail: "Across recorded scores", icon: BarChart3 },
    { label: "Attendance", value: `${d.attendanceRate.toFixed(1)}%`, detail: "Present or late", icon: ClipboardCheck },
    { label: "Assignments", value: d.assignmentCount.toLocaleString(), detail: `${d.submissionCount} submissions`, icon: FileText },
    { label: "AI tokens", value: d.aiTokens.toLocaleString(), detail: `Est. cost ${d.aiCost.toFixed(4)}`, icon: Bot },
  ];

  return <AppShell title="Analytics" description="School-wide performance, attendance, learning and AI usage">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map((metric) => { const Icon = metric.icon; return <Card key={metric.label}><CardContent className="p-5"><Icon className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">{metric.label}</p><p className="font-display text-2xl font-bold">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p></CardContent></Card>; })}</div>
    <Card className="mt-6"><CardHeader><CardTitle className="text-base">How to use these numbers</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3"><p><strong className="text-foreground">Academic:</strong> Use average score and assessment volume to identify subjects or classes that need attention.</p><p><strong className="text-foreground">Operations:</strong> Use attendance and assignment submissions to spot participation changes early.</p><p><strong className="text-foreground">AI:</strong> Monitor token usage and estimated cost before increasing school AI limits.</p></CardContent></Card>
  </AppShell>;
}
