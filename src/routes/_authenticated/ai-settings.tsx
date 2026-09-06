import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/ai-settings")({ component: AiSettingsPage });

type AiSettings = {
  school_id: string;
  enabled: boolean;
  student_tutor_enabled: boolean;
  teacher_assistant_enabled: boolean;
  monthly_token_limit: number;
  disclosure_text: string;
};

function AiSettingsPage() {
  const { primaryRole } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["ai-settings", primaryRole],
    enabled: primaryRole === "school_admin" || primaryRole === "principal",
    queryFn: async () => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Authentication required");
      const { data: userProfile } = await supabase.from("profiles").select("school_id").eq("id", profile.user.id).single();
      if (!userProfile?.school_id) throw new Error("No school is linked to this account");
      const { data, error } = await supabase.from("ai_settings").select("school_id,enabled,student_tutor_enabled,teacher_assistant_enabled,monthly_token_limit,disclosure_text").eq("school_id", userProfile.school_id).single();
      if (error) throw error;
      return data as AiSettings;
    },
  });

  const save = useMutation({
    mutationFn: async (settings: AiSettings) => {
      const { error } = await supabase.from("ai_settings").update({ enabled: settings.enabled, student_tutor_enabled: settings.student_tutor_enabled, teacher_assistant_enabled: settings.teacher_assistant_enabled, monthly_token_limit: Math.max(0, Math.floor(Number(settings.monthly_token_limit) || 0)), disclosure_text: settings.disclosure_text.trim() || "AI-generated content may contain mistakes. Review important information." }).eq("school_id", settings.school_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { toast.success("AI settings saved"); await queryClient.invalidateQueries({ queryKey: ["ai-settings"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (primaryRole !== "school_admin" && primaryRole !== "principal") {
    return <AppShell title="AI Settings"><Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Only school administrators and principals can manage AI settings.</CardContent></Card></AppShell>;
  }
  if (query.isLoading) return <AppShell title="AI Settings"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin"/></div></AppShell>;
  if (query.isError || !query.data) return <AppShell title="AI Settings"><p className="text-sm text-destructive">Unable to load AI settings. Make sure the AI settings migration has been applied.</p></AppShell>;

  const settings = query.data;
  return <AppShell title="AI Settings" description="Control EduFlow AI availability, features and monthly usage">
    <div className="mx-auto max-w-3xl space-y-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5"/>School AI controls</CardTitle><CardDescription>These controls apply to AI requests made by users in this school.</CardDescription></CardHeader><CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><p className="font-medium">Enable EduFlow AI</p><p className="text-sm text-muted-foreground">Turn the AI service on or off for the school.</p></div><Switch checked={settings.enabled} onCheckedChange={(enabled) => queryClient.setQueryData(["ai-settings", primaryRole], { ...settings, enabled })}/></div>
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><p className="font-medium">Student AI tutor</p><p className="text-sm text-muted-foreground">Allow students to use tutoring, explanations and practice generation.</p></div><Switch checked={settings.student_tutor_enabled} onCheckedChange={(value) => queryClient.setQueryData(["ai-settings", primaryRole], { ...settings, student_tutor_enabled: value })}/></div>
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><p className="font-medium">Teacher AI assistant</p><p className="text-sm text-muted-foreground">Allow teachers to use AI learning-support tools.</p></div><Switch checked={settings.teacher_assistant_enabled} onCheckedChange={(value) => queryClient.setQueryData(["ai-settings", primaryRole], { ...settings, teacher_assistant_enabled: value })}/></div>
        <div><Label>Monthly token limit</Label><Input className="mt-2 max-w-xs" type="number" min="0" value={settings.monthly_token_limit} onChange={(e) => queryClient.setQueryData(["ai-settings", primaryRole], { ...settings, monthly_token_limit: Number(e.target.value) })}/><p className="mt-1 text-xs text-muted-foreground">Use 0 for unlimited. This is a school-wide limit.</p></div>
        <div><Label>AI disclosure text</Label><Textarea className="mt-2" rows={4} value={settings.disclosure_text} onChange={(e) => queryClient.setQueryData(["ai-settings", primaryRole], { ...settings, disclosure_text: e.target.value })}/><p className="mt-1 text-xs text-muted-foreground">Shown beneath AI responses so users know that AI output should be reviewed.</p></div>
        <Button onClick={() => save.mutate(settings)} disabled={save.isPending}><Save className="size-4"/>{save.isPending ? "Saving..." : "Save AI settings"}</Button>
      </CardContent></Card>
    </div>
  </AppShell>;
}
