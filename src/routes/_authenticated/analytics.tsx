import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, BarChart3, Banknote, BookOpen, ClipboardCheck, GraduationCap, Loader2, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

type Filter = { sessionId: string; termId: string; classId: string; subjectId: string };
type Metric = { label: string; value: string; detail: string; icon: typeof Users };
type ScoreRow = { score: number | null; assessments?: { subject_id: string; class_id: string; term_id: string; subjects?: { name: string } | null; classes?: { name: string } | null } | null };
type AttendanceRow = { status: string; attendance_sessions?: { class_id: string; term_id: string | null } | null };
type FeeRow = { amount_due: number | null; fee_payments?: { amount: number | null }[] };

function AnalyticsPage() {
  const schoolId = useSchoolId();
  const [filter, setFilter] = useState<Filter>({ sessionId: "", termId: "", classId: "", subjectId: "" });
  const query = useQuery({
    queryKey: ["school-analytics", schoolId, filter],
    enabled: !!schoolId,
    queryFn: async () => {
      const [students, teachers, classes, sessions, terms, scores, attendance, assignments, submissions, fees, teacherAttendance] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId!).eq("is_archived", false),
        supabase.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", schoolId!).eq("is_active", true),
        supabase.from("classes").select("id,name,level", { count: "exact" }).eq("school_id", schoolId!).eq("is_archived", false).order("name"),
        supabase.from("academic_sessions").select("id,name,is_current,start_date,end_date").eq("school_id", schoolId!).order("start_date", { ascending: false }),
        supabase.from("terms").select("id,name,session_id,is_current,start_date,end_date").eq("school_id", schoolId!).order("start_date"),
        supabase.from("assessment_scores").select("score,assessment_id,assessments(subject_id,class_id,term_id,subjects(name),classes(name))").eq("school_id", schoolId!),
        supabase.from("attendance_records").select("status,attendance_sessions(class_id,term_id)").eq("school_id", schoolId!),
        supabase.from("assignments").select("id,class_id,subject_id,status").eq("school_id", schoolId!),
        supabase.from("assignment_submissions").select("id,student_id,assignment_id,score").eq("school_id", schoolId!),
        supabase.from("fee_assignments").select("amount_due,fee_payments(amount)").eq("school_id", schoolId!),
        supabase.from("teacher_attendance").select("attendance_date,clock_in,clock_out").eq("school_id", schoolId!),
      ]);
      const results = [students, teachers, classes, sessions, terms, scores, attendance, assignments, submissions, fees, teacherAttendance];
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      const termRows = terms.data ?? [];
      const scoreRows = (scores.data ?? []) as unknown as ScoreRow[];
      const attendanceRows = (attendance.data ?? []) as unknown as AttendanceRow[];
      const feeRows = (fees.data ?? []) as unknown as FeeRow[];
      const selectedScores = scoreRows.filter((row) => {
        const a = row.assessments;
        if (!a) return false;
        const sessionId = termRows.find((term) => term.id === a.term_id)?.session_id;
        return (!filter.sessionId || sessionId === filter.sessionId) && (!filter.termId || a.term_id === filter.termId) && (!filter.classId || a.class_id === filter.classId) && (!filter.subjectId || a.subject_id === filter.subjectId);
      });
      const selectedAttendance = attendanceRows.filter((row) => {
        const session = row.attendance_sessions;
        return !!session && (!filter.termId || session.term_id === filter.termId) && (!filter.classId || session.class_id === filter.classId);
      });
      const bySubject = new Map<string, { sum: number; count: number }>();
      const byClass = new Map<string, { sum: number; count: number }>();
      for (const row of selectedScores) {
        const subject = row.assessments?.subjects?.name ?? "Unknown";
        const subjectBucket = bySubject.get(subject) ?? { sum: 0, count: 0 };
        subjectBucket.sum += Number(row.score ?? 0); subjectBucket.count += 1; bySubject.set(subject, subjectBucket);
        const className = row.assessments?.classes?.name ?? "Unknown";
        const classBucket = byClass.get(className) ?? { sum: 0, count: 0 };
        classBucket.sum += Number(row.score ?? 0); classBucket.count += 1; byClass.set(className, classBucket);
      }
      const subjectData = [...bySubject.entries()].map(([name, item]) => ({ name, average: Number((item.sum / Math.max(1, item.count)).toFixed(1)) })).sort((a, b) => b.average - a.average);
      const classData = [...byClass.entries()].map(([name, item]) => ({ name, average: Number((item.sum / Math.max(1, item.count)).toFixed(1)) })).sort((a, b) => b.average - a.average);
      const attendanceData = ["present", "late", "absent", "excused"].map((status) => ({ name: status[0].toUpperCase() + status.slice(1), value: selectedAttendance.filter((row) => row.status === status).length })).filter((item) => item.value > 0);
      const average = selectedScores.length ? selectedScores.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / selectedScores.length : 0;
      const attendanceRate = selectedAttendance.length ? (selectedAttendance.filter((row) => row.status === "present" || row.status === "late").length / selectedAttendance.length) * 100 : 0;
      const billed = feeRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
      const collected = feeRows.reduce((sum, row) => sum + (row.fee_payments ?? []).reduce((inner, payment) => inner + Number(payment.amount ?? 0), 0), 0);
      return { students: students.count ?? 0, teachers: teachers.count ?? 0, classes: classes.count ?? 0, sessions: sessions.data ?? [], terms: termRows, classesList: classes.data ?? [], subjectData, classData, attendanceData, financeData: [{ name: "Fees", billed: Number(billed.toFixed(2)), collected: Number(collected.toFixed(2)), outstanding: Number(Math.max(0, billed - collected).toFixed(2)) }], average, attendanceRate, assignmentCount: (assignments.data ?? []).filter((item) => !filter.classId || item.class_id === filter.classId).length, submissionCount: (submissions.data ?? []).length, teacherAttendanceCount: (teacherAttendance.data ?? []).filter((item) => !!item.clock_in).length };
    },
  });

  if (!schoolId) return <AppShell title="Analytics"><EmptyState icon={BarChart3} title="School setup required" description="Complete school onboarding before viewing analytics." /></AppShell>;
  if (query.isLoading) return <AppShell title="Analytics" description="School intelligence across academics, attendance and finance"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div></AppShell>;
  if (query.isError || !query.data) return <AppShell title="Analytics"><p className="text-sm text-destructive">Unable to load school analytics.</p></AppShell>;
  const d = query.data;
  const currentSession = d.sessions.find((session: { is_current: boolean }) => session.is_current);
  const currentTerm = d.terms.find((term: { is_current: boolean }) => term.is_current && (!filter.sessionId || term.session_id === filter.sessionId));
  const metrics: Metric[] = [
    { label: "Students", value: d.students.toLocaleString(), detail: "Active school records", icon: Users },
    { label: "Teachers", value: d.teachers.toLocaleString(), detail: "Active teacher records", icon: GraduationCap },
    { label: "Average score", value: `${d.average.toFixed(1)}%`, detail: "Filtered recorded scores", icon: TrendingUp },
    { label: "Attendance", value: `${d.attendanceRate.toFixed(1)}%`, detail: "Present or late", icon: ClipboardCheck },
    { label: "Assignments", value: d.assignmentCount.toLocaleString(), detail: `${d.submissionCount} submissions`, icon: BookOpen },
    { label: "Teacher attendance", value: d.teacherAttendanceCount.toLocaleString(), detail: "Clock-ins recorded", icon: Activity },
  ];
  return <AppShell title="Analytics" description="School intelligence across academics, attendance, learning and finance">
    <div className="mb-6 grid gap-3 md:grid-cols-4">
      <Select value={filter.sessionId || "all"} onValueChange={(value) => setFilter({ ...filter, sessionId: value === "all" ? "" : value, termId: "" })}><SelectTrigger><SelectValue placeholder="Academic session" /></SelectTrigger><SelectContent><SelectItem value="all">All sessions</SelectItem>{d.sessions.map((session: { id: string; name: string }) => <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>)}</SelectContent></Select>
      <Select value={filter.termId || "all"} onValueChange={(value) => setFilter({ ...filter, termId: value === "all" ? "" : value })}><SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger><SelectContent><SelectItem value="all">All terms</SelectItem>{d.terms.filter((term: { session_id: string }) => !filter.sessionId || term.session_id === filter.sessionId).map((term: { id: string; name: string }) => <SelectItem key={term.id} value={term.id}>{term.name}</SelectItem>)}</SelectContent></Select>
      <Select value={filter.classId || "all"} onValueChange={(value) => setFilter({ ...filter, classId: value === "all" ? "" : value })}><SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger><SelectContent><SelectItem value="all">All classes</SelectItem>{d.classesList.map((item: { id: string; name: string }) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select value={filter.subjectId || "all"} onValueChange={(value) => setFilter({ ...filter, subjectId: value === "all" ? "" : value })}><SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger><SelectContent><SelectItem value="all">All subjects</SelectItem>{d.subjectData.map((item) => <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map((metric) => { const Icon = metric.icon; return <Card key={metric.label}><CardContent className="p-5"><Icon className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">{metric.label}</p><p className="font-display text-2xl font-bold">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p></CardContent></Card>; })}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Performance by subject</CardTitle></CardHeader><CardContent className="h-80">{d.subjectData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={d.subjectData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{ fontSize: 11 }}/><YAxis domain={[0, 100]}/><Tooltip/><Bar dataKey="average" name="Average %" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer> : <EmptyState icon={BarChart3} title="No score data" description="Record assessment scores to see subject performance."/>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Performance by class</CardTitle></CardHeader><CardContent className="h-80">{d.classData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={d.classData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis domain={[0, 100]}/><Tooltip/><Bar dataKey="average" name="Average %" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer> : <EmptyState icon={Users} title="No class score data" description="Class performance will appear as results are recorded."/>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Attendance mix</CardTitle></CardHeader><CardContent className="h-80">{d.attendanceData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={d.attendanceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label/><Tooltip/><Legend/></PieChart></ResponsiveContainer> : <EmptyState icon={ClipboardCheck} title="No attendance data" description="Mark attendance to build attendance analytics."/>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Fee position</CardTitle></CardHeader><CardContent className="h-80">{d.financeData[0].billed > 0 ? <ResponsiveContainer width="100%" height="100%"><BarChart data={d.financeData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/><Bar dataKey="billed" name="Billed"/><Bar dataKey="collected" name="Collected"/><Bar dataKey="outstanding" name="Outstanding"/></BarChart></ResponsiveContainer> : <EmptyState icon={Banknote} title="No fee data" description="Fee assignments and payments will appear here."/>}</CardContent></Card>
    </div>
    <Card className="mt-6"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="size-4"/>Current academic signal</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Session</p><p className="mt-1 font-medium">{filter.sessionId ? d.sessions.find((s: { id: string }) => s.id === filter.sessionId)?.name : currentSession?.name ?? "All sessions"}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Term</p><p className="mt-1 font-medium">{filter.termId ? d.terms.find((t: { id: string }) => t.id === filter.termId)?.name : currentTerm?.name ?? "All terms"}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Interpretation</p><p className="mt-1 font-medium">{d.average >= 70 ? "Strong academic performance" : d.average >= 50 ? "Mixed performance — review weak subjects" : "Priority intervention recommended"}</p><Badge className="mt-2" variant={d.average >= 70 ? "default" : d.average >= 50 ? "secondary" : "destructive"}>{d.average.toFixed(1)}% average</Badge></div></CardContent></Card>
  </AppShell>;
}
