import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell, useSchool, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { api, logActivity } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const schoolId = useSchoolId();
  const { user, profile, isManager } = useAuth();
  const queryClient = useQueryClient();
  const schoolQuery = useSchool();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    logo_url: "",
  });
  const [newSession, setNewSession] = useState("");
  const [newTerm, setNewTerm] = useState("");

  useEffect(() => {
    const s = schoolQuery.data;
    if (s) {
      setForm({
        name: s.name,
        email: s.email ?? "",
        phone: s.phone ?? "",
        address: s.address ?? "",
        website: s.website ?? "",
        logo_url: s.logo_url ?? "",
      });
    }
  }, [schoolQuery.data]);

  const sessionsQuery = useQuery({
    queryKey: ["sessions", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.sessions(schoolId!),
  });
  const termsQuery = useQuery({
    queryKey: ["terms", schoolId],
    enabled: !!schoolId,
    queryFn: () => api.terms(schoolId!),
  });

  const currentSession = (sessionsQuery.data ?? []).find((s) => s.is_current) ?? null;

  const saveSchool = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      if (!form.name.trim()) throw new Error("School name is required");
      const { error } = await supabase
        .from("schools")
        .update({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          website: form.website.trim() || null,
          logo_url: form.logo_url.trim() || null,
        })
        .eq("id", schoolId);
      if (error) throw new Error(error.message);
      if (user) {
        await logActivity({
          schoolId,
          actorId: user.id,
          actorName: profile?.full_name || user.email || "Admin",
          action: "updated",
          entity: "school",
          description: "Updated school information",
        });
      }
    },
    onSuccess: async () => {
      toast.success("School information saved");
      await queryClient.invalidateQueries({ queryKey: ["school", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSession = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      const name = newSession.trim();
      if (!name) throw new Error("Enter a session name, e.g. 2026/2027");
      const makeCurrent = (sessionsQuery.data ?? []).length === 0;
      const { error } = await supabase
        .from("academic_sessions")
        .insert({ school_id: schoolId, name, is_current: makeCurrent });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Session added");
      setNewSession("");
      await queryClient.invalidateQueries({ queryKey: ["sessions", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCurrentSession = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!schoolId) throw new Error("No school");
      const { error: clearError } = await supabase
        .from("academic_sessions")
        .update({ is_current: false })
        .eq("school_id", schoolId);
      if (clearError) throw new Error(clearError.message);
      const { error } = await supabase
        .from("academic_sessions")
        .update({ is_current: true })
        .eq("id", sessionId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Current session updated");
      await queryClient.invalidateQueries({ queryKey: ["sessions", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTerm = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school");
      if (!currentSession) throw new Error("Create and select a current session first");
      const name = newTerm.trim();
      if (!name) throw new Error("Enter a term name, e.g. First Term");
      const sessionTerms = (termsQuery.data ?? []).filter(
        (t) => t.session_id === currentSession.id,
      );
      const { error } = await supabase.from("terms").insert({
        school_id: schoolId,
        session_id: currentSession.id,
        name,
        is_current: sessionTerms.length === 0,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Term added");
      setNewTerm("");
      await queryClient.invalidateQueries({ queryKey: ["terms", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCurrentTerm = useMutation({
    mutationFn: async (termId: string) => {
      if (!schoolId) throw new Error("No school");
      const { error: clearError } = await supabase
        .from("terms")
        .update({ is_current: false })
        .eq("school_id", schoolId);
      if (clearError) throw new Error(clearError.message);
      const { error } = await supabase.from("terms").update({ is_current: true }).eq("id", termId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Current term updated");
      await queryClient.invalidateQueries({ queryKey: ["terms", schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sessionTerms = (termsQuery.data ?? []).filter(
    (t) => !currentSession || t.session_id === currentSession.id,
  );

  return (
    <AppShell title="Settings" description="School profile and academic configuration">
      {!isManager ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Only school managers can change settings. Contact your school administrator if
            something needs updating.
          </CardContent>
        </Card>
      ) : schoolQuery.isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : schoolQuery.isError ? (
        <p className="text-sm text-destructive">Could not load school settings.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">School information</CardTitle>
              <CardDescription>These details appear across your workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>School name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Website</Label>
                  <Input
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Logo URL</Label>
                  <Input
                    value={form.logo_url}
                    onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={() => saveSchool.mutate()} disabled={saveSchool.isPending}>
                {saveSchool.isPending && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4" /> Academic sessions
                </CardTitle>
                <CardDescription>
                  The current session drives dashboards and reports.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newSession}
                    placeholder="e.g. 2026/2027"
                    onChange={(e) => setNewSession(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSession.mutate();
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => addSession.mutate()}
                    disabled={addSession.isPending}
                  >
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
                <ul className="space-y-2">
                  {(sessionsQuery.data ?? []).map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{s.name}</span>
                      {s.is_current ? (
                        <Badge>Current</Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCurrentSession.mutate(s.id)}
                          disabled={setCurrentSession.isPending}
                        >
                          Make current
                        </Button>
                      )}
                    </li>
                  ))}
                  {(sessionsQuery.data ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No sessions yet.</p>
                  )}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Terms</CardTitle>
                <CardDescription>
                  {currentSession
                    ? `Terms in ${currentSession.name}`
                    : "Select a current session to manage its terms."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newTerm}
                    placeholder="e.g. First Term"
                    disabled={!currentSession}
                    onChange={(e) => setNewTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTerm.mutate();
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => addTerm.mutate()}
                    disabled={addTerm.isPending || !currentSession}
                  >
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
                <ul className="space-y-2">
                  {sessionTerms.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{t.name}</span>
                      {t.is_current ? (
                        <Badge>Current</Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCurrentTerm.mutate(t.id)}
                          disabled={setCurrentTerm.isPending}
                        >
                          Make current
                        </Button>
                      )}
                    </li>
                  ))}
                  {sessionTerms.length === 0 && (
                    <p className="text-sm text-muted-foreground">No terms yet.</p>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
