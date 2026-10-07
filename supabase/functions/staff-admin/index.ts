import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type StaffRole = "principal" | "secretary" | "teacher";
type TeachingLevel = "junior_secondary" | "senior_secondary" | "both";
type Department = "science" | "humanities" | "business";
const STAFF_ROLES = new Set<StaffRole>(["principal", "secretary", "teacher"]);
const TEACHING_LEVELS = new Set<TeachingLevel>(["junior_secondary", "senior_secondary", "both"]);
const DEPARTMENTS = new Set<Department>(["science", "humanities", "business"]);

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function cleanIds(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, 50))] : [];
}
function subjectFitsProfile(subject: { school_level: string; department: string | null }, teachingLevel: TeachingLevel, department: Department | null) {
  const levelMatches = teachingLevel === "both" || subject.school_level === "both" || subject.school_level === teachingLevel;
  if (!levelMatches) return false;
  if (teachingLevel === "junior_secondary") return subject.department === null;
  return subject.department === null || subject.department === department;
}
function validateTeachingProfile(teachingLevel: TeachingLevel, department: Department | null) {
  if (!TEACHING_LEVELS.has(teachingLevel)) return "Select JSS, SS or JSS + SS.";
  if (teachingLevel === "junior_secondary" && department) return "JSS teachers do not use an SS department.";
  if (teachingLevel === "senior_secondary" && !department) return "Select the teacher's SS department.";
  if (department && !DEPARTMENTS.has(department)) return "Invalid SS department.";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Staff management is not configured." }, 503);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const userClient = createClient(url, anonKey);
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const callerId = userData.user.id;
    const { data: callerProfile } = await admin.from("profiles").select("school_id, full_name, email").eq("id", callerId).maybeSingle();
    const { data: callerRole } = await admin.from("user_roles").select("role, school_id").eq("user_id", callerId).eq("school_id", callerProfile?.school_id ?? "00000000-0000-0000-0000-000000000000").eq("role", "school_admin").maybeSingle();

    if (!callerProfile?.school_id || !callerRole) return json({ error: "Only a school administrator can manage staff accounts." }, 403);
    const schoolId = callerProfile.school_id;
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 40) || "list";

    if (action === "list") {
      const { data: profiles, error: profilesError } = await admin.from("profiles").select("id, full_name, email, phone").eq("school_id", schoolId).order("full_name");
      if (profilesError) return json({ error: profilesError.message }, 500);
      const ids = (profiles ?? []).map((p) => p.id);
      const { data: roles, error: rolesError } = ids.length
        ? await admin.from("user_roles").select("user_id, role, created_at").in("user_id", ids).eq("school_id", schoolId).in("role", ["school_admin", "principal", "secretary", "teacher"])
        : { data: [], error: null };
      if (rolesError) return json({ error: rolesError.message }, 500);
      const { data: teachers, error: teachersError } = ids.length
        ? await admin.from("teachers").select("user_id, staff_id, is_active, teaching_level, department").eq("school_id", schoolId).in("user_id", ids)
        : { data: [], error: null };
      if (teachersError) return json({ error: teachersError.message }, 500);
      const teacherIds = (teachers ?? []).map((t) => t.user_id).filter(Boolean);
      const { data: teacherRows, error: teacherRowsError } = teacherIds.length
        ? await admin.from("teachers").select("id,user_id").eq("school_id", schoolId).in("user_id", teacherIds)
        : { data: [], error: null };
      if (teacherRowsError) return json({ error: teacherRowsError.message }, 500);
      const teacherDbIds = (teacherRows ?? []).map((t) => t.id);
      const { data: teacherSubjects, error: teacherSubjectsError } = teacherDbIds.length
        ? await admin.from("teacher_subjects").select("teacher_id,subject_id").eq("school_id", schoolId).in("teacher_id", teacherDbIds)
        : { data: [], error: null };
      if (teacherSubjectsError) return json({ error: teacherSubjectsError.message }, 500);

      const teacherByUser = new Map((teachers ?? []).map((t) => [t.user_id, t]));
      const teacherIdByUser = new Map((teacherRows ?? []).map((t) => [t.user_id, t.id]));
      const subjectsByTeacher = new Map<string, string[]>();
      for (const row of teacherSubjects ?? []) {
        const userId = (teacherRows ?? []).find((t) => t.id === row.teacher_id)?.user_id;
        if (userId) subjectsByTeacher.set(userId, [...(subjectsByTeacher.get(userId) ?? []), row.subject_id]);
      }
      const rolesByUser = new Map<string, string[]>();
      for (const row of roles ?? []) rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
      const staffProfiles = (profiles ?? []).filter((profile) => (rolesByUser.get(profile.id) ?? []).some((role) => ["school_admin", "principal", "secretary", "teacher"].includes(role)));
      return json({
        staff: staffProfiles.map((profile) => {
          const teacher = teacherByUser.get(profile.id);
          return {
            ...profile,
            roles: rolesByUser.get(profile.id) ?? [],
            teacher: teacher
              ? { ...teacher, subject_ids: subjectsByTeacher.get(profile.id) ?? [] }
              : null,
          };
        }),
      });
    }

    async function validateSubjects(subjectIds: string[], teachingLevel: TeachingLevel, department: Department | null) {
      if (!subjectIds.length) return [];
      const { data, error } = await admin.from("subjects").select("id,school_level,department,is_archived").eq("school_id", schoolId).in("id", subjectIds);
      if (error) throw new Error(error.message);
      if ((data ?? []).length !== subjectIds.length) throw new Error("One or more selected subjects do not belong to this school.");
      const invalid = (data ?? []).find((s) => s.is_archived || !subjectFitsProfile(s, teachingLevel, department));
      if (invalid) throw new Error("One or more selected subjects do not match the teacher's level or department.");
      return data ?? [];
    }

    async function saveTeacherProfile(userId: string, options: { staffId: string; email: string; phone: string; fullName: string; teachingLevel: TeachingLevel; department: Department | null; subjectIds: string[] }) {
      const profileError = validateTeachingProfile(options.teachingLevel, options.department);
      if (profileError) throw new Error(profileError);
      if (!options.staffId) throw new Error("Staff ID is required for teachers.");
      await validateSubjects(options.subjectIds, options.teachingLevel, options.department);

      const parts = options.fullName.split(/\s+/);
      const { data: existingTeacher } = await admin.from("teachers").select("id").eq("school_id", schoolId).eq("user_id", userId).maybeSingle();
      const payload = {
        school_id: schoolId,
        user_id: userId,
        first_name: parts[0] || options.fullName,
        last_name: parts.slice(1).join(" ") || "Staff",
        staff_id: options.staffId,
        email: options.email || null,
        phone: options.phone || null,
        is_active: true,
        teaching_level: options.teachingLevel,
        department: options.department,
      };
      const teacherResult = existingTeacher
        ? await admin.from("teachers").update(payload).eq("id", existingTeacher.id)
        : await admin.from("teachers").insert(payload);
      if (teacherResult.error) throw new Error(teacherResult.error.message);

      const { data: teacher } = await admin.from("teachers").select("id").eq("school_id", schoolId).eq("user_id", userId).single();
      if (!teacher) throw new Error("Teacher profile could not be loaded after saving.");
      const { error: deleteError } = await admin.from("teacher_subjects").delete().eq("school_id", schoolId).eq("teacher_id", teacher.id);
      if (deleteError) throw new Error(deleteError.message);
      if (options.subjectIds.length) {
        const { error: insertError } = await admin.from("teacher_subjects").insert(options.subjectIds.map((subjectId) => ({ school_id: schoolId, teacher_id: teacher.id, subject_id: subjectId })));
        if (insertError) throw new Error(insertError.message);
      }
    }

    if (action === "invite") {
      const email = clean(body.email, 254).toLowerCase();
      const fullName = clean(body.full_name, 120);
      const phone = clean(body.phone, 40);
      const role = clean(body.role, 30) as StaffRole;
      const staffId = clean(body.staff_id, 80);
      const teachingLevel = clean(body.teaching_level, 40) as TeachingLevel || "junior_secondary";
      const departmentValue = clean(body.department, 40);
      const department = (departmentValue || null) as Department | null;
      const subjectIds = cleanIds(body.subject_ids);

      if (!email || !email.includes("@")) return json({ error: "Enter a valid email address." }, 400);
      if (!fullName) return json({ error: "Full name is required." }, 400);
      if (!STAFF_ROLES.has(role)) return json({ error: "Select Principal, Secretary or Teacher." }, 400);
      if (role === "teacher") {
        const profileError = validateTeachingProfile(teachingLevel, department);
        if (profileError) return json({ error: profileError }, 400);
        if (!staffId) return json({ error: "Staff ID is required for teachers." }, 400);
      }

      const { data: existingAuth } = await admin.auth.admin.getUserByEmail(email);
      let userId = existingAuth?.user?.id ?? null;
      let invited = false;

      if (userId) {
        const { data: existingProfile } = await admin.from("profiles").select("school_id").eq("id", userId).maybeSingle();
        if (existingProfile?.school_id && existingProfile.school_id !== schoolId) return json({ error: "This email is already attached to another school." }, 409);
        const { error } = await admin.from("profiles").upsert({ id: userId, school_id: schoolId, full_name: fullName, email, phone: phone || null }, { onConflict: "id" });
        if (error) return json({ error: error.message }, 500);
      } else {
        const siteUrl = (Deno.env.get("SITE_URL") ?? "https://eduflow-platform-hazel.vercel.app").replace(/\/(auth)?\/?$/, "");
        const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, school_id: schoolId, invited_role: role }, redirectTo: `${siteUrl}/auth` });
        if (inviteError || !inviteData.user) return json({ error: inviteError?.message ?? "Could not send invitation." }, 400);
        userId = inviteData.user.id;
        invited = true;
        const { error } = await admin.from("profiles").upsert({ id: userId, school_id: schoolId, full_name: fullName, email, phone: phone || null }, { onConflict: "id" });
        if (error) return json({ error: error.message }, 500);
      }

      const { data: allRoles } = await admin.from("user_roles").select("id, role, school_id").eq("user_id", userId);
      const currentRoles = (allRoles ?? []).filter((r) => r.school_id === schoolId);
      const currentSchoolRole = currentRoles.find((r) => ["school_admin", "principal", "secretary", "teacher"].includes(r.role));
      if ((allRoles ?? []).some((r) => r.school_id && r.school_id !== schoolId)) return json({ error: "This account is already attached to another school." }, 409);
      if (currentRoles.some((r) => r.role === "student" || r.role === "parent")) return json({ error: "This account is already a student or parent account and cannot be converted into staff." }, 409);
      if (currentSchoolRole?.role === "school_admin") return json({ error: "A school administrator account cannot be reassigned from Staff Management." }, 400);

      if (currentSchoolRole) {
        const { error } = await admin.from("user_roles").update({ role }).eq("id", currentSchoolRole.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await admin.from("user_roles").insert({ user_id: userId, school_id: schoolId, role });
        if (error) return json({ error: error.message }, 500);
      }

      if (role === "teacher") {
        try {
          await saveTeacherProfile(userId, { staffId, email, phone, fullName, teachingLevel, department, subjectIds });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Could not save teacher profile." }, 400);
        }
      }

      await admin.from("activity_log").insert({ school_id: schoolId, actor_id: callerId, actor_name: callerProfile.full_name || callerProfile.email || "School Admin", action: invited ? "invited" : "updated", entity: "staff_account", description: `${invited ? "Invited" : "Updated"} ${fullName} as ${role}` });
      return json({ ok: true, invited, user_id: userId, role });
    }

    if (action === "configure-teacher") {
      const userId = clean(body.user_id, 80);
      const staffId = clean(body.staff_id, 80);
      const teachingLevel = clean(body.teaching_level, 40) as TeachingLevel;
      const departmentValue = clean(body.department, 40);
      const department = (departmentValue || null) as Department | null;
      const subjectIds = cleanIds(body.subject_ids);
      if (!userId) return json({ error: "Teacher account is required." }, 400);
      const { data: target } = await admin.from("profiles").select("id,full_name,email,phone").eq("id", userId).eq("school_id", schoolId).maybeSingle();
      if (!target) return json({ error: "Teacher account not found in this school." }, 404);
      const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("school_id", schoolId).eq("role", "teacher").maybeSingle();
      if (!roleRow) return json({ error: "This account is not a teacher." }, 400);
      try {
        await saveTeacherProfile(userId, { staffId, email: target.email ?? "", phone: target.phone ?? "", fullName: target.full_name, teachingLevel, department, subjectIds });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Could not save teacher profile." }, 400);
      }
      await admin.from("activity_log").insert({ school_id: schoolId, actor_id: callerId, actor_name: callerProfile.full_name || callerProfile.email || "School Admin", action: "updated", entity: "teacher_profile", description: `Updated teaching profile for ${target.full_name}` });
      return json({ ok: true, role: "teacher" });
    }

    if (action === "update-role") {
      const userId = clean(body.user_id, 80);
      const role = clean(body.role, 30) as StaffRole;
      if (!userId || !STAFF_ROLES.has(role)) return json({ error: "Invalid staff role update." }, 400);
      if (userId === callerId) return json({ error: "You cannot change your own role here." }, 400);
      const { data: targetProfile } = await admin.from("profiles").select("id, full_name, email").eq("id", userId).eq("school_id", schoolId).maybeSingle();
      if (!targetProfile) return json({ error: "Staff member not found in this school." }, 404);
      const { data: targetRole } = await admin.from("user_roles").select("id, role").eq("user_id", userId).eq("school_id", schoolId).in("role", ["principal", "secretary", "teacher"]).maybeSingle();
      if (!targetRole) return json({ error: "No staff role found for this account." }, 404);
      const { error } = await admin.from("user_roles").update({ role }).eq("id", targetRole.id);
      if (error) return json({ error: error.message }, 500);
      if (role === "teacher") {
        const { data: teacher } = await admin.from("teachers").select("id").eq("school_id", schoolId).eq("user_id", userId).maybeSingle();
        if (!teacher) {
          const parts = (targetProfile.full_name || "Staff").split(/\s+/);
          const teacherResult = await admin.from("teachers").insert({ school_id: schoolId, user_id: userId, first_name: parts[0] || "Staff", last_name: parts.slice(1).join(" ") || "Staff", staff_id: `STAFF-${userId.slice(0, 6).toUpperCase()}`, email: targetProfile.email, is_active: true, teaching_level: "both", department: null });
          if (teacherResult.error) return json({ error: teacherResult.error.message }, 500);
        } else {
          await admin.from("teachers").update({ is_active: true }).eq("id", teacher.id);
        }
      } else {
        await admin.from("teachers").update({ is_active: false }).eq("school_id", schoolId).eq("user_id", userId);
      }
      await admin.from("activity_log").insert({ school_id: schoolId, actor_id: callerId, actor_name: callerProfile.full_name || callerProfile.email || "School Admin", action: "updated", entity: "staff_account", description: `Changed ${targetProfile.full_name} role to ${role}` });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected staff management error" }, 500);
  }
});
