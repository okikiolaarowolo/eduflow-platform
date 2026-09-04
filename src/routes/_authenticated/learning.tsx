import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ExternalLink, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/learning")({ component: LearningPage });
type Material = { id: string; title: string; description: string | null; material_type: string; external_url: string | null; file_url: string | null; published: boolean; created_at: string };

function LearningPage() {
  const schoolId = useSchoolId();
  const { isManager } = useAuth();
  const client = useQueryClient();
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [url, setUrl] = useState("");
  const query = useQuery<Material[]>({ queryKey: ["learning-materials", schoolId], enabled: !!schoolId, queryFn: async () => { const { data, error } = await supabase.from("learning_materials").select("id,title,description,material_type,external_url,file_url,published,created_at").eq("school_id", schoolId!).order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as Material[]; } });
  const add = useMutation({ mutationFn: async () => { if (!schoolId || !title.trim()) throw new Error("A title is required"); const { error } = await supabase.from("learning_materials").insert({ school_id: schoolId, title: title.trim(), description: description.trim() || null, external_url: url.trim() || null, material_type: url.trim() ? "link" : "document", published: true } as never); if (error) throw error; }, onSuccess: () => { setTitle(""); setDescription(""); setUrl(""); void client.invalidateQueries({ queryKey: ["learning-materials", schoolId] }); } });
  const remove = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("learning_materials").delete().eq("id", id); if (error) throw error; }, onSuccess: () => void client.invalidateQueries({ queryKey: ["learning-materials", schoolId] }) });
  if (!schoolId) return <AppShell title="Learning Materials"><EmptyState icon={BookOpen} title="School setup required" description="Complete onboarding before managing learning materials." /></AppShell>;
  return <AppShell title="Learning Materials" description="Publish resources for classes and subjects">
    {isManager && <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="size-4"/> Add material</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Algebra revision guide" /></div><div className="space-y-2"><Label>Resource link</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></div><div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should students learn from this resource?" /></div><div><Button onClick={() => add.mutate()} disabled={add.isPending || !title.trim()}>{add.isPending ? <Loader2 className="size-4 animate-spin"/> : <Plus className="size-4"/>} Publish material</Button></div></CardContent></Card>}
    <div className="mt-6">{query.isLoading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin"/></div> : query.isError ? <p className="text-sm text-destructive">Could not load learning materials.</p> : query.data?.length === 0 ? <EmptyState icon={FileText} title="No learning materials" description="Published resources will appear here."/> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{query.data?.map((m) => <Card key={m.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="rounded-lg bg-muted p-2"><BookOpen className="size-5"/></div><Badge variant="secondary">{m.material_type}</Badge></div><h3 className="mt-4 font-semibold">{m.title}</h3>{m.description && <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{m.description}</p>}<div className="mt-4 flex items-center justify-between">{m.external_url ? <a href={m.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline">Open resource <ExternalLink className="size-3"/></a> : <span className="text-xs text-muted-foreground">No external link</span>}{isManager && <Button variant="ghost" size="icon" aria-label={`Delete ${m.title}`} onClick={() => remove.mutate(m.id)}><Trash2 className="size-4 text-destructive"/></Button>}</div></CardContent></Card>)}</div>}</div>
  </AppShell>;
}
