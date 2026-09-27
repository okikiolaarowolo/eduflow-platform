import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, Loader2, MailPlus, Search, ShieldCheck, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/staff-management")({ component: StaffManagementPage });

type StaffRole = "principal" | "secretary" | "teacher";
type StaffRow = { id: string; full_name: string; email: string | null; phone: string | null; roles: string[]; teacher: { user_id: string; staff_id: string; is_active: boolean } | null };
const ROLE_OPTIONS: StaffRole[] = ["principal", "secretary", "teacher"];

async function staffAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("staff-admin", { body });
  if (error) throw new Error(error.message);
  if (!data?.ok && data?.error) throw new Error(data.error);
  return data as { staff?: StaffRow[]; invited?: boolean; role?: StaffRole };
}

function StaffManagementPage() {
  const { primaryRole } = useAuth();
  const schoolId = useSchoolId();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role: "secretary" as StaffRole, staff_id: "" });

  const staffQuery = useQuery({
    queryKey: ["staff-management", schoolId],
    enabled: !!schoolId && primaryRole === "school_admin",
    queryFn: async () => (await staffAdmin({ action: "list" })).staff ?? [],
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (staffQuery.data ?? []).filter((staff) => !term || `${staff.full_name} ${staff.email ?? ""} ${staff.roles.join(" ")}`.toLowerCase().includes(term));
  }, [staffQuery.data, search]);

  const invite = useMutation({
    mutationFn: () => staffAdmin({ action: "invite", ...form }),
    onSuccess: async (result) => {
      toast.success(result.invited ? "Invitation sent" : "Staff account updated");
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "", role: "secretary", staff_id: "" });
      await queryClient.invalidateQueries({ queryKey: ["staff-management", schoolId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: StaffRole }) => staffAdmin({ action: "update-role", user_id: userId, role }),
    onSuccess: async () => {
      toast.success("Staff role updated");
      await queryClient.invalidateQueries({ queryKey: ["staff-management", schoolId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (primaryRole !== "school_admin") {
    return <AppShell title="Staff Management" description="Manage school staff accounts and roles"><EmptyState icon={ShieldCheck} title="School Admin access required" description="Only the school's administrator can invite staff and change staff roles." /></AppShell>;
  }

  return (
    <AppShell
      title="Staff Management"
      description="Invite staff and control their EduFlow workspace roles"
      actions={<Button onClick={() => setOpen(true)}><UserRoundPlus className="size-4" /> Add staff</Button>}
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardDescription>Total staff accounts</CardDescription><CardTitle>{staffQuery.data?.length ?? "—"}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Teachers</CardDescription><CardTitle>{staffQuery.data?.filter((s) => s.roles.includes("teacher")).length ?? "—"}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Administrative staff</CardDescription><CardTitle>{staffQuery.data?.filter((s) => s.roles.some((r) => r === "principal" || r === "secretary")).length ?? "—"}</CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="size-5" /> School staff</CardTitle><CardDescription>Each account sees only the workspace and tools allowed by its assigned role.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search staff by name, email or role" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            {staffQuery.isLoading ? <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div> : staffQuery.isError ? <p className="text-sm text-destructive">Could not load staff accounts.</p> : rows.length === 0 ? <EmptyState icon={BriefcaseBusiness} title="No staff accounts yet" description="Invite your principal, secretary and teachers to start using EduFlow." action={<Button onClick={() => setOpen(true)}><MailPlus className="size-4" /> Invite staff</Button>} /> : <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="hidden md:table-cell">Email</TableHead><TableHead className="hidden lg:table-cell">Teacher ID</TableHead><TableHead className="text-right">Change role</TableHead></TableRow></TableHeader><TableBody>{rows.map((staff) => { const role = (staff.roles.find((r) => ROLE_OPTIONS.includes(r as StaffRole)) ?? "") as StaffRole; return <TableRow key={staff.id}><TableCell><div className="font-medium">{staff.full_name}</div><div className="text-xs text-muted-foreground md:hidden">{staff.email ?? "No email"}</div></TableCell><TableCell><Badge variant="secondary">{role ? ROLE_LABELS[role as AppRole] : "No staff role"}</Badge></TableCell><TableCell className="hidden md:table-cell text-muted-foreground">{staff.email ?? "—"}</TableCell><TableCell className="hidden lg:table-cell">{staff.teacher?.staff_id ?? "—"}</TableCell><TableCell className="text-right">{role ? <Select value={role} onValueChange={(value) => changeRole.mutate({ userId: staff.id, role: value as StaffRole })}><SelectTrigger className="ml-auto w-36"><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{ROLE_LABELS[option]}</SelectItem>)}</SelectContent></Select> : "—"}</TableCell></TableRow>; })}</TableBody></Table></div>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Invite staff member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Jane Adeyemi" /></div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="staff@school.com" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label>Role *</Label><Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as StaffRole })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{ROLE_LABELS[option]}</SelectItem>)}</SelectContent></Select></div><div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" /></div></div>
            {form.role === "teacher" && <div><Label>Teacher Staff ID *</Label><Input value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} placeholder="e.g. TCH-001" /></div>}
            <div className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">EduFlow will send an invitation email. After the staff member accepts it, their account will open the workspace for the selected role.</div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => invite.mutate()} disabled={invite.isPending}>{invite.isPending && <Loader2 className="size-4 animate-spin" />}<MailPlus className="size-4" /> Send invitation</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
