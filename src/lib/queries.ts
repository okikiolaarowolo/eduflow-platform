import { supabase } from "@/integrations/supabase/client";

export type ClassRow = {
  id: string;
  school_id: string;
  name: string;
  level: string | null;
  section: string | null;
  capacity: number | null;
  is_archived: boolean;
};

export type SubjectRow = {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_archived: boolean;
};

export type StudentRow = {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  student_id: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  class_id: string | null;
  admission_date: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  photo_url: string | null;
  is_archived: boolean;
};

export type TeacherRow = {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  staff_id: string;
  email: string | null;
  phone: string | null;
  qualification: string | null;
  photo_url: string | null;
  is_active: boolean;
};

export type SchoolRow = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  logo_url: string | null;
  is_demo: boolean;
  onboarding_completed: boolean;
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

export const api = {
  async school(schoolId: string) {
    const res = await supabase.from("schools").select("*").eq("id", schoolId).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data as unknown as SchoolRow | null;
  },
  async classes(schoolId: string) {
    return unwrap<ClassRow[]>(
      (await supabase
        .from("classes")
        .select("*")
        .eq("school_id", schoolId)
        .order("name")) as never,
    );
  },
  async subjects(schoolId: string) {
    return unwrap<SubjectRow[]>(
      (await supabase
        .from("subjects")
        .select("*")
        .eq("school_id", schoolId)
        .order("name")) as never,
    );
  },
  async students(schoolId: string) {
    return unwrap<StudentRow[]>(
      (await supabase
        .from("students")
        .select("*")
        .eq("school_id", schoolId)
        .order("first_name")) as never,
    );
  },
  async teachers(schoolId: string) {
    return unwrap<TeacherRow[]>(
      (await supabase
        .from("teachers")
        .select("*")
        .eq("school_id", schoolId)
        .order("first_name")) as never,
    );
  },
  async sessions(schoolId: string) {
    return unwrap<
      { id: string; name: string; is_current: boolean; start_date: string | null; end_date: string | null }[]
    >((await supabase.from("academic_sessions").select("*").eq("school_id", schoolId).order("name")) as never);
  },
  async terms(schoolId: string) {
    return unwrap<{ id: string; name: string; session_id: string; is_current: boolean }[]>(
      (await supabase.from("terms").select("*").eq("school_id", schoolId).order("name")) as never,
    );
  },
  async activity(schoolId: string) {
    return unwrap<
      { id: string; action: string; entity: string; description: string | null; actor_name: string | null; created_at: string }[]
    >(
      (await supabase
        .from("activity_log")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(12)) as never,
    );
  },
  async teacherSubjects(schoolId: string) {
    return unwrap<{ id: string; teacher_id: string; subject_id: string }[]>(
      (await supabase.from("teacher_subjects").select("*").eq("school_id", schoolId)) as never,
    );
  },
  async teacherClasses(schoolId: string) {
    return unwrap<{ id: string; teacher_id: string; class_id: string; is_class_teacher: boolean }[]>(
      (await supabase.from("teacher_classes").select("*").eq("school_id", schoolId)) as never,
    );
  },
  async classSubjects(schoolId: string) {
    return unwrap<{ id: string; class_id: string; subject_id: string }[]>(
      (await supabase.from("class_subjects").select("*").eq("school_id", schoolId)) as never,
    );
  },
};

export async function logActivity(input: {
  schoolId: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  description: string;
}) {
  await supabase.from("activity_log").insert({
    school_id: input.schoolId,
    actor_id: input.actorId,
    actor_name: input.actorName,
    action: input.action,
    entity: input.entity,
    description: input.description,
  } as never);
}
