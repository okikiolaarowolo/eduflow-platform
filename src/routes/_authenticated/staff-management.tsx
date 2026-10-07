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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SubjectDepartment, SubjectRow, SubjectSchoolLevel } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/staff-management")({ component: StaffManagementPage });

type StaffRole = "principal" | "secretary" | "teacher";
type TeachingLevel = "junior_secondary" | "senior_secondary" | "both";
type StaffRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  teacher: {
    user_id: string;
    staff_id: string;
    is_active: boolean;
    teaching_level: TeachingLevel;
    department: SubjectDepartment | null;
    subject_ids: string[];
  } | null;
};

const ROLE_OPTIONS: StaffRole[] = ["principal", "secretary", "teacher"];
const DEPARTMENTS: { value: SubjectDepartment; label: string }[] = [
  { value: "science", label: "Science" },
  { value: "humanities", label: "Humanities" },
  { value: "business", label: "Business" },
];
const LEVELS: { value: TeachingLevel; label: string }[] = [
  { value: "junior_secondary", label: "Junior Secondary (JSS)" },
  { value: "senior_secondary", label: "Senior Secondary (SS)" },
  { value: "both", label: "JSS + SS" },
];

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
  const [editingTeacher, setEditingTeacher] = useState<StaffRow | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "secretary" as StaffRole,
    staff_id: "",
    teaching_level: "junior_secondary" as TeachingLevel,
    department: "" as SubjectDepartment | "",
    subject_ids: [] as string[],
  });

  const staffQuery = useQuery({
    queryKey: ["staff-management", schoolId],
    enabled: !!schoolId && primaryRole === "school_admin",
    queryFn: async () => (await staffAdmin({ action: "list" })).staff ?? [],
  });

  const subjectsQuery = useQuery({
    queryKey: ["subjects", schoolId],
    enabled: !!schoolId && primaryRole === "school_admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,school_id,name,code,description,school_level,department,is_archived")
        .eq("school_id", schoolId!)
        .eq("is_archived", false)
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as SubjectRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (staffQuery.data ?? []).filter(
      (staff) => !term || `${staff.full_name} ${staff.email ?? ""} ${staff.roles.join(" ")}`.toLowerCase().includes(term),
    );
  }, [staffQuery.data, search]);

  const availableSubjects = useMemo(() => {
    const level = form.teaching_level;
    const department = form.department;
    return (subjectsQuery.data ?? []).filter((subject) => {
      const levelMatches = level === "both" || subject.school_level === "both" || subject.school_level === level;
      if (!levelMatches) return false;
      if (level === "junior_secondary") return subject.department === null;
      if (!department) return subject.department === null || subject.school_level === "both";
      return subject.department === null || subject.department === department;
    });
  }, [subjectsQuery.data, form.teaching_level, form.department]);

  const resetForm = () =>
    setForm({
      full_name: "",
      email: "",
      phone: "",
      role: "secretary",
      staff_id: "",
      teaching_level: "junior_secondary",
      department: "",
      subject_ids: [],
    });

  const openInvite = () => {
    setEditingTeacher(null);
    resetForm();
    setOpen(true);
  };

  const openTeacherConfig = (staff: StaffRow) => {
    if (!staff.teacher) return;
    setEditingTeacher(staff);
    setForm({
      full_name: staff.full_name,
      email: staff.email ?? "",
      phone: staff.phone ?? "",
      role: "teacher",
      staff_id: staff.teacher.staff_id,
      teaching_level: staff.teacher.teaching_level,
      department: staff.teacher.department ?? "",
      subject_ids: staff.teacher.subject_ids,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: () =>
      staffAdmin({
        action: editingTeacher ? "configure-teacher" : "invite",
        ...(editingTeacher ? { user_id: editingTeacher.id } : {}),
        ...form,
        department: form.department || null,
      }),
    onSuccess: async (result) => {
      toast.success(editingTeacher ? "Teaching profile updated" : result.invited ? "Invitation sent" : "Staff account updated");
      setOpen(false);
      setEditingTeacher(null);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["staff-management", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["teachers", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["teacher_subjects", schoolId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: StaffRole }) =>
      staffAdmin({ action: "update-role", user_id: userId, role }),
    onSuccess: async () => {
      toast.success("Staff role updated");
      await queryClient.invalidateQueries({ queryKey: ["staff-management", schoolId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (primaryRole !== "school_admin") {
    return (
      <AppShell title="Staff Management" description="Manage school staff accounts and teaching profiles">
        <EmptyState icon={ShieldCheck} title="School Admin access required" description="Only the school's administrator can invite staff and change staff roles." />
      </AppShell>
    );
  }

  const toggleSubject = (subjectId: string, checked: boolean) =>
    setForm((current) => ({
      ...current,
      subject_ids: checked ? [...current.subject_ids, subjectId] : current.subject_ids.filter((id) => id !== subjectId),
    }));

  return (
    <AppShell
      title="Staff Management"
      description="Invite staff and configure exactly what each teacher teaches"
      actions={
        <Button onClick={openInvite}>
          <UserRoundPlus className="size-4" /> Add staff
        </Button>
      }
    >
      <div className="space-y-6">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Teaching setup</CardTitle>
            <CardDescription>
              Teachers no longer need to describe their subjects manually. Select JSS or SS, choose the SS department when applicable, then tick the subjects from the school's configured curriculum.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardDescription>Total staff accounts</CardDescription><CardTitle>{staffQuery.data?.length ?? "—"}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Teachers</CardDescription><CardTitle>{staffQuery.data?.filter((s) => s.roles.includes("teacher")).length ?? "—"}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Administrative staff</CardDescription><CardTitle>{staffQuery.data?.filter((s) => s.roles.some((r) => r === "principal" || r === "secretary")).length ?? "—"}</CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="size-5" /> School staff</CardTitle>
            <CardDescription>Each account sees only the workspace and tools allowed by its assigned role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search staff by name, email or role" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {staffQuery.isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
            ) : staffQuery.isError ? (
              <p className="text-sm text-destructive">Could not load staff accounts.</p>
            ) : rows.length === 0 ? (
              <EmptyState icon={BriefcaseBusiness} title="No staff accounts yet" description="Invite your principal, secretary and teachers to start using EduFlow." action={<Button onClick={openInvite}><MailPlus className="size-4" /> Invite staff</Button>} />
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="hidden md:table-cell">Teaching profile</TableHead><TableHead className="hidden lg:table-cell">Email</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.map((staff) => {
                      const role = (staff.roles.find((r) => ROLE_OPTIONS.includes(r as StaffRole)) ?? "") as StaffRole;
                      const teacher = staff.teacher;
                      return (
                        <TableRow key={staff.id}>
                          <TableCell><div className="font-medium">{staff.full_name}</div><div className="text-xs text-muted-foreground md:hidden">{staff.email ?? "No email"}</div></TableCell>
                          <TableCell><Badge variant="secondary">{role ? ROLE_LABELS[role as AppRole] : "No staff role"}</Badge></TableCell>
                          <TableCell className="hidden md:table-cell">
                            {teacher ? (
                              <div>
                                <div className="text-sm font-medium">{teacher.teaching_level === "junior_secondary" ? "JSS" : teacher.teaching_level === "senior_secondary" ? "SS" : "JSS + SS"}{teacher.department ? ` · ${teacher.department}` : ""}</div>
                                <div className="text-xs text-muted-foreground">{teacher.subject_ids.length} subject{teacher.subject_ids.length === 1 ? "" : "s"} selected</div>
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">{staff.email ?? "—"}</TableCell>
                          <TableCell className="space-x-1 text-right">
                            {role === "teacher" && teacher && <Button variant="ghost" size="sm" onClick={() => openTeacherConfig(staff)}>Configure</Button>}
                            {role && <Select value={role} onValueChange={(value) => changeRole.mutate({ userId: staff.id, role: value as StaffRole })}><SelectTrigger className="ml-auto w-32"><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{ROLE_LABELS[option]}</SelectItem>)}</SelectContent></Select>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingTeacher ? "Configure teaching profile" : "Invite staff member"}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            {!editingTeacher && (
              <>
                <div><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Jane Adeyemi" /></div>
                <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="staff@school.com" /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Role *</Label><Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as StaffRole })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{ROLE_LABELS[option]}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" /></div>
                </div>
                {form.role === "teacher" && <div><Label>Teacher Staff ID *</Label><Input value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} placeholder="e.g. TCH-001" /></div>}
              </>
            )}

            {(editingTeacher || form.role === "teacher") && (
              <>
                <div className="rounded-xl border bg-muted/40 p-4">
                  <p className="text-sm font-semibold">1. Teaching level</p>
                  <p className="mt-1 text-xs text-muted-foreground">This controls which part of the curriculum the teacher sees.</p>
                  <div className="mt-3"><Select value={form.teaching_level} onValueChange={(value) => setForm({ ...form, teaching_level: value as TeachingLevel, department: value === "junior_secondary" ? "" : form.department, subject_ids: [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEVELS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
                </div>

                {form.teaching_level !== "junior_secondary" && (
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <p className="text-sm font-semibold">2. Senior Secondary department</p>
                    <p className="mt-1 text-xs text-muted-foreground">Choose Science, Humanities or Business for SS subjects.</p>
                    <div className="mt-3"><Select value={form.department || undefined} onValueChange={(value) => setForm({ ...form, department: value as SubjectDepartment, subject_ids: [] })}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{DEPARTMENTS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                )}

                <div className="rounded-xl border bg-muted/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-sm font-semibold">3. Subjects</p><p className="mt-1 text-xs text-muted-foreground">Select the subjects this teacher normally teaches.</p></div>
                    <Badge variant="secondary">{form.subject_ids.length} selected</Badge>
                  </div>
                  {!form.department && form.teaching_level !== "junior_secondary" ? (
                    <p className="mt-4 text-sm text-muted-foreground">Select an SS department first.</p>
                  ) : subjectsQuery.isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin" /></div>
                  ) : availableSubjects.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No matching subjects yet. Add and categorize subjects in the Subjects workspace first.</div>
                  ) : (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {availableSubjects.map((subject) => (
                        <label key={subject.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-background">
                          <Checkbox checked={form.subject_ids.includes(subject.id)} onCheckedChange={(checked) => toggleSubject(subject.id, checked === true)} />
                          <span className="min-w-0"><span className="block text-sm font-medium">{subject.name}</span><span className="block text-xs text-muted-foreground">{subject.school_level === "junior_secondary" ? "JSS" : subject.school_level === "senior_secondary" ? "SS" : "JSS + SS"}{subject.department ? ` · ${subject.department}` : ""}</span></span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
              {editingTeacher ? "Save this profile and the teacher's workspace will use the selected subjects." : "EduFlow will send an invitation email. After the teacher accepts, their workspace opens with the subjects selected here."}
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="size-4 animate-spin" />}{editingTeacher ? "Save teaching profile" : "Send invitation"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
