import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, BookOpen, ClipboardCheck, FileText, GraduationCap, Loader2, Users } from "lucide-react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/principal-dashboard")({ component: PrincipalDashboard });

type Summary = { students: number; teachers: number; classes: number; attendance: number; average: number; assessments: number; assignments: number; submissions: number };

function PrincipalDashboard() {
  const schoolId = useSchoolId();
  const q = useQuery({
    queryKey: ["principal-dashboard", schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<Summary> => {
      const [students, teachers, classes, attendance, scores, assessments, assignments, submissions] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId!).eq("is_archived", false),
        supabase.from("attendance_records").select("status").eq("school_id", schoolId!),
        supabase.from("assessment_scores").select("score").eq("school_id", schoolId!),
        supabase.from("assessments").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("assignments").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
      ]);
      const responses = [students, teachers, classes, attendance, scores, assessments, assignments, submissions];
      const error = responses.find((r) => r.error)?.error;
      if (error) throw error;
      const attendanceRows = attendance.data ?? [];
      const scoreRows = scores.data ?? [];
      return {
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        classes: classes.count ?? 0,
        attendance: attendanceRows.length ? attendanceRows.filter((r) => r.status === "present" || r.status === "late").length / attendanceRows.length * 100 : 0,
        average: scoreRows.length ? scoreRows.reduce((sum, r) => sum + Number(r.score ?? 0), 0) / scoreRows.length : 0,
        assessments: assessments.count ?? 0,
        assignments: assignments.count ?? 0,
        submissions: submissions.count ?? 0,
      };
    },
  });

  if (!schoolId) return <AppShell title="Principal Dashboard"><EmptyState icon={GraduationCap} title="School setup required" description="Complete school onboarding before opening the principal dashboard." /></AppShell>;
  if (q.isLoading) return <AppShell title="Principal Dashboard"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div></AppShell>;
  if (q.isError || !q.data) return <AppShell title="Principal Dashboard"><p className="text-sm text-destructive">Unable to load the principal dashboard.</p></AppShell>;

  const d = q.data;
  const metrics = [
    ["Students", d.students.toLocaleString(), Users], ["Teachers", d.teachers.toLocaleString(), GraduationCap], ["Classes", d.classes.toLocaleString(), BookOpen],
    ["Attendance", `${d.attendance.toFixed(1)}%`, ClipboardCheck], ["Average score", `${d.average.toFixed(1)}%`, BarChart3], ["Assessments", d.assessments.toLocaleString(), FileText],
    ["Assignments", d.assignments.toLocaleString(), FileText], ["Submissions", d.submissions.toLocaleString(), Activity],
  ] as const;

  return <AppShell title="Principal Dashboard" description="A school-wide view of academics, attendance and learning activity">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-5"><Icon className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl font-bold">{value}</p></CardContent></Card>)}
    </div>
    <Card className="mt-6"><CardHeader><CardTitle className="text-base">Principal actions</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3">
      <Button asChild variant="outline"><Link to="/insights">Review academic insights</Link></Button>
      <Button asChild variant="outline"><Link to="/report-cards">Review report cards</Link></Button>
      <Button asChild variant="outline"><Link to="/attendance">Check attendance</Link></Button>
      <Button asChild variant="outline"><Link to="/analytics">Open analytics</Link></Button>
    </CardContent></Card>
  </AppShell>;
}
