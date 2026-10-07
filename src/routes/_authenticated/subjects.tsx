import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { api, logActivity, type SubjectDepartment, type SubjectRow, type SubjectSchoolLevel } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/subjects")({ component: SubjectsPage });

const EMPTY = { name: "", code: "", description: "", school_level: "both" as SubjectSchoolLevel, department: "" as SubjectDepartment | "" };

const LEVELS: { value: SubjectSchoolLevel; label: string }[] = [
  { value: "junior_secondary", label: "Junior Secondary (JSS)" },
  { value: "senior_secondary", label: "Senior Secondary (SS)" },
  { value: "both", label: "JSS + SS" },
];
const DEPARTMENTS: { value: SubjectDepartment; label: string }[] = [
  { value: "science", label: "Science" },
  { value: "humanities", label: "Humanities" },
  { value: "business", label: "Business" },
];

const STARTER_SUBJECTS: Array<{ name: string; code: string; school_level: SubjectSchoolLevel; department?: SubjectDepartment }> = [
  { name: "English Language", code: "ENG", school_level: "both" },
  { name: "Mathematics", code: "MTH", school_level: "both" },
  { name: "Basic Science", code: "BSC", school_level: "junior_secondary" },
  { name: "Basic Technology", code: "BTECH", school_level: "junior_secondary" },
  { name: "Social Studies", code: "SOC", school_level: "junior_secondary" },
  { name: "Civic Education", code: "CIV", school_level: "junior_secondary" },
  { name: "Computer Studies", code: "ICT", school_level: "junior_secondary" },
  { name: "Business Studies", code: "BUS", school_level: "junior_secondary" },
  { name: "Agricultural Science", code: "AGR", school_level: "junior_secondary" },
  { name: "Home Economics", code: "HEC", school_level: "junior_secondary" },
  { name: "Cultural & Creative Arts", code: "CCA", school_level: "junior_secondary" },
  { name: "Physics", code: "PHY", school_level: "senior_secondary", department: "science" },
  { name: "Chemistry", code: "CHM", school_level: "senior_secondary", department: "science" },
  { name: "Biology", code: "BIO", school_level: "senior_secondary", department: "science" },
  { name: "Further Mathematics", code: "FMTH", school_level: "senior_secondary", department: "science" },
  { name: "Literature in English", code: "LIT", school_level: "senior_secondary", department: "humanities" },
  { name: "Government", code: "GOV", school_level: "senior_secondary", department: "humanities" },
  { name: "Economics", code: "ECO", school_level: "senior_secondary", department: "humanities" },
  { name: "History", code: "HIS", school_level: "senior_secondary", department: "humanities" },
  { name: "Geography", code: "GEO", school_level: "senior_secondary", department: "humanities" },
  { name: "Christian Religious Studies", code: "CRS", school_level: "senior_secondary" },
  { name: "Islamic Religious Studies", code: "IRS", school_level: "senior_secondary" },
  { name: "Financial Accounting", code: "ACC", school_level: "senior_secondary", department: "business" },
  { name: "Commerce", code: "COM", school_level: "senior_secondary", department: "business" },
  { name: "Marketing", code: "MKT", school_level: "senior_secondary", department: "business" },
];

function SubjectsPage() {
  const schoolId = useSchoolId();
  const { user, profile, isManager } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<SubjectSchoolLevel | "all">("all");
  const [departmentFilter, setDepartmentFilter] = useState<SubjectDepartment | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [starterOpen, setStarterOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [assignFor, setAssignFor] = useState<SubjectRow | null>(null);

  const subjectsQuery = useQuery({ queryKey: ["subjects", schoolId], enabled: !!schoolId, queryFn: () => api.subjects(schoolId!) });
  const classesQuery = useQuery({ queryKey: ["classes", schoolId], enabled: !!schoolId, queryFn: () => api.classes(schoolId!) });
  const teachersQuery = useQuery({ queryKey: ["teachers", schoolId], enabled: !!schoolId, queryFn: () => api.teachers(schoolId!) });
  const classSubjectsQuery = useQuery({ queryKey: ["class_subjects", schoolId], enabled: !!schoolId, queryFn: () => api.classSubjects(schoolId!) });
  const teacherSubjectsQuery = useQuery({ queryKey: ["teacher_subjects", schoolId], enabled: !!schoolId, queryFn: () => api.teacherSubjects(schoolId!) });

  const classCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const cs of classSubjectsQuery.data ?? []) map.set(cs.subject_id, (map.get(cs.subject_id) ?? 0) + 1);
    return map;
  }, [classSubjectsQuery.data]);

  const teacherCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const ts of teacherSubjectsQuery.data ?? []) map.set(ts.subject_id, (map.get(ts.subject_id) ?? 0) + 1);
    return map;
  }, [teacherSubjectsQuery.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (subjectsQuery.data ?? []).filter((s) => {
      if (s.is_archived !== showArchived) return false;
      if (levelFilter !== "all" && s.school_level !== "both" && s.school_level !== levelFilter) return false;
      if (departmentFilter !== "all" && s.department !== null && s.department !== departmentFilter) return false;
      return !term || `${s.name} ${s.code ?? ""} ${s.department ?? ""}`.toLowerCase().includes(term);
    });
  }, [subjectsQuery.data, search, showArchived, levelFilter, departmentFilter]);

  const save = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      if (!form.name.trim()) throw new Error("Subject name is required");
      if (form.school_level === "junior_secondary" && form.department) throw new Error("JSS subjects do not use an SS department.");
      if (form.school_level === "senior_secondary" && !form.department && form.name.trim() !== "English Language" && form.name.trim() !== "Mathematics") {
        throw new Error("Select an SS department for this subject.");
      }
      const payload = { school_id: schoolId, name: form.name.trim(), code: form.code.trim() || null, description: form.description.trim() || null, school_level: form.school_level, department: form.department || null };
      const result = editing
        ? await supabase.from("subjects").update(payload).eq("id", editing.id)
        : await supabase.from("subjects").insert(payload);
      if (result.error) throw new Error(result.error.message);
      if (user) await logActivity({ schoolId, actorId: user.id, actorName: profile?.full_name || user.email || "Admin", action: editing ? "updated" : "created", entity: "subject", description: `${editing ? "Updated" : "Created"} subject ${payload.name}` });
    },
    onSuccess: async () => {
      toast.success(editing ? "Subject updated" : "Subject created");
      setOpen(false); setEditing(null); setForm({ ...EMPTY });
      await queryClient.invalidateQueries({ queryKey: ["subjects", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedStarter = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      const existingNames = new Set((subjectsQuery.data ?? []).map((s) => s.name.toLowerCase()));
      const missing = STARTER_SUBJECTS.filter((s) => !existingNames.has(s.name.toLowerCase()));
      if (!missing.length) return 0;
      const { error } = await supabase.from("subjects").insert(missing.map((s) => ({ school_id: schoolId, name: s.name, code: s.code, school_level: s.school_level, department: s.department ?? null })));
      if (error) throw new Error(error.message);
      return missing.length;
    },
    onSuccess: async (count) => {
      toast.success(count ? `${count} starter subjects added` : "Your school already has the starter subjects");
      setStarterOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["subjects", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleArchive = useMutation({
    mutationFn: async (subject: SubjectRow) => {
      const { error } = await supabase.from("subjects").update({ is_archived: !subject.is_archived }).eq("id", subject.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { toast.success("Subject updated"); await queryClient.invalidateQueries({ queryKey: ["subjects", schoolId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleClass = useMutation({
    mutationFn: async ({ subjectId, classId, assigned }: { subjectId: string; classId: string; assigned: boolean }) => {
      if (!schoolId) throw new Error("No school");
      if (assigned) {
        const row = (classSubjectsQuery.data ?? []).find((cs) => cs.class_id === classId && cs.subject_id === subjectId);
        if (!row) return;
        const { error } = await supabase.from("class_subjects").delete().eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("class_subjects").insert({ school_id: schoolId, class_id: classId, subject_id: subjectId });
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
        const row = (teacherSubjectsQuery.data ?? []).find((ts) => ts.teacher_id === teacherId && ts.subject_id === subjectId);
        if (!row) return;
        const { error } = await supabase.from("teacher_subjects").delete().eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("teacher_subjects").insert({ school_id: schoolId, teacher_id: teacherId, subject_id: subjectId });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher_subjects", schoolId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const assignedClassIds = useMemo(() => new Set((classSubjectsQuery.data ?? []).filter((cs) => cs.subject_id === assignFor?.id).map((cs) => cs.class_id)), [classSubjectsQuery.data, assignFor]);
  const assignedTeacherIds = useMemo(() => new Set((teacherSubjectsQuery.data ?? []).filter((ts) => ts.subject_id === assignFor?.id).map((ts) => ts.teacher_id)), [teacherSubjectsQuery.data, assignFor]);

  return (
    <AppShell
      title="Subjects"
      description="Build the school's curriculum in clear JSS and SS layers"
      actions={isManager ? <div className="flex gap-2"><Button variant="outline" onClick={() => setStarterOpen(true)}><Sparkles className="size-4" /> Starter curriculum</Button><Button onClick={() => { setEditing(null); setForm({ ...EMPTY }); setOpen(true); }}><Plus className="size-4" /> Add subject</Button></div> : null}
    >
      <div className="space-y-4">
        <CardLike />
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search subjects" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v as SubjectSchoolLevel | "all"); if (v === "junior_secondary") setDepartmentFilter("all"); }}><SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All levels" /></SelectTrigger><SelectContent><SelectItem value="all">All levels</SelectItem>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent></Select>
          <Select value={departmentFilter} onValueChange={(v) => setDepartmentFilter(v as SubjectDepartment | "all")}><SelectTrigger className="w-full md:w-40"><SelectValue placeholder="All departments" /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{DEPARTMENTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Show active" : "Show archived"}</Button>
        </div>

        {subjectsQuery.isLoading ? <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div> : subjectsQuery.isError ? <p className="text-sm text-destructive">Could not load subjects.</p> : rows.length === 0 ? <EmptyState icon={BookOpen} title={showArchived ? "No archived subjects" : "No matching subjects"} description="Create subjects and place them in the JSS or SS curriculum. SS subjects can be grouped under Science, Humanities or Business." /> : (
          <div className="overflow-x-auto rounded-xl border">
            <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Level</TableHead><TableHead>Department</TableHead><TableHead className="hidden md:table-cell">Classes</TableHead><TableHead className="hidden md:table-cell">Teachers</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((s) => <TableRow key={s.id}><TableCell className="font-medium"><div>{s.name}</div><div className="text-xs text-muted-foreground">{s.code ?? "No code"}</div></TableCell><TableCell><Badge variant="secondary">{s.school_level === "junior_secondary" ? "JSS" : s.school_level === "senior_secondary" ? "SS" : "JSS + SS"}</Badge></TableCell><TableCell>{s.department ? <Badge variant="outline">{s.department}</Badge> : "Core"}</TableCell><TableCell className="hidden md:table-cell"><Badge variant="secondary">{classCount.get(s.id) ?? 0}</Badge></TableCell><TableCell className="hidden md:table-cell"><Badge variant="secondary">{teacherCount.get(s.id) ?? 0}</Badge></TableCell><TableCell className="space-x-1 text-right">{isManager && <><Button variant="ghost" size="sm" onClick={() => setAssignFor(s)}>Assign</Button><Button variant="ghost" size="sm" onClick={() => { setEditing(s); setForm({ name: s.name, code: s.code ?? "", description: s.description ?? "", school_level: s.school_level, department: s.department ?? "" }); setOpen(true); }}>Edit</Button><Button variant="ghost" size="sm" onClick={() => toggleArchive.mutate(s)} disabled={toggleArchive.isPending}>{s.is_archived ? "Restore" : "Archive"}</Button></>}</TableCell></TableRow>)}</TableBody></Table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editing ? "Edit subject" : "Add subject"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label>Subject name *</Label><Input value={form.name} placeholder="e.g. Mathematics" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label>School level *</Label><Select value={form.school_level} onValueChange={(v) => setForm({ ...form, school_level: v as SubjectSchoolLevel, department: v === "junior_secondary" ? "" : form.department })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent></Select></div><div><Label>SS department</Label><Select value={form.department ?? ""} onValueChange={(v) => setForm({ ...form, department: v as SubjectDepartment })} disabled={form.school_level === "junior_secondary"}><SelectTrigger><SelectValue placeholder={form.school_level === "junior_secondary" ? "JSS has no department" : "Core / department"} /></SelectTrigger><SelectContent><SelectItem value="science">Science</SelectItem><SelectItem value="humanities">Humanities</SelectItem><SelectItem value="business">Business</SelectItem></SelectContent></Select></div></div>
            <div><Label>Code</Label><Input value={form.code} placeholder="e.g. MTH" onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} rows={3} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="size-4 animate-spin" />}{editing ? "Save changes" : "Add subject"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={starterOpen} onOpenChange={setStarterOpen}>
        <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Starter secondary-school curriculum</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Add a reusable starting curriculum for JSS plus SS Science, Humanities and Business. Existing subjects are never duplicated, and the school can edit, archive or add anything afterwards.</p><div className="grid gap-3 sm:grid-cols-2">{["JSS core subjects","SS Science","SS Humanities","SS Business"].map((label) => <div key={label} className="rounded-xl border p-3"><p className="font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{STARTER_SUBJECTS.filter((s) => label === "JSS core subjects" ? s.school_level === "junior_secondary" : label === "SS Science" ? s.department === "science" : label === "SS Humanities" ? s.department === "humanities" : s.department === "business").length} starter subjects</p></div>)}</div><DialogFooter><Button variant="ghost" onClick={() => setStarterOpen(false)}>Cancel</Button><Button onClick={() => seedStarter.mutate()} disabled={seedStarter.isPending}>{seedStarter.isPending && <Loader2 className="size-4 animate-spin" />}Add starter subjects</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={!!assignFor} onOpenChange={(v) => !v && setAssignFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Assign {assignFor?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-6 sm:grid-cols-2">
            <div><p className="mb-2 text-sm font-semibold">Classes</p><div className="space-y-2">{(classesQuery.data ?? []).filter((c) => !c.is_archived).map((c) => { const assigned = assignedClassIds.has(c.id); return <label key={c.id} className="flex items-center gap-2 text-sm"><Checkbox checked={assigned} onCheckedChange={() => assignFor && toggleClass.mutate({ subjectId: assignFor.id, classId: c.id, assigned })} />{c.name}</label>; })}</div></div>
            <div><p className="mb-2 text-sm font-semibold">Teachers</p><div className="space-y-2">{(teachersQuery.data ?? []).filter((t) => t.is_active).map((t) => { const assigned = assignedTeacherIds.has(t.id); return <label key={t.id} className="flex items-center gap-2 text-sm"><Checkbox checked={assigned} onCheckedChange={() => assignFor && toggleTeacher.mutate({ subjectId: assignFor.id, teacherId: t.id, assigned })} />{t.first_name} {t.last_name}</label>; })}</div></div>
          </div>
          <DialogFooter><Button onClick={() => setAssignFor(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CardLike() {
  return <div className="rounded-2xl border bg-muted/20 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Curriculum structure</p><p className="text-sm text-muted-foreground">JSS subjects sit in one layer. SS subjects can be grouped into Science, Humanities or Business. Core subjects such as Mathematics and English can remain shared.</p></div><Badge variant="secondary">School-specific</Badge></div></div>;
}
