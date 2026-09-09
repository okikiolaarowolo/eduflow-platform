import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Bot, Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/insights")({ component: InsightsPage });

type Row = { score: number | null; assessment_id: string; assessments: { subject_id: string; subjects: { name: string } | null } | null };
type Insight = { subject: string; average: number; count: number };

function InsightsPage() {
  const schoolId = useSchoolId();
  const { user, primaryRole } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery<Insight[]>({
    queryKey: ["academic-insights", schoolId],
    enabled: !!schoolId && !!user && (primaryRole === "school_admin" || primaryRole === "principal"),
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_scores").select("score,assessment_id,assessments(subject_id,subjects(name))").eq("school_id", schoolId!);
      if (error) throw error;
      const buckets = new Map<string, { sum: number; count: number }>();
      for (const row of (data ?? []) as unknown as Row[]) {
        const name = row.assessments?.subjects?.name ?? "Unassigned subject";
        const bucket = buckets.get(name) ?? { sum: 0, count: 0 };
        bucket.sum += Number(row.score ?? 0); bucket.count += 1; buckets.set(name, bucket);
      }
      return [...buckets.entries()].map(([subject, value]) => ({ subject, average: value.count ? value.sum / value.count : 0, count: value.count })).sort((a, b) => a.average - b.average);
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!schoolId || !user) throw new Error("Authentication required");
      const evidence = (query.data ?? []).map((item) => ({ subject: item.subject, average: Number(item.average.toFixed(1)), score_count: item.count })).slice(0, 50);
      if (!evidence.length) throw new Error("Record assessment scores before generating an AI insight.");
      const context = JSON.stringify({ purpose: "school academic intervention analysis", subjects: evidence, note: "This is aggregated school data. Do not infer individual student facts." });
      const prompt = "Analyze the aggregated academic evidence. Identify the strongest and weakest subjects, meaningful risk signals, confidence limits, and 3 practical interventions for teachers or school leaders. Use only the supplied numbers.";
      const { data: conversation, error: conversationError } = await supabase.from("ai_conversations").insert({ school_id: schoolId, user_id: user.id, title: "Academic Insight", mode: "academic-insights" }).select("id").single();
      if (conversationError || !conversation) throw new Error(conversationError?.message ?? "Could not start AI insight session");
      const { error: userMessageError } = await supabase.from("ai_messages").insert({ school_id: schoolId, conversation_id: conversation.id, user_id: user.id, role: "user", content: prompt });
      if (userMessageError) throw new Error(userMessageError.message);
      const { data, error } = await supabase.functions.invoke("ai-tutor", { body: { conversation_id: conversation.id, message: prompt, mode: "academic-insights", context } });
      if (error) throw new Error(error.message);
      if (!data?.content) throw new Error("The AI service returned no insight.");
      return data.content as string;
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["ai-conversations", schoolId, user?.id] }); toast.success("AI academic insight generated"); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!schoolId) return <AppShell title="Academic Insights"><EmptyState icon={BarChart3} title="School setup required" description="Complete onboarding first." /></AppShell>;
  if (primaryRole !== "school_admin" && primaryRole !== "principal") return <AppShell title="Academic Insights"><Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Academic insights are available to school administrators and principals.</CardContent></Card></AppShell>;
  if (query.isLoading) return <AppShell title="Academic Insights"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div></AppShell>;
  if (query.isError) return <AppShell title="Academic Insights"><p className="text-sm text-destructive">Unable to calculate academic insights.</p></AppShell>;

  const insights = query.data ?? [];
  const weak = insights.filter((item) => item.average < 50);
  const watch = insights.filter((item) => item.average >= 50 && item.average < 70);
  const strong = insights.filter((item) => item.average >= 70);

  return <AppShell title="Academic Insights" description="Evidence-based signals for intervention and improvement">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm text-muted-foreground">AI analysis uses aggregated school performance only and is always a draft for staff review.</p></div>
      <Button onClick={() => generate.mutate()} disabled={generate.isPending || !insights.length}><Sparkles className="size-4"/>{generate.isPending ? "Generating..." : "Generate AI insight"}</Button>
    </div>
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <Card><CardContent className="p-5"><TrendingDown className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Priority subjects</p><p className="text-2xl font-bold">{weak.length}</p><p className="text-xs text-muted-foreground">Below 50% average</p></CardContent></Card>
      <Card><CardContent className="p-5"><AlertTriangle className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Watch list</p><p className="text-2xl font-bold">{watch.length}</p><p className="text-xs text-muted-foreground">50–69.9% average</p></CardContent></Card>
      <Card><CardContent className="p-5"><TrendingUp className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Strong subjects</p><p className="text-2xl font-bold">{strong.length}</p><p className="text-xs text-muted-foreground">70%+ average</p></CardContent></Card>
    </div>
    <Card className="mt-6"><CardHeader><CardTitle className="text-base">Performance by subject</CardTitle></CardHeader><CardContent className="space-y-3">{insights.length === 0 ? <EmptyState icon={BarChart3} title="Not enough assessment data" description="Record assessment scores to generate insights." /> : insights.map((item) => <div key={item.subject} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{item.subject}</p><p className="text-xs text-muted-foreground">{item.count} recorded score{item.count === 1 ? "" : "s"}</p></div><Badge variant={item.average < 50 ? "destructive" : item.average < 70 ? "secondary" : "default"}>{item.average.toFixed(1)}%</Badge></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, item.average))}%` }} /></div></div>)}</CardContent></Card>
    <Card className="mt-6"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="size-4"/>Intervention guidance</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border p-4"><p className="font-medium">Priority</p><p className="mt-1 text-sm text-muted-foreground">Review curriculum coverage, reteach prerequisite concepts and schedule targeted practice for subjects below 50%.</p></div><div className="rounded-xl border p-4"><p className="font-medium">Watch</p><p className="mt-1 text-sm text-muted-foreground">Use short formative checks and teacher feedback to move subjects in the 50–69.9% range upward.</p></div><div className="rounded-xl border p-4"><p className="font-medium">Strengths</p><p className="mt-1 text-sm text-muted-foreground">Share effective teaching approaches and maintain challenge for subjects already above 70%.</p></div></CardContent></Card>
  </AppShell>;
}
