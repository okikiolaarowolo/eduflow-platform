import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ClipboardCheck, GraduationCap, Loader2, Users, UserRound } from "lucide-react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/secretary-dashboard")({ component: SecretaryDashboard });

function SecretaryDashboard() {
  const { primaryRole } = useAuth();
  const schoolId = useSchoolId();
  const students = useQuery({ queryKey: ["secretary-students", schoolId], enabled: !!schoolId && primaryRole === "secretary", queryFn: () => api.students(schoolId!) });
  const classes = useQuery({ queryKey: ["secretary-classes", schoolId], enabled: !!schoolId && primaryRole === "secretary", queryFn: () => api.classes(schoolId!) });
  const teachers = useQuery({ queryKey: ["secretary-teachers", schoolId], enabled: !!schoolId && primaryRole === "secretary", queryFn: () => api.teachers(schoolId!) });

  if (primaryRole !== "secretary") {
    return <AppShell title="Secretary Workspace"><EmptyState icon={UserRound} title="Secretary access required" description="This workspace is available to users assigned the Secretary role." /></AppShell>;
  }

  if (students.isLoading || classes.isLoading || teachers.isLoading) {
    return <AppShell title="Secretary Workspace" description="School administration workspace"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }

  if (students.isError || classes.isError || teachers.isError) {
    return <AppShell title="Secretary Workspace"><p className="text-sm text-destructive">Some school records could not be loaded. Refresh and try again.</p></AppShell>;
  }

  const activeStudents = (students.data ?? []).filter((student) => !student.is_archived).length;
  const activeClasses = (classes.data ?? []).filter((item) => !item.is_archived).length;
  const activeTeachers = (teachers.data ?? []).filter((teacher) => teacher.is_active).length;

  return (
    <AppShell title="Secretary Workspace" description="Manage the school's day-to-day records">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active students</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between"><p className="text-3xl font-bold">{activeStudents}</p><Users className="size-5 text-muted-foreground" /></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active classes</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between"><p className="text-3xl font-bold">{activeClasses}</p><GraduationCap className="size-5 text-muted-foreground" /></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active teachers</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between"><p className="text-3xl font-bold">{activeTeachers}</p><UserRound className="size-5 text-muted-foreground" /></div></CardContent></Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link to="/students"><Card className="h-full transition hover:border-primary/40 hover:bg-muted/30"><CardContent className="p-5"><Users className="size-5" /><h2 className="mt-3 font-semibold">Students</h2><p className="mt-1 text-sm text-muted-foreground">Add, edit, search and archive student records.</p></CardContent></Card></Link>
        <Link to="/classes"><Card className="h-full transition hover:border-primary/40 hover:bg-muted/30"><CardContent className="p-5"><GraduationCap className="size-5" /><h2 className="mt-3 font-semibold">Classes</h2><p className="mt-1 text-sm text-muted-foreground">Review classes and student assignments.</p></CardContent></Card></Link>
        <Link to="/attendance"><Card className="h-full transition hover:border-primary/40 hover:bg-muted/30"><CardContent className="p-5"><ClipboardCheck className="size-5" /><h2 className="mt-3 font-semibold">Attendance</h2><p className="mt-1 text-sm text-muted-foreground">Review school attendance workflows.</p></CardContent></Card></Link>
        <Link to="/operations"><Card className="h-full transition hover:border-primary/40 hover:bg-muted/30"><CardContent className="p-5"><CalendarDays className="size-5" /><h2 className="mt-3 font-semibold">Operations</h2><p className="mt-1 text-sm text-muted-foreground">Access academic sessions and school operations.</p></CardContent></Card></Link>
      </div>

      <div className="mt-6 rounded-2xl border bg-muted/20 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">Student records</h2><p className="text-sm text-muted-foreground">Keep enrolment information accurate and up to date.</p></div>
          <Button asChild><Link to="/students">Open students</Link></Button>
        </div>
      </div>
    </AppShell>
  );
}
