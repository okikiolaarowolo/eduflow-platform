import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, GraduationCap, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

const STEPS = ["School", "Session", "Terms", "Classes", "Subjects", "Finish"];

const DEFAULT_TERMS = ["First Term", "Second Term", "Third Term"];
const DEFAULT_CLASSES = ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"];
const DEFAULT_SUBJECTS = [
  "Mathematics",
  "English Language",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
];

function TokenList({
  items,
  setItems,
  placeholder,
}: {
  items: string[];
  setItems: (next: string[]) => void;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  function add() {
    const v = value.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      toast.error(`"${v}" already added`);
      return;
    }
    setItems([...items, v]);
    setValue("");
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="gap-1 py-1.5 pl-3 pr-2 text-sm">
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => setItems(items.filter((i) => i !== item))}
              className="rounded-full p-0.5 hover:bg-background/60"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing added yet.</p>}
      </div>
    </div>
  );
}

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, profile, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [school, setSchool] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    logo_url: "",
  });
  const [sessionName, setSessionName] = useState("");
  const [terms, setTerms] = useState<string[]>(DEFAULT_TERMS);
  const [classes, setClasses] = useState<string[]>(DEFAULT_CLASSES);
  const [subjects, setSubjects] = useState<string[]>(DEFAULT_SUBJECTS);

  if (profile?.school_id) {
    void navigate({ to: "/dashboard", replace: true });
  }

  function next() {
    if (step === 0 && !school.name.trim()) {
      toast.error("School name is required");
      return;
    }
    if (step === 1 && !sessionName.trim()) {
      toast.error("Add an academic session, e.g. 2026/2027");
      return;
    }
    if (step === 2 && terms.length === 0) {
      toast.error("Add at least one term");
      return;
    }
    if (step === 3 && classes.length === 0) {
      toast.error("Add at least one class");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function finish() {
    if (!user) return;
    setBusy(true);
    try {
      const slug =
        school.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") +
        "-" +
        Math.random().toString(36).slice(2, 7);

      const { data: schoolRow, error: schoolError } = await supabase
        .from("schools")
        .insert({
          name: school.name.trim(),
          slug,
          email: school.email.trim() || null,
          phone: school.phone.trim() || null,
          address: school.address.trim() || null,
          website: school.website.trim() || null,
          logo_url: school.logo_url.trim() || null,
          is_demo: false,
          onboarding_completed: true,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (schoolError || !schoolRow) throw new Error(schoolError?.message ?? "Could not create school");
      const schoolId = schoolRow.id;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ school_id: schoolId })
        .eq("id", user.id);
      if (profileError) throw new Error(profileError.message);

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: user.id, school_id: schoolId, role: "school_admin" });
      if (roleError) throw new Error(roleError.message);

      const { data: sessionRow, error: sessionError } = await supabase
        .from("academic_sessions")
        .insert({ school_id: schoolId, name: sessionName.trim(), is_current: true })
        .select("id")
        .single();
      if (sessionError || !sessionRow) throw new Error(sessionError?.message ?? "Session failed");

      if (terms.length > 0) {
        const { error } = await supabase.from("terms").insert(
          terms.map((name, i) => ({
            school_id: schoolId,
            session_id: sessionRow.id,
            name,
            is_current: i === 0,
          })),
        );
        if (error) throw new Error(error.message);
      }
      if (classes.length > 0) {
        const { error } = await supabase
          .from("classes")
          .insert(classes.map((name) => ({ school_id: schoolId, name })));
        if (error) throw new Error(error.message);
      }
      if (subjects.length > 0) {
        const { error } = await supabase
          .from("subjects")
          .insert(subjects.map((name) => ({ school_id: schoolId, name })));
        if (error) throw new Error(error.message);
      }

      await supabase.from("activity_log").insert({
        school_id: schoolId,
        actor_id: user.id,
        actor_name: profile?.full_name ?? user.email ?? "Admin",
        action: "created",
        entity: "school",
        description: `${school.name.trim()} was set up on EduFlow AI`,
      });

      await refresh();
      toast.success("Your school is ready");
      void navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </span>
          <span className="font-display text-lg font-bold">EduFlow AI</span>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="font-display text-xl">Set up your school</CardTitle>
                <CardDescription>
                  Step {step + 1} of {STEPS.length} · {STEPS[step]}
                </CardDescription>
              </div>
            </div>
            <Progress value={((step + 1) / STEPS.length) * 100} className="mt-4" />
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">School name *</Label>
                  <Input
                    id="name"
                    value={school.name}
                    onChange={(e) => setSchool({ ...school, name: e.target.value })}
                    placeholder="Alliance High School"
                  />
                </div>
                <div>
                  <Label htmlFor="email">School email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={school.email}
                    onChange={(e) => setSchool({ ...school, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={school.phone}
                    onChange={(e) => setSchool({ ...school, phone: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={school.address}
                    onChange={(e) => setSchool({ ...school, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={school.website}
                    onChange={(e) => setSchool({ ...school, website: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="logo">Logo URL</Label>
                  <Input
                    id="logo"
                    value={school.logo_url}
                    onChange={(e) => setSchool({ ...school, logo_url: e.target.value })}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <Label htmlFor="session">Academic session *</Label>
                <Input
                  id="session"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="2026/2027"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  This becomes your current session. You can add more later.
                </p>
              </div>
            )}

            {step === 2 && (
              <TokenList items={terms} setItems={setTerms} placeholder="Add a term, e.g. First Term" />
            )}
            {step === 3 && (
              <TokenList items={classes} setItems={setClasses} placeholder="Add a class, e.g. SS1A" />
            )}
            {step === 4 && (
              <TokenList
                items={subjects}
                setItems={setSubjects}
                placeholder="Add a subject, e.g. Mathematics"
              />
            )}

            {step === 5 && (
              <div className="space-y-3 text-sm">
                <p className="font-medium">Review your setup</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>School: {school.name}</li>
                  <li>Session: {sessionName}</li>
                  <li>Terms: {terms.join(", ") || "None"}</li>
                  <li>Classes: {classes.join(", ") || "None"}</li>
                  <li>Subjects: {subjects.join(", ") || "None"}</li>
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0 || busy}
              >
                Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={next}>Continue</Button>
              ) : (
                <Button onClick={finish} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Finish setup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
