import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, BookOpen, CalendarDays, ClipboardCheck, FileText, GraduationCap, Loader2, MessageSquare, Users } from "lucide-react";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/portal")({
  component: PortalPage,
});

type Student = { id: string; first_name: string; last_name: string; student_id: string; class_id: string | null; email: string | null };
type ParentProfile = { id: string; full_name: string; email: string | null };

function PortalPage() {
  const { user, primaryRole, profile } = useAuth();
  const isParent = primaryRole === "parent";

  const studentQuery = useQuery({
    queryKey: ["portal-student", user?.id],
    enabled: !!user?.id && !isParent,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id, first_name, last_name, student_id, class_id, email").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as Student | null;
    },
  });

  const parentQuery = useQuery({
    queryKey: ["portal-parent", user?.id],
    enabled: !!user?.id && isParent,
    queryFn: async () => {
      const { data, error } = await supabase.from("parent_profiles").select("id, full_name, email").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as ParentProfile | null;
    },
  });

  const student = studentQuery.data;
  const parent = parentQuery.data;

  if ((studentQuery.isLoading && !isParent) || (parentQuery.isLoading && isParent)) {
    return <AppShell title="My Portal" description="Your EduFlow learning workspace"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }

  if (!isParent && !student) {
    return <AppShell title="My Portal" description="Student workspace"><EmptyState icon={GraduationCap} title="Student profile not linked yet" description="Ask a school administrator to link your EduFlow account to your student record." action={<Link to="/profile" className="text-sm font-medium underline">Open my profile</Link>} /></AppShell>;
  }

  if (isParent && !parent) {
    return <AppShell title="Parent Portal" description="Stay connected to your child's progress"><EmptyState icon={Users} title="Parent profile not linked yet" description="Ask a school administrator to link your EduFlow account to your parent record." /></AppShell>;
  }

  return isParent ? <ParentPortal parent={parent!} /> : <StudentPortal student={student!} />;
}

function StudentPortal({ student }: { student: Student }) {
  const { data: cls } = useQuery({
    queryKey: ["portal-class", student.class_id],
    enabled: !!student.class_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("name, level, section").eq("id", student.class_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["portal-assignments", student.class_id],
    enabled: !!student.class_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("assignments").select("id, title, due_at, status, subjects(name)").eq("class_id", student.class_id!).eq("status", "published").order("due_at", { ascending: true }).limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: scores = [] } = useQuery({
    queryKey: ["portal-scores", student.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_scores").select("id, score, grade, assessments(title, max_score, subjects(name))").eq("student_id", student.id).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  return <AppShell title={`Welcome, ${student.first_name}`} description="Your learning dashboard">
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardContent className="p-5"><div className="flex items-center gap-3"><GraduationCap className="size-5 text-primary"/><div><p className="text-xs text-muted-foreground">Student ID</p><p className="font-semibold">{student.student_id}</p></div></div></CardContent></Card>
      <Card><CardContent className="p-5"><div className="flex items-center gap-3"><Users className="size-5 text-primary"/><div><p className="text-xs text-muted-foreground">Class</p><p className="font-semibold">{cls ? `${cls.name}${cls.level ? ` · ${cls.level}` : ""}` : "Not assigned"}</p></div></div></CardContent></Card>
      <Card><CardContent className="p-5"><div className="flex items-center gap-3"><Award className="size-5 text-primary"/><div><p className="text-xs text-muted-foreground">Recent results</p><p className="font-semibold">{scores.length}</p></div></div></CardContent></Card>
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="size-4"/> Upcoming assignments</CardTitle></CardHeader><CardContent className="space-y-3">{assignments.length === 0 ? <p className="text-sm text-muted-foreground">No published assignments yet.</p> : assignments.map((a: any) => <div key={a.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{a.title}</p><p className="text-xs text-muted-foreground">{a.subjects?.name ?? "Subject"}</p></div><Badge variant="secondary">{a.due_at ? new Date(a.due_at).toLocaleDateString() : "No due date"}</Badge></div></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="size-4"/> Recent results</CardTitle></CardHeader><CardContent className="space-y-3">{scores.length === 0 ? <p className="text-sm text-muted-foreground">No results have been published yet.</p> : scores.map((s: any) => <div key={s.id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">{s.assessments?.title ?? "Assessment"}</p><p className="text-xs text-muted-foreground">{s.assessments?.subjects?.name ?? "Subject"}</p></div><div className="text-right"><p className="font-semibold">{s.score}/{s.assessments?.max_score ?? "—"}</p>{s.grade && <Badge variant="outline">{s.grade}</Badge>}</div></div>)}</CardContent></Card>
    </div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Link to="/ai-tutor" className="rounded-xl border p-4 transition hover:bg-muted/50"><MessageSquare className="size-5"/><p className="mt-2 font-semibold">Ask EduFlow AI</p><p className="text-xs text-muted-foreground">Get help with your subjects.</p></Link>
      <Link to="/timetable" className="rounded-xl border p-4 transition hover:bg-muted/50"><CalendarDays className="size-5"/><p className="mt-2 font-semibold">My timetable</p><p className="text-xs text-muted-foreground">View your class schedule.</p></Link>
      <Link to="/notifications" className="rounded-xl border p-4 transition hover:bg-muted/50"><ClipboardCheck className="size-5"/><p className="mt-2 font-semibold">Notifications</p><p className="text-xs text-muted-foreground">Stay up to date.</p></Link>
    </div>
  </AppShell>;
}

function ParentPortal({ parent }: { parent: ParentProfile }) {
  const { data: children = [] } = useQuery({
    queryKey: ["portal-children", parent.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("student_parents").select("student_id, relationship, is_primary, students(id, first_name, last_name, student_id, class_id)").eq("parent_id", parent.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  return <AppShell title={`Welcome, ${parent.full_name}`} description="Parent portal">
    <Card><CardHeader><CardTitle className="text-base">My children</CardTitle></CardHeader><CardContent className="space-y-3">{children.length === 0 ? <p className="text-sm text-muted-foreground">No student records are linked to your account yet.</p> : children.map((item: any) => <div key={item.student_id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{item.students?.first_name} {item.students?.last_name}</p><p className="text-sm text-muted-foreground">{item.students?.student_id}</p></div><Badge variant={item.is_primary ? "default" : "secondary"}>{item.relationship}</Badge></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><Link to="/results" className="rounded-lg bg-muted/60 p-3 text-sm font-medium">Results</Link><Link to="/attendance" className="rounded-lg bg-muted/60 p-3 text-sm font-medium">Attendance</Link><Link to="/notifications" className="rounded-lg bg-muted/60 p-3 text-sm font-medium">Notifications</Link></div></div>)}</CardContent></Card>
  </AppShell>;
}
