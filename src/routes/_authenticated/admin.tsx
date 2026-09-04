import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, Database, Loader2, ShieldCheck } from "lucide-react";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPage });
type Plan = { id: string; code: string; name: string; description: string | null; monthly_price: number; annual_price: number; max_students: number | null; max_teachers: number | null; ai_tokens_monthly: number | null };
type Subscription = { id: string; school_id: string; status: string; plan_id: string; schools: { name: string } | null; saas_plans: { name: string } | null };

function AdminPage() {
  const { primaryRole } = useAuth();
  const query = useQuery({
    queryKey: ["platform-admin"], enabled: primaryRole === "super_admin",
    queryFn: async () => {
      const [{ data: schools, error: schoolsError }, { data: plans, error: plansError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
        supabase.from("schools").select("id, name, is_demo, onboarding_completed").order("created_at", { ascending: false }),
        supabase.from("saas_plans").select("id, code, name, description, monthly_price, annual_price, max_students, max_teachers, ai_tokens_monthly").eq("active", true).order("monthly_price"),
        supabase.from("school_subscriptions").select("id, school_id, status, plan_id, schools(name), saas_plans(name)").order("created_at", { ascending: false }),
      ]);
      if (schoolsError) throw schoolsError; if (plansError) throw plansError; if (subscriptionsError) throw subscriptionsError;
      return { schools: schools ?? [], plans: (plans ?? []) as Plan[], subscriptions: (subscriptions ?? []) as Subscription[] };
    },
  });
  if (primaryRole !== "super_admin") return <AppShell title="Platform Admin"><EmptyState icon={ShieldCheck} title="Super administrator access only" description="This area manages EduFlow platform-wide configuration." /></AppShell>;
  if (query.isLoading) return <AppShell title="Platform Admin"><div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin"/></div></AppShell>;
  if (query.isError || !query.data) return <AppShell title="Platform Admin"><p className="text-sm text-destructive">Unable to load platform administration.</p></AppShell>;
  const { schools, plans, subscriptions } = query.data;
  return <AppShell title="Platform Admin" description="Super-admin controls for schools, plans and subscriptions">
    <div className="grid gap-4 md:grid-cols-3"><Card><CardContent className="p-5"><Building2 className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Schools</p><p className="font-display text-3xl font-bold">{schools.length}</p></CardContent></Card><Card><CardContent className="p-5"><CreditCard className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Subscriptions</p><p className="font-display text-3xl font-bold">{subscriptions.length}</p></CardContent></Card><Card><CardContent className="p-5"><Database className="size-5 text-primary"/><p className="mt-3 text-xs text-muted-foreground">Active plans</p><p className="font-display text-3xl font-bold">{plans.length}</p></CardContent></Card></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">SaaS plans</CardTitle></CardHeader><CardContent className="space-y-3">{plans.map((plan) => <div key={plan.id} className="rounded-xl border p-4"><div className="flex items-center justify-between"><div><p className="font-semibold">{plan.name}</p><p className="text-xs text-muted-foreground">{plan.description}</p></div><Badge variant="secondary">{plan.code}</Badge></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>Students: {plan.max_students ?? "∞"}</span><span>Teachers: {plan.max_teachers ?? "∞"}</span><span>AI: {plan.ai_tokens_monthly?.toLocaleString() ?? "∞"}</span></div></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">School subscriptions</CardTitle></CardHeader><CardContent className="space-y-2">{subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">No school subscriptions have been provisioned yet.</p> : subscriptions.map((sub) => <div key={sub.id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">{sub.schools?.name ?? "Unknown school"}</p><p className="text-xs text-muted-foreground">{sub.saas_plans?.name ?? "Unassigned plan"}</p></div><Badge variant={sub.status === "active" ? "default" : "secondary"}>{sub.status}</Badge></div>)}</CardContent></Card></div>
  </AppShell>;
}
