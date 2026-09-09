import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Gauge, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/ai-settings")({ component: AiSettingsPage });
type AiSettings = { school_id: string; enabled: boolean; student_tutor_enabled: boolean; teacher_assistant_enabled: boolean; monthly_token_limit: number; max_output_tokens: number; disclosure_text: string };
type Usage = { actual_tokens: number; reserved_tokens: number; request_count: number; total_cost: number };

function AiSettingsPage() {
  const { primaryRole } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["ai-settings", primaryRole],
    enabled: primaryRole === "school_admin" || primaryRole === "principal",
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Authentication required");
      const { data: profile, error: profileError } = await supabase.from("profiles").select("school_id").eq("id", auth.user.id).single();
      if (profileError || !profile?.school_id) throw new Error("No school is linked to this account");
      const db = supabase as any;
      const [settingsResult, usageResult] = await Promise.all([
        db.from("ai_settings").select("school_id,enabled,student_tutor_enabled,teacher_assistant_enabled,monthly_token_limit,max_output_tokens,disclosure_text").eq("school_id", profile.school_id).single(),
        db.from("ai_monthly_usage").select("actual_tokens,reserved_tokens,request_count,total_cost").eq("school_id", profile.school_id).order("usage_month", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (usageResult.error) throw usageResult.error;
      return { settings: settingsResult.data as AiSettings, usage: (usageResult.data as Usage | null) ?? { actual_tokens: 0, reserved_tokens: 0, request_count: 0, total_cost: 0 } };
    },
  });
  const save = useMutation({
    mutationFn: async (settings: AiSettings) => {
      const db = supabase as any;
      const { error } = await db.from("ai_settings").update({ enabled: settings.enabled, student_tutor_enabled: settings.student_tutor_enabled, teacher_assistant_enabled: settings.teacher_assistant_enabled, monthly_token_limit: Math.max(0, Math.floor(Number(settings.monthly_token_limit) || 0)), max_output_tokens: Math.min(4000, Math.max(128, Math.floor(Number(settings.max_output_tokens) || 900))), disclosure_text: settings.disclosure_text.trim() || "AI-generated content may contain mistakes. Review important information." }).eq("school_id", settings.school_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { toast.success("AI settings saved"); await queryClient.invalidateQueries({ queryKey: ["ai-settings"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  if (primaryRole !== "school_admin" && primaryRole !== "principal") return <AppShell title="AI Settings"><Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Only school administrators and principals can manage AI settings.</CardContent></Card></AppShell>;
  if (query.isLoading) return <AppShell title="AI Settings"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin"/></div></AppShell>;
  if (query.isError || !query.data) return <AppShell title="AI Settings"><p className="text-sm text-destructive">Unable to load AI settings.</p></AppShell>;
  const { settings, usage } = query.data;
  const remaining = settings.monthly_token_limit > 0 ? Math.max(0, settings.monthly_token_limit - usage.actual_tokens - usage.reserved_tokens) : null;
  return <AppShell title="AI Settings" description="Control EduFlow AI availability, safety and school-wide usage"><div className="mx-auto max-w-4xl space-y-6">
    <div className="grid gap-4 md:grid-cols-3"><Card><CardContent className="p-5"><Gauge className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Used this month</p><p className="text-2xl font-bold">{usage.actual_tokens.toLocaleString()}</p></CardContent></Card><Card><CardContent className="p-5"><Bot className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">AI requests</p><p className="text-2xl font-bold">{usage.request_count.toLocaleString()}</p></CardContent></Card><Card><CardContent className="p-5"><ShieldCheck className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Estimated cost</p><p className="text-2xl font-bold">{Number(usage.total_cost ?? 0).toFixed(4)}</p>{remaining !== null && <Badge className="mt-2" variant={remaining < settings.monthly_token_limit * 0.1 ? "destructive" : "secondary"}>{remaining.toLocaleString()} tokens remaining</Badge>}</CardContent></Card></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5"/>School AI controls</CardTitle><CardDescription>These controls apply to AI requests made by users in this school.</CardDescription></CardHeader><CardContent className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><p className="font-medium">Enable EduFlow AI</p><p className="text-sm text-muted-foreground">Turn the AI service on or off for the school.</p></div><Switch checked={settings.enabled} onCheckedChange={(enabled) => queryClient.setQueryData(["ai-settings", primaryRole], { settings: { ...settings, enabled }, usage })}/></div>
      <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><p className="font-medium">Student AI tutor</p><p className="text-sm text-muted-foreground">Keep this ready for a future student learning experience; student portal navigation remains disabled.</p></div><Switch checked={settings.student_tutor_enabled} onCheckedChange={(value) => queryClient.setQueryData(["ai-settings", primaryRole], { settings: { ...settings, student_tutor_enabled: value }, usage })}/></div>
      <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><p className="font-medium">Teacher AI assistant</p><p className="text-sm text-muted-foreground">Allow teachers to use lesson, activity, question, feedback and intervention support.</p></div><Switch checked={settings.teacher_assistant_enabled} onCheckedChange={(value) => queryClient.setQueryData(["ai-settings", primaryRole], { settings: { ...settings, teacher_assistant_enabled: value }, usage })}/></div>
      <div className="grid gap-4 md:grid-cols-2"><div><Label>Monthly token limit</Label><Input className="mt-2" type="number" min="0" value={settings.monthly_token_limit} onChange={(e) => queryClient.setQueryData(["ai-settings", primaryRole], { settings: { ...settings, monthly_token_limit: Number(e.target.value) }, usage })}/><p className="mt-1 text-xs text-muted-foreground">Use 0 for unlimited. Requests reserve tokens atomically to reduce concurrent quota overspend.</p></div><div><Label>Maximum output tokens</Label><Input className="mt-2" type="number" min="128" max="4000" value={settings.max_output_tokens} onChange={(e) => queryClient.setQueryData(["ai-settings", primaryRole], { settings: { ...settings, max_output_tokens: Number(e.target.value) }, usage })}/><p className="mt-1 text-xs text-muted-foreground">Higher limits allow longer outputs but consume quota faster.</p></div></div>
      <div><Label>AI disclosure text</Label><Textarea className="mt-2" rows={4} value={settings.disclosure_text} onChange={(e) => queryClient.setQueryData(["ai-settings", primaryRole], { settings: { ...settings, disclosure_text: e.target.value }, usage })}/><p className="mt-1 text-xs text-muted-foreground">Shown beneath AI responses so users know generated content should be reviewed.</p></div>
      <Button onClick={() => save.mutate(settings)} disabled={save.isPending}><Save className="size-4"/>{save.isPending ? "Saving..." : "Save AI settings"}</Button>
    </CardContent></Card>
  </div></AppShell>;
}
