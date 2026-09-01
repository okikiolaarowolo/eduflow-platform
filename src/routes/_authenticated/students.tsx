import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { api, logActivity, type StudentRow } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/students")({
  component: StudentsPage,
});

type FormState = {
  first_name: string;
  last_name: string;
  student_id: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  class_id: string;
  admission_date: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
};

const EMPTY: FormState = {
  first_name: "",
  last_name: "",
  student_id: "",
  email: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  class_id: "",
  admission_date: "",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
};

function StudentsPage() {
  const schoolId = useSchoolId();
  const { user, profile, isManager } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const studentsQuery = useQuery({
    queryKey: ["students", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.students(schoolId!),
  });
  const classesQuery = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.classes(schoolId!),
  });

  const classMap = useMemo(
    () => new Map((classesQuery.data ?? []).map((c) => [c.id, c.name])),
    [classesQuery.data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (studentsQuery.data ?? []).filter((s) => {
      if (s.is_archived !== showArchived) return false;
      if (classFilter !== "all" && s.class_id !== classFilter) return false;
      if (!term) return true;
      return `${s.first_name} ${s.last_name} ${s.student_id} ${s.email ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [studentsQuery.data, search, classFilter, showArchived]);

  const save = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      if (!form.first_name.trim() || !form.last_name.trim() || !form.student_id.trim()) {
        throw new Error("First name, last name and student ID are required");
      }
      const payload = {
        school_id: schoolId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        student_id: form.student_id.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        class_id: form.class_id || null,
        admission_date: form.admission_date || null,
        guardian_name: form.guardian_name.trim() || null,
        guardian_phone: form.guardian_phone.trim() || null,
        guardian_email: form.guardian_email.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("students").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("students").insert(payload);
        if (error) throw new Error(error.message);
      }
      if (user) {
        await logActivity({
          schoolId,
          actorId: user.id,
          actorName: profile?.full_name || user.email || "Admin",
          action: editing ? "updated" : "created",
          entity: "student",
          description: `${editing ? "Updated" : "Added"} student ${payload.first_name} ${payload.last_name}`,
        });
      }
    },
    onSuccess: async () => {
      toast.success(editing ? "Student updated" : "Student added");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ["students", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleArchive = useMutation({
    mutationFn: async (student: StudentRow) => {
      const { error } = await supabase
        .from("students")
        .update({ is_archived: !student.is_archived })
        .eq("id", student.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Student updated");
      await queryClient.invalidateQueries({ queryKey: ["students", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(student: StudentRow) {
    setEditing(student);
    setForm({
      first_name: student.first_name,
      last_name: student.last_name,
      student_id: student.student_id,
      email: student.email ?? "",
      phone: student.phone ?? "",
      date_of_birth: student.date_of_birth ?? "",
      gender: student.gender ?? "",
      class_id: student.class_id ?? "",
      admission_date: student.admission_date ?? "",
      guardian_name: student.guardian_name ?? "",
      guardian_phone: student.guardian_phone ?? "",
      guardian_email: student.guardian_email ?? "",
    });
    setOpen(true);
  }

  return (
    <AppShell
      title="Students"
      description="Enrolment records for your school"
      actions={
        isManager ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add student
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit student" : "Add student"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>First name *</Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Last name *</Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Student ID *</Label>
                  <Input
                    value={form.student_id}
                    onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Class</Label>
                  <Select
                    value={form.class_id || "none"}
                    onValueChange={(v) => setForm({ ...form, class_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(classesQuery.data ?? [])
                        .filter((c) => !c.is_archived)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Date of birth</Label>
                  <Input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select
                    value={form.gender || "unset"}
                    onValueChange={(v) => setForm({ ...form, gender: v === "unset" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Not specified</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Admission date</Label>
                  <Input
                    type="date"
                    value={form.admission_date}
                    onChange={(e) => setForm({ ...form, admission_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Guardian name</Label>
                  <Input
                    value={form.guardian_name}
                    onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Guardian phone</Label>
                  <Input
                    value={form.guardian_phone}
                    onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Guardian email</Label>
                  <Input
                    type="email"
                    value={form.guardian_email}
                    onChange={(e) => setForm({ ...form, guardian_email: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="size-4 animate-spin" />}
                  {editing ? "Save changes" : "Add student"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID or email"
              className="pl-9"
            />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classesQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show active" : "Show archived"}
          </Button>
        </div>

        {studentsQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : studentsQuery.isError ? (
          <p className="text-sm text-destructive">Could not load students.</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={showArchived ? "No archived students" : "No students yet"}
            description="Add your first student to begin building class registers and records."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="hidden md:table-cell">Guardian</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/students/$studentId"
                        params={{ studentId: s.id }}
                        className="hover:underline"
                      >
                        {s.first_name} {s.last_name}
                      </Link>
                    </TableCell>
                    <TableCell>{s.student_id}</TableCell>
                    <TableCell>
                      {s.class_id ? (
                        <Badge variant="secondary">{classMap.get(s.class_id) ?? "—"}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {s.guardian_name ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {isManager && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleArchive.mutate(s)}
                            disabled={toggleArchive.isPending}
                          >
                            {s.is_archived ? "Restore" : "Archive"}
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
