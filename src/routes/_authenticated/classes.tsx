import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { api, logActivity, type ClassRow } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/classes")({
  component: ClassesPage,
});

const EMPTY = { name: "", level: "", section: "", capacity: "" };

function ClassesPage() {
  const schoolId = useSchoolId();
  const { user, profile, isManager } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [assignFor, setAssignFor] = useState<ClassRow | null>(null);

  const classesQuery = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.classes(schoolId!),
  });
  const studentsQuery = useQuery({
    queryKey: ["students", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.students(schoolId!),
  });
  const teachersQuery = useQuery({
    queryKey: ["teachers", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.teachers(schoolId!),
  });
  const subjectsQuery = useQuery({
    queryKey: ["subjects", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.subjects(schoolId!),
  });
  const teacherClassesQuery = useQuery({
    queryKey: ["teacher_classes", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.teacherClasses(schoolId!),
  });
  const classSubjectsQuery = useQuery({
    queryKey: ["class_subjects", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.classSubjects(schoolId!),
  });

  const studentCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of studentsQuery.data ?? []) {
      if (s.class_id && !s.is_archived) map.set(s.class_id, (map.get(s.class_id) ?? 0) + 1);
    }
    return map;
  }, [studentsQuery.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (classesQuery.data ?? []).filter((c) => {
      if (c.is_archived !== showArchived) return false;
      if (!term) return true;
      return `${c.name} ${c.level ?? ""} ${c.section ?? ""}`.toLowerCase().includes(term);
    });
  }, [classesQuery.data, search, showArchived]);

  const save = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      if (!form.name.trim()) throw new Error("Class name is required");
      const payload = {
        school_id: schoolId,
        name: form.name.trim(),
        level: form.level.trim() || null,
        section: form.section.trim() || null,
        capacity: form.capacity ? Number(form.capacity) : null,
      };
      if (payload.capacity !== null && (!Number.isFinite(payload.capacity) || payload.capacity < 0)) {
        throw new Error("Capacity must be a positive number");
      }
      if (editing) {
        const { error } = await supabase.from("classes").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("classes").insert(payload);
        if (error) throw new Error(error.message);
      }
      if (user) {
        await logActivity({
          schoolId,
          actorId: user.id,
          actorName: profile?.full_name || user.email || "Admin",
          action: editing ? "updated" : "created",
          entity: "class",
          description: `${editing ? "Updated" : "Created"} class ${payload.name}`,
        });
      }
    },
    onSuccess: async () => {
      toast.success(editing ? "Class updated" : "Class created");
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      await queryClient.invalidateQueries({ queryKey: ["classes", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleArchive = useMutation({
    mutationFn: async (klass: ClassRow) => {
      const { error } = await supabase
        .from("classes")
        .update({ is_archived: !klass.is_archived })
        .eq("id", klass.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Class updated");
      await queryClient.invalidateQueries({ queryKey: ["classes", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleTeacher = useMutation({
    mutationFn: async ({ classId, teacherId, assigned }: { classId: string; teacherId: string; assigned: boolean }) => {
      if (!schoolId) throw new Error("No school");
      if (assigned) {
        const row = (teacherClassesQuery.data ?? []).find(
          (tc) => tc.class_id === classId && tc.teacher_id === teacherId,
        );
        if (!row) return;
        const { error } = await supabase.from("teacher_classes").delete().eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("teacher_classes")
          .insert({ school_id: schoolId, class_id: classId, teacher_id: teacherId });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher_classes", schoolId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSubject = useMutation({
    mutationFn: async ({ classId, subjectId, assigned }: { classId: string; subjectId: string; assigned: boolean }) => {
      if (!schoolId) throw new Error("No school");
      if (assigned) {
        const row = (classSubjectsQuery.data ?? []).find(
          (cs) => cs.class_id === classId && cs.subject_id === subjectId,
        );
        if (!row) return;
        const { error } = await supabase.from("class_subjects").delete().eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("class_subjects")
          .insert({ school_id: schoolId, class_id: classId, subject_id: subjectId });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class_subjects", schoolId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const assignedTeacherIds = useMemo(
    () =>
      new Set(
        (teacherClassesQuery.data ?? [])
          .filter((tc) => tc.class_id === assignFor?.id)
          .map((tc) => tc.teacher_id),
      ),
    [teacherClassesQuery.data, assignFor],
  );
  const assignedSubjectIds = useMemo(
    () =>
      new Set(
        (classSubjectsQuery.data ?? [])
          .filter((cs) => cs.class_id === assignFor?.id)
          .map((cs) => cs.subject_id),
      ),
    [classSubjectsQuery.data, assignFor],
  );

  return (
    <AppShell
      title="Classes"
      description="Class groups and their teachers and subjects"
      actions={
        isManager ? (
          <Button
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add class
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search classes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show active" : "Show archived"}
          </Button>
        </div>

        {classesQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : classesQuery.isError ? (
          <p className="text-sm text-destructive">Could not load classes.</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title={showArchived ? "No archived classes" : "No classes yet"}
            description="Create classes such as JSS1 or SS2A so students can be assigned to them."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Level</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead className="hidden md:table-cell">Capacity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {c.level ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/students"
                        search={{}}
                        className="hover:underline"
                        title="View students"
                      >
                        <Badge variant="secondary">{studentCount.get(c.id) ?? 0}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {c.capacity ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {isManager && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setAssignFor(c)}>
                            Assign
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(c);
                              setForm({
                                name: c.name,
                                level: c.level ?? "",
                                section: c.section ?? "",
                                capacity: c.capacity?.toString() ?? "",
                              });
                              setOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleArchive.mutate(c)}
                            disabled={toggleArchive.isPending}
                          >
                            {c.is_archived ? "Restore" : "Archive"}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit class" : "Add class"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Class name *</Label>
              <Input
                value={form.name}
                placeholder="e.g. SS1A"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Level</Label>
              <Input
                value={form.level}
                placeholder="e.g. SS1"
                onChange={(e) => setForm({ ...form, level: e.target.value })}
              />
            </div>
            <div>
              <Label>Section</Label>
              <Input
                value={form.section}
                placeholder="e.g. A"
                onChange={(e) => setForm({ ...form, section: e.target.value })}
              />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Add class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignFor} onOpenChange={(v) => !v && setAssignFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign to {assignFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">Teachers</p>
              <div className="space-y-2">
                {(teachersQuery.data ?? [])
                  .filter((t) => t.is_active)
                  .map((t) => {
                    const assigned = assignedTeacherIds.has(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={assigned}
                          onCheckedChange={() =>
                            assignFor &&
                            toggleTeacher.mutate({
                              classId: assignFor.id,
                              teacherId: t.id,
                              assigned,
                            })
                          }
                        />
                        {t.first_name} {t.last_name}
                      </label>
                    );
                  })}
                {(teachersQuery.data ?? []).filter((t) => t.is_active).length === 0 && (
                  <p className="text-sm text-muted-foreground">No active teachers yet.</p>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Subjects</p>
              <div className="space-y-2">
                {(subjectsQuery.data ?? [])
                  .filter((s) => !s.is_archived)
                  .map((s) => {
                    const assigned = assignedSubjectIds.has(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={assigned}
                          onCheckedChange={() =>
                            assignFor &&
                            toggleSubject.mutate({
                              classId: assignFor.id,
                              subjectId: s.id,
                              assigned,
                            })
                          }
                        />
                        {s.name}
                      </label>
                    );
                  })}
                {(subjectsQuery.data ?? []).filter((s) => !s.is_archived).length === 0 && (
                  <p className="text-sm text-muted-foreground">No subjects yet.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setAssignFor(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
