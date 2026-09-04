import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/attendance")({ component: AttendancePage });

type Status = "present" | "absent" | "late" | "excused";

function AttendancePage() {
  const schoolId = useSchoolId();
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState("Daily");
  const [status, setStatus] = useState<Record<string, Status>>({});
  const classes = useQuery({ queryKey: ["classes", schoolId], enabled: !!schoolId, queryFn: () => api.classes(schoolId!) });
  const students = useQuery({ queryKey: ["students", schoolId], enabled: !!schoolId, queryFn: () => api.students(schoolId!) });
  const sessions = useQuery({ queryKey: ["attendance-sessions", schoolId], enabled: !!schoolId, queryFn: () => api.attendanceSessions(schoolId!) });
  const selectedStudents = useMemo(() => (students.data ?? []).filter(s => s.class_id === classId && !s.is_archived), [students.data, classId]);
  const save = useMutation({ mutationFn: async () => {
    if (!schoolId || !classId) throw new Error("Select a class first");
    if (!selectedStudents.length) throw new Error("This class has no active students");
    const existing = (sessions.data ?? []).find(s => s.class_id === classId && s.session_date === date && s.period === period);
    let sessionId = existing?.id;
    if (!sessionId) {
      const { data, error } = await supabase.from("attendance_sessions").insert({ school_id: schoolId, class_id: classId, session_date: date, period, marked_by: user?.id }).select("id").single();
      if (error) throw new Error(error.message); sessionId = data.id;
    }
    const rows = selectedStudents.map(s => ({ school_id: schoolId, attendance_session_id: sessionId!, student_id: s.id, status: status[s.id] ?? "present" as Status }));
    const { error } = await supabase.from("attendance_records").upsert(rows, { onConflict: "attendance_session_id,student_id" });
    if (error) throw new Error(error.message);
  }, onSuccess: async () => { toast.success("Attendance saved"); await qc.invalidateQueries({ queryKey: ["attendance-sessions", schoolId] }); }, onError: e => toast.error(e.message) });

  return <AppShell title="Attendance" description="Record and monitor daily student attendance">
    <div className="space-y-5">
      <Card><CardHeader><CardTitle>Mark attendance</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><Select value={classId} onValueChange={v => { setClassId(v); setStatus({}); }}><SelectTrigger><SelectValue placeholder="Select class"/></SelectTrigger><SelectContent>{(classes.data ?? []).filter(c=>!c.is_archived).map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/><Input value={period} onChange={e=>setPeriod(e.target.value)} placeholder="Period"/></CardContent></Card>
      {!classId ? <EmptyState icon={ClipboardCheck} title="Select a class" description="Choose a class to start marking attendance."/> : selectedStudents.length === 0 ? <EmptyState icon={ClipboardCheck} title="No active students" description="Add students to this class before marking attendance."/> : <Card><CardHeader><CardTitle>{selectedStudents.length} students</CardTitle></CardHeader><CardContent className="space-y-2">{selectedStudents.map(student => <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-medium">{student.first_name} {student.last_name}</p><p className="text-xs text-muted-foreground">{student.student_id}</p></div><div className="flex gap-1">{(["present","absent","late","excused"] as Status[]).map(value => <Button key={value} size="sm" variant={(status[student.id] ?? "present") === value ? "default" : "outline"} onClick={()=>setStatus({...status,[student.id]:value})} className="capitalize">{value}</Button>)}</div></div>)}<Button className="mt-3" onClick={()=>save.mutate()} disabled={save.isPending || !isManager}>{save.isPending ? <Loader2 className="size-4 animate-spin"/> : <Save className="size-4"/>}{isManager ? "Save attendance" : "Manager permission required"}</Button></CardContent></Card>}
      {sessions.data?.length ? <Card><CardHeader><CardTitle>Recent attendance sessions</CardTitle></CardHeader><CardContent className="space-y-2">{sessions.data.slice(0,8).map(s=><div key={s.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{(classes.data??[]).find(c=>c.id===s.class_id)?.name ?? "Class"} · {s.session_date}</span><Badge variant="secondary">{s.period}</Badge></div>)}</CardContent></Card> : null}
    </div>
  </AppShell>;
}
