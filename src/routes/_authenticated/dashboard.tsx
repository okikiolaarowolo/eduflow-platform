import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  CalendarDays,
  GraduationCap,
  LayoutGrid,
  Loader2,
  Users,
} from "lucide-react";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function StatCard({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
  to: "/students" | "/teachers" | "/classes" | "/subjects";
}) {
  return (
    <Link to={to} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 font-display text-3xl font-bold">{value}</p>
          </div>
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Icon className="size-5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function DashboardPage() {
  const schoolId = useSchoolId();

  const q = useQuery({
    queryKey: ["dashboard", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) throw new Error("A school is required to load the dashboard.");
      const [students, teachers, classes, subjects, sessions, terms, activity] = await Promise.all([
        api.students(schoolId),
        api.teachers(schoolId),
        api.classes(schoolId),
        api.subjects(schoolId),
        api.sessions(schoolId),
        api.terms(schoolId),
        api.activity(schoolId),
      ]);
      return { students, teachers, classes, subjects, sessions, terms, activity };
    },
  });

  const data = q.data;
  const currentSession = data?.sessions.find((s) => s.is_current) ?? null;
  const currentTerm = data?.terms.find((t) => t.is_current) ?? null;

  return (
    <AppShell title="Dashboard" description="Live overview of your school">
      {!schoolId ? (
        <div className="py-16">
          <EmptyState
            icon={CalendarDays}
            title="Complete your school setup"
            description="Finish onboarding before opening the school dashboard."
            action={
              <Link to="/onboarding" className="text-sm font-medium text-primary">
                Continue onboarding →
              </Link>
            }
          />
        </div>
      ) : q.isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : q.isError ? (
        <p className="text-sm text-destructive">Could not load dashboard data. Please refresh and try again.</p>
      ) : !data ? (
        <EmptyState
          icon={Activity}
          title="Dashboard data unavailable"
          description="There is no dashboard data to display yet."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Students"
              value={data.students.filter((s) => !s.is_archived).length}
              icon={Users}
              to="/students"
            />
            <StatCard
              label="Teachers"
              value={data.teachers.filter((t) => t.is_active).length}
              icon={GraduationCap}
              to="/teachers"
            />
            <StatCard
              label="Classes"
              value={data.classes.filter((c) => !c.is_archived).length}
              icon={LayoutGrid}
              to="/classes"
            />
            <StatCard
              label="Subjects"
              value={data.subjects.filter((s) => !s.is_archived).length}
              icon={BookOpen}
              to="/subjects"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4" /> Academic period
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Session</p>
                  <p className="mt-1 font-medium">{currentSession?.name ?? "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Term</p>
                  <p className="mt-1 font-medium">{currentTerm?.name ?? "Not set"}</p>
                </div>
                <Link to="/settings" className="inline-block text-sm font-medium text-primary">
                  Manage academic settings →
                </Link>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4" /> Recent activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.activity.length === 0 ? (
                  <EmptyState
                    icon={Activity}
                    title="No activity yet"
                    description="Actions taken in your school workspace will show up here."
                  />
                ) : (
                  <ul className="space-y-3">
                    {data.activity.map((item) => (
                      <li key={item.id} className="flex items-start gap-3 text-sm">
                        <Badge variant="secondary" className="mt-0.5 shrink-0 capitalize">
                          {item.action}
                        </Badge>
                        <div className="min-w-0">
                          <p className="truncate">{item.description ?? item.entity}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.actor_name ?? "System"} · {" "}
                            {new Date(item.created_at).toLocaleString()}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
