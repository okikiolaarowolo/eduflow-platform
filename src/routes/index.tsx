import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Brain,
  CalendarDays,
  GraduationCap,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth, homeForRole } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EduFlow AI — Smarter Schools. Better Learning." },
      {
        name: "description",
        content:
          "EduFlow AI brings school management, academic analytics, and AI-powered learning into one intelligent platform for secondary schools.",
      },
      { property: "og:title", content: "EduFlow AI — Smarter Schools. Better Learning." },
      {
        property: "og:description",
        content:
          "Manage students, teachers, classes and subjects across multiple schools with secure, isolated data.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: LayoutGrid,
    title: "School Management",
    body: "Administrators manage students, teachers, classes, subjects, attendance and academic records from a single, secure workspace — with every record tied to their own school.",
  },
  {
    icon: Brain,
    title: "AI-Powered Learning",
    body: "Students will get an AI tutor that explains concepts, generates practice questions, spots weak areas and builds personalised study plans. (Coming in the next phase.)",
  },
  {
    icon: BarChart3,
    title: "Academic Analytics",
    body: "Monitor student and class performance over sessions and terms, so leadership can see where results are improving and where support is needed.",
  },
  {
    icon: BookOpenCheck,
    title: "Teacher Tools",
    body: "Teachers manage their classes, assignments, results and learning materials, with subject and class assignments handled by the school admin.",
  },
];

const steps = [
  { title: "Create your school", body: "Register and set up your school profile in minutes." },
  { title: "Configure your academic system", body: "Define sessions and terms that match your calendar." },
  { title: "Add teachers and students", body: "Build classes and subjects, then enrol your people." },
  { title: "Start managing your school", body: "Run daily operations from one clean dashboard." },
];

function Landing() {
  const { session, primaryRole, loading } = useAuth();
  const dashboardHref = homeForRole(primaryRole);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="size-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">EduFlow AI</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Platform</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#security" className="transition-colors hover:text-foreground">Security</a>
          </nav>
          <div className="flex items-center gap-2">
            {!loading && session ? (
              <Button asChild size="sm">
                <Link to={dashboardHref}>Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth" search={{ mode: "login", redirect: undefined }}>Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth" search={{ mode: "signup", redirect: undefined }}>Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="gradient-hero relative overflow-hidden text-ink-foreground">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-foreground/20 bg-ink-foreground/5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-ink-muted">
              <Sparkles className="size-3.5" /> Multi-school SaaS for secondary education
            </span>
            <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
              Smarter Schools.{" "}
              <span className="text-gradient-brand">Better Learning.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-ink-muted">
              EduFlow AI brings school management, academic analytics, and AI-powered learning into
              one intelligent platform.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup", redirect: undefined }}>
                  Get Started <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-ink-foreground/25 bg-transparent text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground">
                <a href="mailto:hello@eduflow.ai?subject=EduFlow%20AI%20demo%20request">Request Demo</a>
              </Button>
            </div>
            <dl className="mt-14 grid max-w-xl grid-cols-2 gap-6 sm:grid-cols-3">
              {[
                { k: "Tenant isolation", v: "Database-enforced" },
                { k: "Roles supported", v: "6 levels" },
                { k: "Setup time", v: "Under 10 min" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-xs uppercase tracking-wide text-ink-muted">{s.k}</dt>
                  <dd className="mt-1 font-display text-lg font-semibold">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl font-display text-3xl font-bold sm:text-4xl">
          Everything a school needs, in one intelligent platform
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Built for real schools: administration, teaching and learning working from the same data.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {features.map((f) => (
            <Card key={f.title} className="border-border/70 shadow-soft transition-shadow hover:shadow-lift">
              <CardContent className="p-7">
                <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-5 text-xl font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="how" className="border-y border-border/60 bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border border-border/70 bg-card p-6 shadow-soft">
                <span className="font-display text-sm font-bold text-primary">0{i + 1}</span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Every school's data stays its own
            </h2>
            <p className="mt-4 text-muted-foreground">
              EduFlow AI is multi-tenant by design. Each school is an independent tenant, and
              isolation is enforced in the database itself — not just hidden in the interface. A
              user can never read another school's students, teachers, classes or records.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Row-level security on every school-owned table",
                "Role-based permissions across six user roles",
                "Server-validated tenant checks on all writes",
              ].map((i) => (
                <li key={i} className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{i}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Users, k: "Students & guardians" },
              { icon: GraduationCap, k: "Teachers & staff" },
              { icon: LayoutGrid, k: "Classes & subjects" },
              { icon: CalendarDays, k: "Sessions & terms" },
            ].map((c) => (
              <div key={c.k} className="rounded-2xl border border-border/70 bg-card p-6 shadow-soft">
                <c.icon className="size-5 text-primary" />
                <p className="mt-3 text-sm font-medium">{c.k}</p>
                <p className="mt-1 text-xs text-muted-foreground">Scoped to your school</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-ink">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            Bring smarter learning to your school.
          </h2>
          <p className="mt-4 text-ink-muted">
            Set up your school today and start managing everything in one place.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup", redirect: undefined }}>
                Get Started <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-ink-foreground/25 bg-transparent text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground">
              <a href="mailto:hello@eduflow.ai?subject=EduFlow%20AI%20demo%20request">Request Demo</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span className="font-display font-semibold text-foreground">EduFlow AI</span>
          <span>Smarter Schools. Better Learning.</span>
        </div>
      </footer>
    </div>
  );
}
