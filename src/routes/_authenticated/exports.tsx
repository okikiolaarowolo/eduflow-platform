import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/exports")({ component: ExportsPage });

function download(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name; a.click();
}

function ExportsPage() {
  const schoolId = useSchoolId();
  const { primaryRole } = useAuth();
  const allowed = ["school_admin", "principal", "secretary"].includes(primaryRole ?? "");
  const on = !!schoolId && allowed;

  const students = useQuery({ queryKey: ["export-students", schoolId], enabled: on, queryFn: () => api.students(schoolId!) });
  const teachers = useQuery({ queryKey: ["export-teachers", schoolId], enabled: on, queryFn: () => api.teachers(schoolId!) });
  const classes = useQuery({ queryKey: ["export-classes", schoolId], enabled: on, queryFn: () => api.classes(schoolId!) });

  const finance = useQuery({
    queryKey: ["export-finance", schoolId], enabled: on,
    queryFn: async () => {
      const [charges, payments] = await Promise.all([
        supabase.from("student_fees").select("id,student_id,title,amount_due,amount_paid,status,due_date").eq("school_id", schoolId!),
        supabase.from("fee_payments").select("id,student_id,student_fee_id,amount,paid_at,method,reference,receipt_number").eq("school_id", schoolId!).order("paid_at", { ascending: false }),
      ]);
      if (charges.error) throw new Error(charges.error.message);
      if (payments.error) throw new Error(payments.error.message);
      return { charges: charges.data ?? [], payments: payments.data ?? [] };
    },
  });

  const attendance = useQuery({
    queryKey: ["export-attendance", schoolId], enabled: on,
    queryFn: async () => {
      const [sessions, records] = await Promise.all([
        supabase.from("attendance_sessions").select("id,class_id,session_date,period").eq("school_id", schoolId!).order("session_date", { ascending: false }),
        supabase.from("attendance_records").select("attendance_session_id,student_id,status").eq("school_id", schoolId!),
      ]);
      if (sessions.error) throw new Error(sessions.error.message);
      if (records.error) throw new Error(records.error.message);
      return { sessions: sessions.data ?? [], records: records.data ?? [] };
    },
  });

  const teacherAttendance = useQuery({
    queryKey: ["export-teacher-attendance", schoolId], enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase.from("teacher_attendance").select("teacher_id,work_date,clock_in_at,clock_out_at,note").eq("school_id", schoolId!).order("clock_in_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (!allowed) return <AppShell title="Exports"><EmptyState icon={FileSpreadsheet} title="Export access required" description="Only school managers and the Secretary can export administrative data." /></AppShell>;

  const className = (id: string | null) => (classes.data ?? []).find((c) => c.id === id)?.name ?? "";
  const studentOf = (id: string) => (students.data ?? []).find((s) => s.id === id);
  const teacherOf = (id: string) => (teachers.data ?? []).find((t) => t.id === id);

  const studentRows = [["Student ID", "First name", "Last name", "Email", "Phone", "Class", "Admission date", "Archived"], ...(students.data ?? []).map((s) => [s.student_id, s.first_name, s.last_name, s.email ?? "", s.phone ?? "", className(s.class_id), s.admission_date ?? "", String(s.is_archived)])];

  const feeRows = [["Student ID", "Student", "Fee", "Due", "Paid", "Balance", "Status", "Due date"], ...(finance.data?.charges ?? []).map((c) => {
    const s = studentOf(c.student_id);
    const balance = Math.max(Number(c.amount_due) - Number(c.amount_paid), 0);
    return [s?.student_id ?? "", s ? `${s.first_name} ${s.last_name}` : "Unknown", c.title, Number(c.amount_due).toFixed(2), Number(c.amount_paid).toFixed(2), balance.toFixed(2), c.status, c.due_date ?? ""];
  })];

  const paymentRows = [["Receipt", "Student ID", "Student", "Amount", "Paid at", "Method", "Reference"], ...(finance.data?.payments ?? []).map((p) => {
    const s = studentOf(p.student_id);
    return [p.receipt_number, s?.student_id ?? "", s ? `${s.first_name} ${s.last_name}` : "", Number(p.amount).toFixed(2), new Date(p.paid_at).toISOString(), p.method, p.reference ?? ""];
  })];

  const attRows = [["Date", "Period", "Class", "Student ID", "Student", "Status"], ...(attendance.data?.records ?? []).map((r) => {
    const sess = (attendance.data?.sessions ?? []).find((x) => x.id === r.attendance_session_id);
    const s = studentOf(r.student_id);
    return [sess?.session_date ?? "", sess?.period ?? "", className(sess?.class_id ?? null), s?.student_id ?? "", s ? `${s.first_name} ${s.last_name}` : "", r.status];
  })];

  const summaryMap = new Map<string, { present: number; total: number }>();
  for (const r of attendance.data?.records ?? []) {
    const entry = summaryMap.get(r.student_id) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (r.status === "present" || r.status === "late") entry.present += 1;
    summaryMap.set(r.student_id, entry);
  }
  const attSummaryRows = [["Student ID", "Student", "Class", "Sessions", "Present", "Attendance rate %"], ...[...summaryMap.entries()].map(([studentId, v]) => {
    const s = studentOf(studentId);
    return [s?.student_id ?? "", s ? `${s.first_name} ${s.last_name}` : "", className(s?.class_id ?? null), String(v.total), String(v.present), v.total ? ((v.present / v.total) * 100).toFixed(1) : "0"];
  })];

  const teacherAttRows = [["Date", "Teacher", "Staff ID", "Clock in", "Clock out", "Hours", "Note"], ...(teacherAttendance.data ?? []).map((r) => {
    const t = teacherOf(r.teacher_id);
    const h = r.clock_out_at ? (new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime()) / 3600000 : 0;
    return [r.work_date, t ? `${t.first_name} ${t.last_name}` : "", t?.staff_id ?? "", new Date(r.clock_in_at).toISOString(), r.clock_out_at ? new Date(r.clock_out_at).toISOString() : "", h.toFixed(2), r.note ?? ""];
  })];

  const teacherRows = [["Staff ID", "First name", "Last name", "Email", "Phone", "Active"], ...(teachers.data ?? []).map((t) => [t.staff_id, t.first_name, t.last_name, t.email ?? "", t.phone ?? "", String(t.is_active)])];

  const cards = [
    { title: "Students", desc: "Student records and current class assignments", name: "eduflow-students.csv", rows: studentRows },
    { title: "Teachers", desc: "Staff records and active status", name: "eduflow-teachers.csv", rows: teacherRows },
    { title: "Fee status", desc: "Expected, paid, balance and payment status", name: "eduflow-fee-status.csv", rows: feeRows },
    { title: "Payment history", desc: "Recorded payments and receipt references", name: "eduflow-payment-history.csv", rows: paymentRows },
    { title: "Student attendance", desc: "Every attendance record by session", name: "eduflow-student-attendance.csv", rows: attRows },
    { title: "Attendance summary", desc: "Attendance rate per student", name: "eduflow-attendance-summary.csv", rows: attSummaryRows },
    { title: "Teacher attendance", desc: "Staff clock-in and clock-out history", name: "eduflow-teacher-attendance.csv", rows: teacherAttRows },
  ];

  return (
    <AppShell title="Administrative Exports" description="Download authorized school records as CSV">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="size-4" />{c.title}</CardTitle></CardHeader>
            <CardContent>
              <p className="min-h-10 text-sm text-muted-foreground">{c.desc}</p>
              <p className="mt-2 text-xs text-muted-foreground">{Math.max(c.rows.length - 1, 0)} rows</p>
              <Button className="mt-4 w-full" variant="outline" onClick={() => download(c.name, c.rows)}><Download className="size-4" />Export CSV</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
