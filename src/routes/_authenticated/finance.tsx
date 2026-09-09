import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Download, Loader2, Plus, Receipt, Search } from "lucide-react";
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
import { api } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/finance")({ component: FinancePage });

type FeeStructure = { id: string; name: string; description: string | null; amount: number; currency: string; class_id: string | null; due_date: string | null; is_active: boolean };
type StudentFee = { id: string; student_id: string; fee_structure_id: string | null; title: string; amount_due: number; amount_paid: number; status: string; due_date: string | null };
type Payment = { id: string; student_fee_id: string; student_id: string; amount: number; method: string; reference: string | null; receipt_number: string; paid_at: string; note: string | null };

function csv(name: string, rows: string[][]) {
  const text = rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
const money = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function FinancePage() {
  const schoolId = useSchoolId();
  const { primaryRole } = useAuth();
  const qc = useQueryClient();
  const canManage = primaryRole === "secretary" || primaryRole === "school_admin" || primaryRole === "principal";

  const students = useQuery({ queryKey: ["students", schoolId], enabled: !!schoolId && canManage, queryFn: () => api.students(schoolId!) });
  const classes = useQuery({ queryKey: ["classes", schoolId], enabled: !!schoolId && canManage, queryFn: () => api.classes(schoolId!) });
  const structures = useQuery({
    queryKey: ["fee-structures", schoolId], enabled: !!schoolId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_structures").select("id,name,description,amount,currency,class_id,due_date,is_active").eq("school_id", schoolId!).order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as FeeStructure[];
    },
  });
  const charges = useQuery({
    queryKey: ["student-fees", schoolId], enabled: !!schoolId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("student_fees").select("id,student_id,fee_structure_id,title,amount_due,amount_paid,status,due_date").eq("school_id", schoolId!).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as StudentFee[];
    },
  });
  const payments = useQuery({
    queryKey: ["fee-payments", schoolId], enabled: !!schoolId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_payments").select("id,student_fee_id,student_id,amount,method,reference,receipt_number,paid_at,note").eq("school_id", schoolId!).order("paid_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Payment[];
    },
  });

  const [fee, setFee] = useState({ name: "", amount: "", classId: "all", dueDate: "", description: "" });
  const [assign, setAssign] = useState({ structureId: "", target: "student", studentId: "", classId: "" });
  const [payment, setPayment] = useState({ chargeId: "", amount: "", method: "cash", reference: "", note: "" });
  const [search, setSearch] = useState("");

  const createStructure = useMutation({
    mutationFn: async () => {
      if (!schoolId || !fee.name.trim() || !fee.amount || Number(fee.amount) <= 0) throw new Error("Fee name and a positive amount are required");
      const { error } = await supabase.from("fee_structures").insert({
        school_id: schoolId, name: fee.name.trim(), amount: Number(fee.amount),
        class_id: fee.classId === "all" ? null : fee.classId,
        due_date: fee.dueDate || null, description: fee.description.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setFee({ name: "", amount: "", classId: "all", dueDate: "", description: "" }); toast.success("Fee type created"); await qc.invalidateQueries({ queryKey: ["fee-structures", schoolId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignFee = useMutation({
    mutationFn: async () => {
      if (!schoolId || !assign.structureId) throw new Error("Select a fee type");
      const structure = (structures.data ?? []).find((s) => s.id === assign.structureId);
      if (!structure) throw new Error("Fee type not found");
      const targets = assign.target === "class"
        ? (students.data ?? []).filter((s) => !s.is_archived && s.class_id === assign.classId)
        : (students.data ?? []).filter((s) => s.id === assign.studentId);
      if (!targets.length) throw new Error("No students match this selection");
      const existing = new Set((charges.data ?? []).filter((c) => c.fee_structure_id === structure.id).map((c) => c.student_id));
      const rows = targets.filter((s) => !existing.has(s.id)).map((s) => ({
        school_id: schoolId, student_id: s.id, fee_structure_id: structure.id, title: structure.name,
        amount_due: Number(structure.amount), due_date: structure.due_date,
      }));
      if (!rows.length) throw new Error("These students already have this fee assigned");
      const { error } = await supabase.from("student_fees").insert(rows);
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: async (count) => { setAssign({ structureId: "", target: "student", studentId: "", classId: "" }); toast.success(`Fee assigned to ${count} student(s)`); await qc.invalidateQueries({ queryKey: ["student-fees", schoolId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!schoolId || !payment.chargeId || !payment.amount || Number(payment.amount) <= 0) throw new Error("Select an outstanding fee and enter a valid amount");
      const charge = (charges.data ?? []).find((c) => c.id === payment.chargeId);
      if (!charge) throw new Error("Fee charge not found");
      const balance = Number(charge.amount_due) - Number(charge.amount_paid);
      if (Number(payment.amount) > balance + 0.0001) throw new Error("Payment exceeds the outstanding balance");
      const { error } = await supabase.from("fee_payments").insert({
        school_id: schoolId, student_fee_id: charge.id, student_id: charge.student_id,
        amount: Number(payment.amount), method: payment.method,
        reference: payment.reference.trim() || null, note: payment.note.trim() || null, receipt_number: "",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setPayment({ chargeId: "", amount: "", method: "cash", reference: "", note: "" });
      toast.success("Payment recorded");
      await Promise.all([qc.invalidateQueries({ queryKey: ["fee-payments", schoolId] }), qc.invalidateQueries({ queryKey: ["student-fees", schoolId] })]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (charges.data ?? []).map((c) => {
      const student = (students.data ?? []).find((x) => x.id === c.student_id);
      const paid = Number(c.amount_paid);
      return {
        ...c, paid,
        studentName: student ? `${student.first_name} ${student.last_name}` : "Unknown student",
        studentCode: student?.student_id ?? "",
        balance: Math.max(Number(c.amount_due) - paid, 0),
      };
    }).filter((r) => !s || `${r.studentName} ${r.studentCode} ${r.title}`.toLowerCase().includes(s));
  }, [charges.data, students.data, search]);

  const totals = rows.reduce((x, r) => ({ due: x.due + Number(r.amount_due), paid: x.paid + r.paid, balance: x.balance + r.balance }), { due: 0, paid: 0, balance: 0 });
  const outstanding = rows.filter((r) => r.balance > 0);
  const loading = students.isLoading || structures.isLoading || charges.isLoading || payments.isLoading;

  if (!canManage) return <AppShell title="Finance" description="Fees and payments"><EmptyState icon={Banknote} title="Finance access required" description="Finance is available to school managers and the Secretary." /></AppShell>;
  if (loading) return <AppShell title="Finance"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></AppShell>;
  if (charges.isError || structures.isError) return <AppShell title="Finance"><p className="text-sm text-destructive">Finance records could not be loaded. Refresh and try again.</p></AppShell>;

  return (
    <AppShell title="Finance" description="Fees, payments, outstanding balances and receipts">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Expected</p><p className="mt-1 text-2xl font-bold">{money(totals.due)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Collected</p><p className="mt-1 text-2xl font-bold">{money(totals.paid)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Outstanding</p><p className="mt-1 text-2xl font-bold">{money(totals.balance)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Payments</p><p className="mt-1 text-2xl font-bold">{(payments.data ?? []).length}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="balances">
          <TabsList className="flex-wrap">
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="fees">Fee types</TabsTrigger>
            <TabsTrigger value="assign">Assign fees</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="balances" className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search student or fee" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <Button variant="outline" onClick={() => csv("eduflow-fee-status.csv", [["Student ID", "Student", "Fee", "Due", "Paid", "Balance", "Status"], ...rows.map((r) => [r.studentCode, r.studentName, r.title, Number(r.amount_due).toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2), r.status])])}><Download className="size-4" />Export CSV</Button>
            </div>
            {rows.length === 0 ? <EmptyState icon={Receipt} title="No fee charges yet" description="Create a fee type and assign it to students to start tracking balances." /> : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left"><th className="p-3">Student</th><th className="p-3">Fee</th><th className="p-3">Due</th><th className="p-3">Paid</th><th className="p-3">Balance</th><th className="p-3">Status</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3"><p className="font-medium">{r.studentName}</p><p className="text-xs text-muted-foreground">{r.studentCode}</p></td>
                      <td className="p-3">{r.title}</td>
                      <td className="p-3">{money(Number(r.amount_due))}</td>
                      <td className="p-3">{money(r.paid)}</td>
                      <td className="p-3 font-semibold">{money(r.balance)}</td>
                      <td className="p-3"><Badge variant={r.status === "paid" ? "default" : r.status === "partial" ? "secondary" : "destructive"}>{r.status}</Badge></td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="fees">
            <Card>
              <CardHeader><CardTitle className="text-base">Create fee type</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div><Label>Name</Label><Input value={fee.name} onChange={(e) => setFee({ ...fee, name: e.target.value })} placeholder="Tuition" /></div>
                <div><Label>Amount</Label><Input type="number" min="0" step="0.01" value={fee.amount} onChange={(e) => setFee({ ...fee, amount: e.target.value })} placeholder="150000" /></div>
                <div><Label>Applies to</Label><Select value={fee.classId} onValueChange={(v) => setFee({ ...fee, classId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All classes</SelectItem>{(classes.data ?? []).filter((c) => !c.is_archived).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Due date</Label><Input type="date" value={fee.dueDate} onChange={(e) => setFee({ ...fee, dueDate: e.target.value })} /></div>
                <Textarea value={fee.description} onChange={(e) => setFee({ ...fee, description: e.target.value })} placeholder="Description (optional)" />
                <div className="flex items-end"><Button onClick={() => createStructure.mutate()} disabled={createStructure.isPending}>{createStructure.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Create fee type</Button></div>
              </CardContent>
            </Card>
            <div className="mt-4 space-y-2">
              {(structures.data ?? []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No fee types yet.</p> : (structures.data ?? []).map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-xl border p-4">
                  <div><p className="font-medium">{f.name}</p><p className="text-xs text-muted-foreground">{money(Number(f.amount))}{f.class_id ? ` · ${(classes.data ?? []).find((c) => c.id === f.class_id)?.name ?? "Class"}` : " · All classes"}{f.due_date ? ` · due ${f.due_date}` : ""}</p></div>
                  <Badge variant={f.is_active ? "default" : "secondary"}>{f.is_active ? "Active" : "Inactive"}</Badge>
                </div>))}
            </div>
          </TabsContent>

          <TabsContent value="assign">
            <Card>
              <CardHeader><CardTitle className="text-base">Assign a fee</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Select value={assign.structureId} onValueChange={(v) => setAssign({ ...assign, structureId: v })}><SelectTrigger><SelectValue placeholder="Fee type" /></SelectTrigger><SelectContent>{(structures.data ?? []).filter((f) => f.is_active).map((f) => <SelectItem key={f.id} value={f.id}>{f.name} · {money(Number(f.amount))}</SelectItem>)}</SelectContent></Select>
                <Select value={assign.target} onValueChange={(v) => setAssign({ ...assign, target: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="student">One student</SelectItem><SelectItem value="class">Whole class</SelectItem></SelectContent></Select>
                {assign.target === "student"
                  ? <Select value={assign.studentId} onValueChange={(v) => setAssign({ ...assign, studentId: v })}><SelectTrigger><SelectValue placeholder="Student" /></SelectTrigger><SelectContent>{(students.data ?? []).filter((s) => !s.is_archived).map((s) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.student_id}</SelectItem>)}</SelectContent></Select>
                  : <Select value={assign.classId} onValueChange={(v) => setAssign({ ...assign, classId: v })}><SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger><SelectContent>{(classes.data ?? []).filter((c) => !c.is_archived).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>}
                <div className="flex items-end"><Button onClick={() => assignFee.mutate()} disabled={assignFee.isPending}>{assignFee.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Assign fee</Button></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader><CardTitle className="text-base">Record payment</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Select value={payment.chargeId} onValueChange={(v) => { const r = rows.find((x) => x.id === v); setPayment({ ...payment, chargeId: v, amount: r ? String(r.balance) : payment.amount }); }}>
                  <SelectTrigger><SelectValue placeholder="Outstanding fee" /></SelectTrigger>
                  <SelectContent>{outstanding.map((r) => <SelectItem key={r.id} value={r.id}>{r.studentName} · {r.title} · {money(r.balance)} due</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min="0" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} placeholder="Payment amount" />
                <Select value={payment.method} onValueChange={(v) => setPayment({ ...payment, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank_transfer">Bank transfer</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="pos">POS</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select>
                <Input value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="Reference (optional)" />
                <Textarea value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} placeholder="Note (optional)" />
                <div className="flex items-end"><Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>{recordPayment.isPending ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}Record payment</Button></div>
              </CardContent>
            </Card>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => csv("eduflow-payment-history.csv", [["Receipt", "Student ID", "Student", "Amount", "Paid at", "Method", "Reference"], ...(payments.data ?? []).map((p) => { const s = (students.data ?? []).find((x) => x.id === p.student_id); return [p.receipt_number, s?.student_id ?? "", s ? `${s.first_name} ${s.last_name}` : "", Number(p.amount).toFixed(2), new Date(p.paid_at).toISOString(), p.method, p.reference ?? ""]; })])}><Download className="size-4" />Export payment history</Button>
            </div>
            <div className="mt-3 space-y-2">
              {(payments.data ?? []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p> : (payments.data ?? []).slice(0, 40).map((p) => {
                const s = (students.data ?? []).find((x) => x.id === p.student_id);
                return <div key={p.id} className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-medium">{s ? `${s.first_name} ${s.last_name}` : "Unknown student"}</p><p className="text-xs text-muted-foreground">{p.receipt_number} · {new Date(p.paid_at).toLocaleString()} · {p.method}</p></div><p className="font-semibold">{money(Number(p.amount))}</p></div>;
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
