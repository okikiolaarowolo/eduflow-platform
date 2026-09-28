import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Download, Loader2, Plus, Receipt, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { api, type StudentRow } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/finance")({ component: FinancePage });

type FeeType = { id: string; name: string; description: string | null; amount: number; frequency: string; is_active: boolean };
type Session = { id: string; name: string; is_current: boolean };
type Term = { id: string; name: string; session_id: string; is_current: boolean };
type Assignment = { id: string; student_id: string; title: string; fee_type_id: string | null; session_id: string | null; term_id: string | null; amount_due: number; due_date: string | null; status: string; created_at: string };
type Payment = { id: string; fee_assignment_id: string; student_id: string; amount: number; payment_date: string; method: string; reference: string | null; receipt_number: string; note: string | null };

const money = (n: number) => `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function csv(name: string, rows: string[][]) {
  const text = rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function FinancePage() {
  const schoolId = useSchoolId();
  const { primaryRole } = useAuth();
  const qc = useQueryClient();
  const canManage = primaryRole === "secretary" || primaryRole === "school_admin" || primaryRole === "principal";

  const students = useQuery({ queryKey: ["students", schoolId], enabled: !!schoolId && canManage, queryFn: () => api.students(schoolId!) });
  const classes = useQuery({ queryKey: ["classes", schoolId], enabled: !!schoolId && canManage, queryFn: () => api.classes(schoolId!) });
  const sessions = useQuery({ queryKey: ["sessions", schoolId], enabled: !!schoolId && canManage, queryFn: () => api.sessions(schoolId!) });
  const terms = useQuery({ queryKey: ["terms", schoolId], enabled: !!schoolId && canManage, queryFn: () => api.terms(schoolId!) });
  const feeTypes = useQuery({
    queryKey: ["fee-types", schoolId], enabled: !!schoolId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_types").select("id,name,description,amount,frequency,is_active").eq("school_id", schoolId!).order("name");
      if (error) throw new Error(error.message); return (data ?? []) as FeeType[];
    },
  });
  const assignments = useQuery({
    queryKey: ["fee-assignments", schoolId], enabled: !!schoolId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_assignments").select("id,student_id,title,fee_type_id,session_id,term_id,amount_due,due_date,status,created_at").eq("school_id", schoolId!).order("created_at", { ascending: false });
      if (error) throw new Error(error.message); return (data ?? []) as Assignment[];
    },
  });
  const payments = useQuery({
    queryKey: ["fee-payments", schoolId], enabled: !!schoolId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_payments").select("id,fee_assignment_id,student_id,amount,payment_date,method,reference,receipt_number,note").eq("school_id", schoolId!).order("payment_date", { ascending: false });
      if (error) throw new Error(error.message); return (data ?? []) as Payment[];
    },
  });

  const currentSession = (sessions.data ?? []).find((s) => s.is_current) ?? sessions.data?.[0];
  const currentTerm = (terms.data ?? []).find((t) => t.is_current && (!currentSession || t.session_id === currentSession.id)) ?? (terms.data ?? []).find((t) => t.session_id === currentSession?.id) ?? terms.data?.[0];

  const [filters, setFilters] = useState({ sessionId: "", termId: "", classId: "", status: "all", search: "" });
  const sessionId = filters.sessionId || currentSession?.id || "";
  const termId = filters.termId || currentTerm?.id || "";
  const filteredTerms = (terms.data ?? []).filter((t) => !sessionId || t.session_id === sessionId);

  const [charge, setCharge] = useState({ studentId: "", feeTypeId: "none", title: "", amount: "", sessionId: "", termId: "", dueDate: "" });
  const [feeType, setFeeType] = useState({ name: "", amount: "", frequency: "term", description: "" });
  const [payment, setPayment] = useState({ assignmentId: "", amount: "", method: "cash", reference: "", note: "" });
  const [studentSearch, setStudentSearch] = useState("");

  const createFeeType = useMutation({
    mutationFn: async () => {
      if (!schoolId || !feeType.name.trim() || Number(feeType.amount) <= 0) throw new Error("Fee name and a positive amount are required");
      const { error } = await supabase.from("fee_types").insert({ school_id: schoolId, name: feeType.name.trim(), amount: Number(feeType.amount), frequency: feeType.frequency, description: feeType.description.trim() || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setFeeType({ name: "", amount: "", frequency: "term", description: "" }); toast.success("Fee type created"); await qc.invalidateQueries({ queryKey: ["fee-types", schoolId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCharge = useMutation({
    mutationFn: async () => {
      if (!schoolId || !charge.studentId) throw new Error("Select a student");
      const selectedSession = charge.sessionId || sessionId;
      const selectedTerm = charge.termId || termId;
      if (!selectedSession || !selectedTerm) throw new Error("Select an academic session and term");
      const amount = Number(charge.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid fee amount");
      const type = charge.feeTypeId !== "none" ? (feeTypes.data ?? []).find((f) => f.id === charge.feeTypeId) : null;
      const title = charge.title.trim() || type?.name?.trim();
      if (!title) throw new Error("Enter a fee name or choose a fee type");
      const { error } = await supabase.from("fee_assignments").insert({ school_id: schoolId, student_id: charge.studentId, title, fee_type_id: type?.id ?? null, session_id: selectedSession, term_id: selectedTerm, amount_due: amount, due_date: charge.dueDate || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setCharge({ studentId: "", feeTypeId: "none", title: "", amount: "", sessionId: "", termId: "", dueDate: "" }); toast.success("Student fee charge added"); await qc.invalidateQueries({ queryKey: ["fee-assignments", schoolId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!schoolId || !payment.assignmentId) throw new Error("Select an outstanding fee");
      const a = (assignments.data ?? []).find((x) => x.id === payment.assignmentId); if (!a) throw new Error("Fee charge not found");
      const paid = (payments.data ?? []).filter((p) => p.fee_assignment_id === a.id).reduce((sum, p) => sum + Number(p.amount), 0);
      const amount = Number(payment.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid payment amount");
      const balance = Math.max(Number(a.amount_due) - paid, 0);
      if (amount > balance + 0.0001) throw new Error(`Payment exceeds the outstanding balance of ${money(balance)}`);
      const { error } = await supabase.from("fee_payments").insert({ school_id: schoolId, fee_assignment_id: a.id, student_id: a.student_id, amount, method: payment.method, reference: payment.reference.trim() || null, note: payment.note.trim() || null, receipt_number: "" });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setPayment({ assignmentId: "", amount: "", method: "cash", reference: "", note: "" }); toast.success("Payment recorded and balance updated"); await Promise.all([qc.invalidateQueries({ queryKey: ["fee-payments", schoolId] }), qc.invalidateQueries({ queryKey: ["fee-assignments", schoolId] })]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const studentMap = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);
  const feeTypeMap = useMemo(() => new Map((feeTypes.data ?? []).map((f) => [f.id, f])), [feeTypes.data]);
  const classMap = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c])), [classes.data]);
  const paymentMap = useMemo(() => {
    const m = new Map<string, number>(); for (const p of payments.data ?? []) m.set(p.fee_assignment_id, (m.get(p.fee_assignment_id) ?? 0) + Number(p.amount)); return m;
  }, [payments.data]);

  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return (assignments.data ?? []).map((a) => {
      const s = studentMap.get(a.student_id); const paid = paymentMap.get(a.id) ?? 0; const balance = Math.max(Number(a.amount_due) - paid, 0);
      const status = balance <= 0.009 ? "paid" : paid > 0 ? "partial" : "unpaid";
      return { ...a, paid, balance, status, student: s, feeName: a.title || feeTypeMap.get(a.fee_type_id ?? "")?.name || "Fee", className: s?.class_id ? classMap.get(s.class_id)?.name ?? "" : "" };
    }).filter((r) => (!sessionId || r.session_id === sessionId) && (!termId || r.term_id === termId) && (!filters.classId || r.student?.class_id === filters.classId) && (filters.status === "all" || r.status === filters.status) && (!q || `${r.student?.first_name ?? ""} ${r.student?.last_name ?? ""} ${r.student?.student_id ?? ""} ${r.feeName}`.toLowerCase().includes(q)));
  }, [assignments.data, studentMap, paymentMap, feeTypeMap, classMap, filters, sessionId, termId]);

  const studentBalances = useMemo(() => {
    const m = new Map<string, { student: StudentRow; due: number; paid: number; balance: number }>();
    for (const r of rows) { if (!r.student) continue; const cur = m.get(r.student.id) ?? { student: r.student, due: 0, paid: 0, balance: 0 }; cur.due += Number(r.amount_due); cur.paid += r.paid; cur.balance += r.balance; m.set(r.student.id, cur); }
    return [...m.values()].map((x) => ({ ...x, status: x.balance <= 0.009 ? "paid" : x.paid > 0 ? "partial" : "unpaid" }));
  }, [rows]);

  const totals = rows.reduce((x, r) => ({ due: x.due + Number(r.amount_due), paid: x.paid + r.paid, balance: x.balance + r.balance }), { due: 0, paid: 0, balance: 0 });
  const owingStudents = studentBalances.filter((s) => s.balance > 0.009);
  const paidStudents = studentBalances.filter((s) => s.status === "paid");
  const partialStudents = studentBalances.filter((s) => s.status === "partial");
  const unpaidStudents = studentBalances.filter((s) => s.status === "unpaid");
  const outstandingAssignments = rows.filter((r) => r.balance > 0.009);
  const loading = students.isLoading || classes.isLoading || sessions.isLoading || terms.isLoading || feeTypes.isLoading || assignments.isLoading || payments.isLoading;

  if (!canManage) return <AppShell title="Finance" description="Fees and payments"><EmptyState icon={Banknote} title="Finance access required" description="Finance is available to school managers and the Secretary." /></AppShell>;
  if (loading) return <AppShell title="Finance"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></AppShell>;
  if ([assignments, payments, feeTypes].some((q) => q.isError)) return <AppShell title="Finance"><p className="text-sm text-destructive">Finance records could not be loaded. Refresh and try again.</p></AppShell>;

  const selectedStudent = studentMap.get(charge.studentId);
  const selectedBalance = payment.assignmentId ? rows.find((r) => r.id === payment.assignmentId) : undefined;

  return <AppShell title="Finance" description="Record student fees, payments and automatically calculate parent balances">
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total expected</p><p className="mt-1 text-2xl font-bold">{money(totals.due)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total collected</p><p className="mt-1 text-2xl font-bold">{money(totals.paid)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total outstanding</p><p className="mt-1 text-2xl font-bold">{money(totals.balance)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Students owing</p><p className="mt-1 text-2xl font-bold">{owingStudents.length}</p></CardContent></Card>
      </div>

      <Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Secretary workflow</p><p className="text-sm text-muted-foreground">Select a student, enter or assign their fee, then record payments. EduFlow calculates the balance automatically — no manual parent-owing calculation.</p></div><Button onClick={() => document.getElementById("add-charge")?.scrollIntoView({ behavior: "smooth" })}><Plus className="size-4" />Add student fee</Button></CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.5fr]">
        <Select value={sessionId} onValueChange={(v) => setFilters({ ...filters, sessionId: v, termId: "" })}><SelectTrigger><SelectValue placeholder="Academic session" /></SelectTrigger><SelectContent>{(sessions.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " · Current" : ""}</SelectItem>)}</SelectContent></Select>
        <Select value={termId} onValueChange={(v) => setFilters({ ...filters, termId: v })}><SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger><SelectContent>{filteredTerms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " · Current" : ""}</SelectItem>)}</SelectContent></Select>
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search student, admission ID or fee" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></div>
      </div>

      <Tabs defaultValue="balances">
        <TabsList className="flex-wrap"><TabsTrigger value="balances">Balances</TabsTrigger><TabsTrigger value="add">Add student fee</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger><TabsTrigger value="fee-types">Fee types</TabsTrigger></TabsList>
        <TabsContent value="balances" className="space-y-4">
          <div className="flex flex-wrap gap-2"><Badge variant="default">Paid {paidStudents.length}</Badge><Badge variant="secondary">Partial {partialStudents.length}</Badge><Badge variant="destructive">Unpaid {unpaidStudents.length}</Badge><Badge variant="outline">Owing {owingStudents.length}</Badge><Button variant="outline" className="ml-auto" onClick={() => csv("eduflow-student-fee-balances.csv", [["Student ID","Student","Class","Expected","Paid","Outstanding","Status"], ...studentBalances.map((r) => [r.student.student_id, `${r.student.first_name} ${r.student.last_name}`, r.student.class_id ? classMap.get(r.student.class_id)?.name ?? "" : "", r.due.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2), r.status])])}><Download className="size-4" />Export balances</Button></div>
          {studentBalances.length === 0 ? <EmptyState icon={UserRound} title="No fee records for this selection" description="Add a student fee charge to start building the fee ledger." /> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Expected</th><th className="p-3">Paid</th><th className="p-3">Outstanding</th><th className="p-3">Status</th></tr></thead><tbody>{studentBalances.map((r) => <tr key={r.student.id} className="border-b last:border-0"><td className="p-3"><p className="font-medium">{r.student.first_name} {r.student.last_name}</p><p className="text-xs text-muted-foreground">{r.student.student_id}{r.student.guardian_name ? ` · Parent: ${r.student.guardian_name}` : ""}</p></td><td className="p-3">{r.student.class_id ? classMap.get(r.student.class_id)?.name ?? "—" : "—"}</td><td className="p-3">{money(r.due)}</td><td className="p-3">{money(r.paid)}</td><td className="p-3 font-semibold">{money(r.balance)}</td><td className="p-3"><Badge variant={r.status === "paid" ? "default" : r.status === "partial" ? "secondary" : "destructive"}>{r.status}</Badge></td></tr>)}</tbody></table></div>}
        </TabsContent>

        <TabsContent value="add" id="add-charge"><Card><CardHeader><CardTitle className="text-base">Add fee to a student</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Find student</Label><Input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search by name or admission ID" /></div>
          <Select value={charge.studentId} onValueChange={(v) => setCharge({ ...charge, studentId: v })}><SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger><SelectContent>{(students.data ?? []).filter((s) => !s.is_archived && (!studentSearch.trim() || `${s.first_name} ${s.last_name} ${s.student_id}`.toLowerCase().includes(studentSearch.trim().toLowerCase()))).map((s) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.student_id}</SelectItem>)}</SelectContent></Select>
          <Select value={charge.sessionId || sessionId} onValueChange={(v) => setCharge({ ...charge, sessionId: v, termId: "" })}><SelectTrigger><SelectValue placeholder="Academic session" /></SelectTrigger><SelectContent>{(sessions.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          <Select value={charge.termId || termId} onValueChange={(v) => setCharge({ ...charge, termId: v })}><SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger><SelectContent>{(terms.data ?? []).filter((t) => t.session_id === (charge.sessionId || sessionId)).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          <Select value={charge.feeTypeId} onValueChange={(v) => { const f = (feeTypes.data ?? []).find((x) => x.id === v); setCharge({ ...charge, feeTypeId: v, title: f?.name ?? charge.title, amount: f ? String(f.amount) : charge.amount }); }}><SelectTrigger><SelectValue placeholder="Existing fee type (optional)" /></SelectTrigger><SelectContent><SelectItem value="none">Custom fee</SelectItem>{(feeTypes.data ?? []).filter((f) => f.is_active).map((f) => <SelectItem key={f.id} value={f.id}>{f.name} · {money(f.amount)}</SelectItem>)}</SelectContent></Select>
          <Input value={charge.title} onChange={(e) => setCharge({ ...charge, title: e.target.value })} placeholder="Fee name, e.g. Tuition" />
          <Input type="number" min="0.01" step="0.01" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value })} placeholder="Amount due" />
          <Input type="date" value={charge.dueDate} onChange={(e) => setCharge({ ...charge, dueDate: e.target.value })} />
          {selectedStudent && <div className="rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2"><p className="font-medium">{selectedStudent.first_name} {selectedStudent.last_name}</p><p className="text-muted-foreground">{selectedStudent.student_id} · Parent/Guardian: {selectedStudent.guardian_name || "Not recorded"}{selectedStudent.guardian_phone ? ` · ${selectedStudent.guardian_phone}` : ""}</p></div>}
          <div className="sm:col-span-2"><Button onClick={() => addCharge.mutate()} disabled={addCharge.isPending}>{addCharge.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Add fee charge</Button></div>
        </CardContent></Card></TabsContent>

        <TabsContent value="payments" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Record a payment</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <Select value={payment.assignmentId} onValueChange={(v) => { const r = rows.find((x) => x.id === v); setPayment({ ...payment, assignmentId: v, amount: r ? String(r.balance) : "" }); }}><SelectTrigger><SelectValue placeholder="Student fee / outstanding charge" /></SelectTrigger><SelectContent>{outstandingAssignments.map((r) => <SelectItem key={r.id} value={r.id}>{r.student ? `${r.student.first_name} ${r.student.last_name}` : "Student"} · {r.feeName} · {money(r.balance)} outstanding</SelectItem>)}</SelectContent></Select>
          <Input type="number" min="0.01" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} placeholder="Payment amount" />
          <Select value={payment.method} onValueChange={(v) => setPayment({ ...payment, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank_transfer">Bank transfer</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="pos">POS</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select>
          <Input value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="Payment reference (optional)" />
          {selectedBalance && <div className="rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2"><p>Outstanding before payment: <strong>{money(selectedBalance.balance)}</strong></p><p className="text-muted-foreground">The system will reject a payment greater than the current balance.</p></div>}
          <Textarea className="sm:col-span-2" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} placeholder="Payment note (optional)" />
          <div><Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>{recordPayment.isPending ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}Record payment</Button></div>
        </CardContent></Card><div className="flex justify-end"><Button variant="outline" onClick={() => csv("eduflow-payment-history.csv", [["Receipt","Student","Amount","Date","Method","Reference"], ...(payments.data ?? []).map((p) => { const s = studentMap.get(p.student_id); return [p.receipt_number, s ? `${s.first_name} ${s.last_name}` : "", Number(p.amount).toFixed(2), new Date(p.payment_date).toISOString(), p.method, p.reference ?? ""]; })])}><Download className="size-4" />Export payment history</Button></div></TabsContent>

        <TabsContent value="fee-types"><Card><CardHeader><CardTitle className="text-base">Fee types</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div><Label>Name</Label><Input value={feeType.name} onChange={(e) => setFeeType({ ...feeType, name: e.target.value })} placeholder="Tuition" /></div><div><Label>Default amount</Label><Input type="number" min="0.01" step="0.01" value={feeType.amount} onChange={(e) => setFeeType({ ...feeType, amount: e.target.value })} placeholder="150000" /></div><div><Label>Frequency</Label><Select value={feeType.frequency} onValueChange={(v) => setFeeType({ ...feeType, frequency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="one_time">One time</SelectItem><SelectItem value="term">Term</SelectItem><SelectItem value="session">Session</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div><div><Label>Description</Label><Input value={feeType.description} onChange={(e) => setFeeType({ ...feeType, description: e.target.value })} placeholder="Optional" /></div><div><Button onClick={() => createFeeType.mutate()} disabled={createFeeType.isPending}>{createFeeType.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Create fee type</Button></div></CardContent></Card><div className="mt-4 space-y-2">{(feeTypes.data ?? []).map((f) => <div key={f.id} className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-medium">{f.name}</p><p className="text-xs text-muted-foreground">{money(f.amount)} · {f.frequency}</p></div><Badge variant={f.is_active ? "default" : "secondary"}>{f.is_active ? "Active" : "Inactive"}</Badge></div>)}</div></TabsContent>
      </Tabs>
    </div>
  </AppShell>;
}
