import { supabase } from "@/integrations/supabase/client";

export type ClassRow = { id: string; school_id: string; name: string; level: string | null; section: string | null; capacity: number | null; is_archived: boolean };
export type SubjectRow = { id: string; school_id: string; name: string; code: string | null; description: string | null; is_archived: boolean };
export type StudentRow = { id: string; school_id: string; first_name: string; last_name: string; student_id: string; email: string | null; phone: string | null; date_of_birth: string | null; gender: string | null; class_id: string | null; admission_date: string | null; guardian_name: string | null; guardian_phone: string | null; guardian_email: string | null; photo_url: string | null; is_archived: boolean };
export type TeacherRow = { id: string; school_id: string; first_name: string; last_name: string; staff_id: string; email: string | null; phone: string | null; qualification: string | null; photo_url: string | null; is_active: boolean };
export type SchoolRow = { id: string; name: string; slug: string; email: string | null; phone: string | null; address: string | null; website: string | null; logo_url: string | null; is_demo: boolean; onboarding_completed: boolean };
export type SessionRow = { id: string; name: string; is_current: boolean; start_date: string | null; end_date: string | null };
export type TermRow = { id: string; name: string; session_id: string; is_current: boolean; start_date?: string | null; end_date?: string | null };
export type AssessmentRow = { id: string; school_id: string; session_id: string; term_id: string; class_id: string; subject_id: string; title: string; assessment_type: string; max_score: number; weight: number; due_date: string | null; published: boolean };
export type AttendanceSessionRow = { id: string; school_id: string; class_id: string; term_id: string | null; session_date: string; period: string; marked_by: string | null };
export type AttendanceRecordRow = { id: string; attendance_session_id: string; student_id: string; status: string; note: string | null };
export type AssignmentRow = { id: string; school_id: string; teacher_id: string | null; class_id: string; subject_id: string; title: string; description: string | null; due_at: string | null; max_score: number | null; status: string };
export type AnnouncementRow = { id: string; title: string; body: string; audience: string; published: boolean; published_at: string | null; created_at: string };
export type TimetableRow = { id: string; class_id: string; subject_id: string; teacher_id: string | null; day_of_week: number; start_time: string; end_time: string; room: string | null };
export type ActivityRow = { id: string; action: string; entity: string; description: string | null; actor_name: string | null; created_at: string };

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T { if (res.error) throw new Error(res.error.message); return (res.data ?? []) as T; }

export const api = {
  async school(id: string) { const r = await supabase.from("schools").select("*").eq("id", id).maybeSingle(); if (r.error) throw new Error(r.error.message); return r.data as unknown as SchoolRow | null; },
  async classes(id: string) { return unwrap<ClassRow[]>(await supabase.from("classes").select("*").eq("school_id", id).order("name")); },
  async subjects(id: string) { return unwrap<SubjectRow[]>(await supabase.from("subjects").select("*").eq("school_id", id).order("name")); },
  async students(id: string) { return unwrap<StudentRow[]>(await supabase.from("students").select("*").eq("school_id", id).order("first_name")); },
  async teachers(id: string) { return unwrap<TeacherRow[]>(await supabase.from("teachers").select("*").eq("school_id", id).order("first_name")); },
  async sessions(id: string) { return unwrap<SessionRow[]>(await supabase.from("academic_sessions").select("*").eq("school_id", id).order("name", { ascending: false })); },
  async terms(id: string) { return unwrap<TermRow[]>(await supabase.from("terms").select("*").eq("school_id", id).order("name")); },
  async activity(id: string) { return unwrap<ActivityRow[]>(await supabase.from("activity_log").select("*").eq("school_id", id).order("created_at", { ascending: false }).limit(12)); },
  async teacherSubjects(id: string) { return unwrap<{ id: string; teacher_id: string; subject_id: string }[]>(await supabase.from("teacher_subjects").select("*").eq("school_id", id)); },
  async teacherClasses(id: string) { return unwrap<{ id: string; teacher_id: string; class_id: string; is_class_teacher: boolean }[]>(await supabase.from("teacher_classes").select("*").eq("school_id", id)); },
  async classSubjects(id: string) { return unwrap<{ id: string; class_id: string; subject_id: string }[]>(await supabase.from("class_subjects").select("*").eq("school_id", id)); },
  async assessments(id: string) { return unwrap<AssessmentRow[]>(await supabase.from("assessments").select("*").eq("school_id", id).order("created_at", { ascending: false })); },
  async attendanceSessions(id: string) { return unwrap<AttendanceSessionRow[]>(await supabase.from("attendance_sessions").select("*").eq("school_id", id).order("session_date", { ascending: false })); },
  async attendanceRecords(id: string) { return unwrap<AttendanceRecordRow[]>(await supabase.from("attendance_records").select("*").eq("school_id", id)); },
  async assignments(id: string) { return unwrap<AssignmentRow[]>(await supabase.from("assignments").select("*").eq("school_id", id).order("created_at", { ascending: false })); },
  async announcements(id: string) { return unwrap<AnnouncementRow[]>(await supabase.from("announcements").select("*").eq("school_id", id).order("created_at", { ascending: false })); },
  async timetable(id: string) { return unwrap<TimetableRow[]>(await supabase.from("timetable_entries").select("*").eq("school_id", id).order("day_of_week").order("start_time")); },
  async reportCards(id: string) { return unwrap<Record<string, unknown>[]>(await supabase.from("report_cards").select("*").eq("school_id", id).order("created_at", { ascending: false })); },
  async notifications(userId: string) { return unwrap<{ id: string; title: string; body: string; type: string; action_url: string | null; read_at: string | null; created_at: string }[]>(await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30)); },
  async aiConversations(id: string, userId: string) { return unwrap<{ id: string; title: string; mode: string; created_at: string; updated_at: string }[]>(await supabase.from("ai_conversations").select("id,title,mode,created_at,updated_at").eq("school_id", id).eq("user_id", userId).order("updated_at", { ascending: false })); },
  async aiMessages(id: string) { return unwrap<{ id: string; conversation_id: string; role: string; content: string; created_at: string }[]>(await supabase.from("ai_messages").select("id,conversation_id,role,content,created_at").eq("conversation_id", id).order("created_at")); },
  async aiInsights(id: string) { return unwrap<Record<string, unknown>[]>(await supabase.from("ai_learning_insights").select("*").eq("school_id", id).order("created_at", { ascending: false }).limit(50)); },
  async aiUsage(id: string) { return unwrap<Record<string, unknown>[]>(await supabase.from("ai_usage").select("*").eq("school_id", id).order("created_at", { ascending: false }).limit(100)); },
};

export async function logActivity(input: { schoolId: string; actorId: string; actorName: string; action: string; entity: string; description: string }) { await supabase.from("activity_log").insert({ school_id: input.schoolId, actor_id: input.actorId, actor_name: input.actorName, action: input.action, entity: input.entity, description: input.description } as never); }
export async function logAudit(input: { schoolId: string; actorId: string; action: string; entity: string; entityId?: string; beforeData?: unknown; afterData?: unknown }) { await supabase.from("audit_logs").insert({ school_id: input.schoolId, actor_id: input.actorId, action: input.action, entity: input.entity, entity_id: input.entityId ?? null, before_data: input.beforeData ?? null, after_data: input.afterData ?? null } as never); }
