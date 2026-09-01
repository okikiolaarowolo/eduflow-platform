import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, Plus, Search } from "lucide-react";
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
import { api, logActivity, type TeacherRow } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/teachers")({
  component: TeachersPage,
});

const EMPTY = {
  first_name: "",
  last_name: "",
  staff_id: "",
  email: "",
  phone: "",
  qualification: "",
};

function TeachersPage() {
  const schoolId = useSchoolId();
  const { user, profile, isManager } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const teachersQuery = useQuery({
    queryKey: ["teachers", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.teachers(schoolId!),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (teachersQuery.data ?? []).filter((t) =>
      term
        ? `${t.first_name} ${t.last_name} ${t.staff_id} ${t.email ?? ""}`.toLowerCase().includes(term)
        : true,
    );
  }, [teachersQuery.data, search]);

  const save = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      if (!form.first_name.trim() || !form.last_name.trim() || !form.staff_id.trim()) {
        throw new Error("First name, last name and staff ID are required");
      }
      const payload = {
        school_id: schoolId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        staff_id: form.staff_id.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        qualification: form.qualification.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("teachers").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("teachers").insert(payload);
        if (error) throw new Error(error.message);
      }
      if (user) {
        await logActivity({
          schoolId,
          actorId: user.id,
          actorName: profile?.full_name || user.email || "Admin",
          action: editing ? "updated" : "created",
          entity: "teacher",
          description: `${editing ? "Updated" : "Added"} teacher ${payload.first_name} ${payload.last_name}`,
        });
      }
    },
    onSuccess: async () => {
      toast.success(editing ? "Teacher updated" : "Teacher added");
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      await queryClient.invalidateQueries({ queryKey: ["teachers", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (teacher: TeacherRow) => {
      const { error } = await supabase
        .from("teachers")
        .update({ is_active: !teacher.is_active })
        .eq("id", teacher.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Teacher updated");
      await queryClient.invalidateQueries({ queryKey: ["teachers", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Teachers"
      description="Staff records and teaching assignments"
      actions={
        isManager ? (
          <Button
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add teacher
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search teachers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {teachersQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : teachersQuery.isError ? (
          <p className="text-sm text-destructive">Could not load teachers.</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No teachers yet"
            description="Add teaching staff so you can assign them to classes and subjects."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.first_name} {t.last_name}
                    </TableCell>
                    <TableCell>{t.staff_id}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {t.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.is_active ? "secondary" : "outline"}>
                        {t.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {isManager && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(t);
                              setForm({
                                first_name: t.first_name,
                                last_name: t.last_name,
                                staff_id: t.staff_id,
                                email: t.email ?? "",
                                phone: t.phone ?? "",
                                qualification: t.qualification ?? "",
                              });
                              setOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleActive.mutate(t)}>
                            {t.is_active ? "Deactivate" : "Activate"}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit teacher" : "Add teacher"}</DialogTitle>
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
              <Label>Staff ID *</Label>
              <Input
                value={form.staff_id}
                onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
              />
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
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Qualification</Label>
              <Input
                value={form.qualification}
                onChange={(e) => setForm({ ...form, qualification: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Add teacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
