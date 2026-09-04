import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardCheck, FileText, GraduationCap, Loader2, Users } from "lucide-react";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/teacher-dashboard")({ component: TeacherDashboard });
type ClassAssignment = { class_id: string; classes: { name: string; level: string | null; section: string | null } | null };
type SubjectAssignment = { subject_id: string; subjects: { name: string; code: string | null } | null };
type TeacherAssignment = { id: string; title: string; due_at: string | null; status: string; classes: { name: string } | null; subjects: { name: string } | null };

function TeacherDashboard() {
  const { user, primaryRole } = useAuth();
  const q = useQuery({
    queryKey: ["teacher-dashboard", user?.id], enabled: !!user?.id && primaryRole === "teacher",
    queryFn: async () => {
      const { data: teacher, error: teacherError } = await supabase.from("teachers").select("id, first_name, last_name").eq("user_id", user!.id).maybeSingle();
      if (teacherError) throw teacherError;
      if (!teacher) return null;
      const [{ data: classes, error: classesError }, { data: subjects, error: subjectsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
        supabase.from("teacher_classes").select("class_id, classes(name, level, section)").eq("teacher_id", teacher.id),
        supabase.from("teacher_subjects").select("subject_id, subjects(name, code)").eq("teacher_id", teacher.id),
        supabase.from("assignments").select("id, title, due_at, status, classes(name), subjects(name)").eq("teacher_id", teacher.id).order("created_at", { ascending: false }).limit(8),
      ]);
      if (classesError) throw classesError; if (subjectsError) throw subjectsError; if (assignmentsError) throw assignmentsError;
      return { teacher, classes: (classes ?? []) as ClassAssignment[], subjects: (subjects ?? []) as SubjectAssignment[], assignments: (assignments ?? []) as TeacherAssignment[] };
    },
  });
  if (primaryRole !== "teacher") return <AppShell title="Teacher Workspace"><EmptyState icon={GraduationCap} title="Teacher access only" description="This workspace is available to teacher accounts." /></AppShell>;
  if (q.isLoading) return <AppShell title="Teacher Workspace"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div></AppShell>;
  if (q.isError) return <AppShell title="Teacher Workspace"><p className="text-sm text-destructive">Unable to load your teacher workspace.</p></AppShell>;
  if (!q.data) return <AppShell title="Teacher Workspace"><EmptyState icon={GraduationCap} title="Teacher profile not linked" description="Ask a school administrator to link your account to your teacher record." /></AppShell>;
  const { teacher, classes, subjects, assignments } = q.data;
  return <AppShell title={`Welcome, ${teacher.first_name}`} description="Your teaching workspace">
    <div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="p-5"><Users className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Assigned classes</p><p className="font-display text-3xl font-bold">{classes.length}</p></CardContent></Card><Card><CardContent className="p-5"><BookOpen className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Subjects</p><p className="font-display text-3xl font-bold">{subjects.length}</p></CardContent></Card><Card><CardContent className="p-5"><FileText className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Assignments</p><p className="font-display text-3xl font-bold">{assignments.length}</p></CardContent></Card></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">My classes</CardTitle></CardHeader><CardContent className="space-y-2">{classes.length === 0 ? <p className="text-sm text-muted-foreground">No classes assigned yet.</p> : classes.map((item) => <div key={item.class_id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">{item.classes?.name}</p><p className="text-xs text-muted-foreground">{item.classes?.level} {item.classes?.section ?? ""}</p></div><Badge variant="secondary">Class</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Recent assignments</CardTitle></CardHeader><CardContent className="space-y-2">{assignments.length === 0 ? <p className="text-sm text-muted-foreground">No assignments created yet.</p> : assignments.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.classes?.name} · {item.subjects?.name}</p></div><Badge variant={item.status === "published" ? "default" : "secondary"}>{item.status}</Badge></div>{item.due_at && <p className="mt-2 text-xs text-muted-foreground">Due {new Date(item.due_at).toLocaleString()}</p>}</div>)}</CardContent></Card></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3"><Link to="/attendance" className="rounded-xl border p-4 hover:bg-muted/50"><ClipboardCheck className="size-5"/><p className="mt-2 font-semibold">Mark attendance</p></Link><Link to="/results" className="rounded-xl border p-4 hover:bg-muted/50"><FileText className="size-5"/><p className="mt-2 font-semibold">Enter results</p></Link><Link to="/operations" className="rounded-xl border p-4 hover:bg-muted/50"><BookOpen className="size-5"/><p className="mt-2 font-semibold">Manage learning</p></Link></div>
  </AppShell>;
}
