import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppShell, useSchoolId } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { ClassRow, StudentRow } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/students/$studentId")({
  component: StudentProfile,
});

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function StudentProfile() {
  const { studentId } = Route.useParams();
  const schoolId = useSchoolId();

  const q = useQuery({
    queryKey: ["student", studentId, schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const student = data as unknown as StudentRow | null;
      let klass: ClassRow | null = null;
      if (student?.class_id) {
        const res = await supabase.from("classes").select("*").eq("id", student.class_id).maybeSingle();
        klass = (res.data as unknown as ClassRow | null) ?? null;
      }
      return { student, klass };
    },
  });

  if (q.isLoading) {
    return (
      <AppShell title="Student">
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const student = q.data?.student;
  if (!student) {
    return (
      <AppShell title="Student">
        <p className="text-sm text-muted-foreground">
          This student was not found in your school.{" "}
          <Link to="/students" className="text-primary underline">
            Back to students
          </Link>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`${student.first_name} ${student.last_name}`}
      description={`Student ID ${student.student_id}`}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Student information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" value={student.first_name} />
            <Field label="Last name" value={student.last_name} />
            <Field label="Email" value={student.email} />
            <Field label="Phone" value={student.phone} />
            <Field label="Date of birth" value={student.date_of_birth} />
            <Field label="Gender" value={student.gender} />
            <Field label="Admission date" value={student.admission_date} />
            <Field label="Class" value={q.data?.klass?.name ?? null} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Guardian</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label="Name" value={student.guardian_name} />
              <Field label="Phone" value={student.guardian_phone} />
              <Field label="Email" value={student.guardian_email} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={student.is_archived ? "outline" : "secondary"}>
                {student.is_archived ? "Archived" : "Active"}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
