import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/operations")({ component: OperationsPage });

function OperationsPage() {
  return <AppShell title="School Operations" description="Academic management, assessments, learning and communication"><div className="rounded-2xl border p-6"><h2 className="text-lg font-semibold">School Operations</h2><p className="mt-2 text-sm text-muted-foreground">Academic sessions, assessments, assignments, attendance, timetable, reports and announcements are being wired into the full platform.</p></div></AppShell>;
}
