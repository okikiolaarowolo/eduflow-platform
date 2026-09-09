import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Download, Loader2, LogIn, LogOut, Search, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

type Row = { id: string; teacher_id: string; work_date: string; clock_in_at: string; clock_out_at: string | null; status: string; note: string | null };
export const Route = createFileRoute("/_authenticated/teacher-attendance")({ component: TeacherAttendancePage });

function csv(rows: string[][]) {
  const text = rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = "eduflow-teacher-attendance.csv"; a.click();
}
const hours = (r: Row) => (r.clock_out_at ? ((new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime()) / 3600000) : 0);

function TeacherAttendancePage() {
  const schoolId = useSchoolId();
  const { user, primaryRole, isManager } = useAuth();
  const qc = useQueryClient();
  const canView = isManager || primaryRole === "secretary" || primaryRole === "teacher";
  const canOversee = isManager || primaryRole === "secretary";
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");

  const teachers = useQuery({ queryKey: ["teachers", schoolId], enabled: !!schoolId && canView, queryFn: () => api.teachers(schoolId!) });
  const records = useQuery({
    queryKey: ["teacher-attendance", schoolId], enabled: !!schoolId && canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("teacher_attendance").select("id,teacher_id,work_date,clock_in_at,clock_out_at,status,note").eq("school_id", schoolId!).order("clock_in_at", { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
  });

  const me = useMemo(() => (teachers.data ?? []).find((t) => t.user_id === user?.id), [teachers.data, user?.id]);
  const today = useMemo(() => (records.data ?? []).find((r) => r.teacher_id === me?.id && r.work_date === new Date().toISOString().slice(0, 10)), [records.data, me]);
  const openShift = useMemo(() => (records.data ?? []).find((r) => r.teacher_id === me?.id && !r.clock_out_at), [records.data, me]);

  const invalidate = async () => { await qc.invalidateQueries({ queryKey: ["teacher-attendance", schoolId] }); };
  const clockIn = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("teacher_clock_in", {}); if (error) throw new Error(error.message); },
    onSuccess: async () => { toast.success("Clocked in"); await invalidate(); }, onError: (e: Error) => toast.error(e.message),
  });
  const clockOut = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("teacher_clock_out", {}); if (error) throw new Error(error.message); },
    onSuccess: async () => { toast.success("Clocked out"); await invalidate(); }, onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (records.data ?? []).filter((r) => {
      const t = (teachers.data ?? []).find((x) => x.id === r.teacher_id);
      const name = t ? `${t.first_name} ${t.last_name} ${t.staff_id}`.toLowerCase() : "";
      return (!s || name.includes(s)) && (!from || r.work_date >= from);
    });
  }, [records.data, teachers.data, search, from]);

  const totalHours = filtered.reduce((n, r) => n + hours(r), 0);

  if (!canView) return <AppShell title="Teacher Attendance"><EmptyState icon={UserCheck} title="Access restricted" description="Teacher attendance is available to teachers, the Secretary and school managers." /></AppShell>;
  if (records.isLoading || teachers.isLoading) return <AppShell title="Teacher Attendance"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></AppShell>;

  return (
    <AppShell title="Teacher Attendance" description="Clock in, clock out and review staff attendance">
      <div className="space-y-5">
        {primaryRole === "teacher" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Today</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{me ? `${me.first_name} ${me.last_name}` : "Your account is not linked to a teacher record"}</p>
                <p className="text-sm text-muted-foreground">
                  {today ? `Clocked in ${new Date(today.clock_in_at).toLocaleTimeString()}` : "Not clocked in yet"}
                  {today?.clock_out_at ? ` · Clocked out ${new Date(today.clock_out_at).toLocaleTimeString()}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {openShift
                  ? <Button variant="outline" onClick={() => clockOut.mutate()} disabled={clockOut.isPending}>{clockOut.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}Clock out</Button>
                  : <Button onClick={() => clockIn.mutate()} disabled={clockIn.isPending || !me}>{clockIn.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}Clock in</Button>}
              </div>
            </CardContent>
          </Card>
        )}

        {canOversee && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Records</p><p className="mt-1 text-2xl font-bold">{filtered.length}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Currently clocked in</p><p className="mt-1 text-2xl font-bold">{filtered.filter((r) => !r.clock_out_at).length}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Hours logged</p><p className="mt-1 text-2xl font-bold">{totalHours.toFixed(1)}</p></CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">{canOversee ? "Attendance history" : "My recent records"}</CardTitle>
            {canOversee && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search teacher" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Button variant="outline" size="sm" onClick={() => csv([["Date", "Teacher", "Staff ID", "Clock in", "Clock out", "Hours"], ...filtered.map((r) => { const t = (teachers.data ?? []).find((x) => x.id === r.teacher_id); return [r.work_date, t ? `${t.first_name} ${t.last_name}` : "Unknown", t?.staff_id ?? "", new Date(r.clock_in_at).toISOString(), r.clock_out_at ? new Date(r.clock_out_at).toISOString() : "", hours(r).toFixed(2)]; })])}><Download className="size-4" />Export CSV</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {(() => {
              const visible = canOversee ? filtered : filtered.filter((r) => r.teacher_id === me?.id);
              if (visible.length === 0) return <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground"><Clock3 className="size-5" />No teacher attendance records yet.</div>;
              return <div className="space-y-2">{visible.slice(0, 80).map((r) => {
                const t = (teachers.data ?? []).find((x) => x.id === r.teacher_id);
                return (
                  <div key={r.id} className="flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-medium">{t ? `${t.first_name} ${t.last_name}` : "Unknown teacher"}</p><p className="text-xs text-muted-foreground">{r.work_date} · {t?.staff_id ?? ""}</p></div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary">In {new Date(r.clock_in_at).toLocaleTimeString()}</Badge>
                      {r.clock_out_at ? <><Badge>Out {new Date(r.clock_out_at).toLocaleTimeString()}</Badge><span className="text-xs text-muted-foreground">{hours(r).toFixed(2)} h</span></> : <Badge variant="destructive">Active</Badge>}
                    </div>
                  </div>
                );
              })}</div>;
            })()}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
