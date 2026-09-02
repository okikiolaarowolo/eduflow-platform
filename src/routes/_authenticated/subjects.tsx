import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { api, logActivity, type SubjectRow } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/subjects")({
  component: SubjectsPage,
});

const EMPTY = { name: "", code: "", description: "" };

function SubjectsPage() {
  const schoolId = useSchoolId();
  const { user, profile, isManager } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [assignFor, setAssignFor] = useState<SubjectRow | null>(null);

  const subjectsQuery = useQuery({
    queryKey: ["subjects", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.subjects(schoolId!),
  });
  const classesQuery = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.classes(schoolId!),
  });
  const teachersQuery = useQuery({
    queryKey: ["teachers", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.teachers(schoolId!),
  });
  const classSubjectsQuery = useQuery({
    queryKey: ["class_subjects", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.classSubjects(schoolId!),
  });
  const teacherSubjectsQuery = useQuery({
    queryKey: ["teacher_subjects", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.teacherSubjects(schoolId!),
  });

  const classCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const cs of classSubjectsQuery.data ?? []) {
      map.set(cs.subject_id, (map.get(cs.subject_id) ?? 0) + 1);
    }
    return map;
  }, [classSubjectsQuery.data]);

  const teacherCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const ts of teacherSubjectsQuery.data ?? []) {
      map.set(ts.subject_id, (map.get(ts.subject_id) ?? 0) + 1);
    }
    return map;
  }, [teacherSubjectsQuery.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (subjectsQuery.data ?? []).filter((s) => {
      if (s.is_archived !== showArchived) return false;
      if (!term) return true;
      return `${s.name} ${s.code ?? ""}`.toLowerCase().includes(term);
    });
  }, [subjectsQuery.data, search, showArchived]);

  const save = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      if (!form.name.trim()) throw new Error("Subject name is required");
      const payload = {
        school_id: schoolId,
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("subjects").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("subjects").insert(payload);
        if (error) throw new Error(error.message);
      }
      if (user) {
        await logActivity({
          schoolId,
          actorId: user.id,
          actorName: profile?.full_name || user.email || "Admin",
          action: editing ? "updated" : "created",
          entity: "subject",
          description: `${editing ? "Updated" : "Created"} subject ${payload.name}`,
        });
      }
    },
    onSuccess: async () => {
      toast.success(editing ? "Subject updated" : "Subject created");
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      await queryClient.invalidateQueries({ queryKey: ["subjects", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleArchive = useMutation({
    mutationFn: async (subject: SubjectRow) => {
      const { error } = await supabase
        .from("subjects")
        .update({ is_archived: !subject.is_archived })
        .eq("id", subject.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Subject updated");
      await queryClient.invalidateQueries({ queryKey: ["subjects", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleClass = useMutation({
    mutationFn: async ({ subjectId, classId, assigned }: { subjectId: string; classId: string; assigned: boolean }) => {
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

  const toggleTeacher = useMutation({
    mutationFn: async ({ subjectId, teacherId, assigned }: { subjectId: string; teacherId: string; assigned: boolean }) => {
      if (!schoolId) throw new Error("No school");
      if (assigned) {
        const row = (teacherSubjectsQuery.data ?? []).find(
          (ts) => ts.teacher_id === teacherId && ts.subject_id === subjectId,
        );
        if (!row) return;
        const { error } = await supabase.from("teacher_subjects").delete().eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("teacher_subjects")
          .insert({ school_id: schoolId, teacher_id: teacherId, subject_id: subjectId });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher_subjects", schoolId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const assignedClassIds = useMemo(
    () =>
      new Set(
        (classSubjectsQuery.data ?? [])
          .filter((cs) => cs.subject_id === assignFor?.id)
          .map((cs) => cs.class_id),
      ),
    [classSubjectsQuery.data, assignFor],
  );
  const assignedTeacherIds = useMemo(
    () =>
      new Set(
        (teacherSubjectsQuery.data ?? [])
          .filter((ts) => ts.subject_id === assignFor?.id)
          .map((ts) => ts.teacher_id),
      ),
    [teacherSubjectsQuery.data, assignFor],
  );

  return (
    <AppShell
      title="Subjects"
      description="Subjects offered by your school"
      actions={
        isManager ? (
          <Button
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add subject
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
              placeholder="Search subjects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show active" : "Show archived"}
          </Button>
        </div>

        {subjectsQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : subjectsQuery.isError ? (
          <p className="text-sm text-destructive">Could not load subjects.</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={showArchived ? "No archived subjects" : "No subjects yet"}
            description="Create subjects such as Mathematics or English Language, then assign them to classes and teachers."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Code</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead className="hidden md:table-cell">Teachers</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {s.code ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{classCount.get(s.id) ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{teacherCount.get(s.id) ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {isManager && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setAssignFor(s)}>
                            Assign
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(s);
                              setForm({
                                name: s.name,
                                code: s.code ?? "",
                                description: s.description ?? "",
                              });
                              setOpen(true);
                            }}
                          >
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit subject" : "Add subject"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Subject name *</Label>
              <Input
                value={form.name}
                placeholder="e.g. Mathematics"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Code</Label>
              <Input
                value={form.code}
                placeholder="e.g. MTH"
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                rows={3}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Add subject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignFor} onOpenChange={(v) => !v && setAssignFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign {assignFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">Classes</p>
              <div className="space-y-2">
                {(classesQuery.data ?? [])
                  .filter((c) => !c.is_archived)
                  .map((c) => {
                    const assigned = assignedClassIds.has(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={assigned}
                          onCheckedChange={() =>
                            assignFor &&
                            toggleClass.mutate({ subjectId: assignFor.id, classId: c.id, assigned })
                          }
                        />
                        {c.name}
                      </label>
                    );
                  })}
                {(classesQuery.data ?? []).filter((c) => !c.is_archived).length === 0 && (
                  <p className="text-sm text-muted-foreground">No classes yet.</p>
                )}
              </div>
            </div>
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
                              subjectId: assignFor.id,
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
          </div>
          <DialogFooter>
            <Button onClick={() => setAssignFor(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
