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
const STAFF_ROLES = new Set<StaffRole>(["principal", "secretary", "teacher"]);

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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
        ? await admin.from("teachers").select("user_id, staff_id, is_active").eq("school_id", schoolId).in("user_id", ids)
        : { data: [], error: null };
      if (teachersError) return json({ error: teachersError.message }, 500);

      const teacherByUser = new Map((teachers ?? []).map((t) => [t.user_id, t]));
      const rolesByUser = new Map<string, string[]>();
      for (const row of roles ?? []) rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
      const staffProfiles = (profiles ?? []).filter((profile) => (rolesByUser.get(profile.id) ?? []).some((role) => ["school_admin", "principal", "secretary", "teacher"].includes(role)));
      return json({ staff: staffProfiles.map((profile) => ({ ...profile, roles: rolesByUser.get(profile.id) ?? [], teacher: teacherByUser.get(profile.id) ?? null })) });
    }

    if (action === "invite") {
      const email = clean(body.email, 254).toLowerCase();
      const fullName = clean(body.full_name, 120);
      const phone = clean(body.phone, 40);
      const role = clean(body.role, 30) as StaffRole;
      const staffId = clean(body.staff_id, 80);
      if (!email || !email.includes("@")) return json({ error: "Enter a valid email address." }, 400);
      if (!fullName) return json({ error: "Full name is required." }, 400);
      if (!STAFF_ROLES.has(role)) return json({ error: "Select Principal, Secretary or Teacher." }, 400);
      if (role === "teacher" && !staffId) return json({ error: "Staff ID is required for teachers." }, 400);

      const { data: existingAuth } = await admin.auth.admin.getUserByEmail(email);
      let userId = existingAuth?.user?.id ?? null;
      let invited = false;

      if (userId) {
        const { data: existingProfile } = await admin.from("profiles").select("school_id").eq("id", userId).maybeSingle();
        if (existingProfile?.school_id && existingProfile.school_id !== schoolId) return json({ error: "This email is already attached to another school." }, 409);
        const { error } = await admin.from("profiles").upsert({ id: userId, school_id: schoolId, full_name: fullName, email, phone: phone || null }, { onConflict: "id" });
        if (error) return json({ error: error.message }, 500);
      } else {
        const siteUrl = Deno.env.get("SITE_URL") ?? "https://eduflow-platform-hazel.vercel.app";
        const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName, school_id: schoolId, invited_role: role },
          redirectTo: `${siteUrl}/auth`,
        });
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
        const parts = fullName.split(/\s+/);
        const { data: existingTeacher } = await admin.from("teachers").select("id").eq("school_id", schoolId).eq("user_id", userId).maybeSingle();
        const payload = { school_id: schoolId, user_id: userId, first_name: parts[0] || fullName, last_name: parts.slice(1).join(" ") || "Staff", staff_id: staffId, email, phone: phone || null, is_active: true };
        const result = existingTeacher ? await admin.from("teachers").update(payload).eq("id", existingTeacher.id) : await admin.from("teachers").insert(payload);
        if (result.error) return json({ error: result.error.message }, 500);
      }

      await admin.from("activity_log").insert({ school_id: schoolId, actor_id: callerId, actor_name: callerProfile.full_name || callerProfile.email || "School Admin", action: invited ? "invited" : "updated", entity: "staff_account", description: `${invited ? "Invited" : "Updated"} ${fullName} as ${role}` });
      return json({ ok: true, invited, user_id: userId, role });
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
          const teacherResult = await admin.from("teachers").insert({ school_id: schoolId, user_id: userId, first_name: parts[0] || "Staff", last_name: parts.slice(1).join(" ") || "Staff", staff_id: `STAFF-${userId.slice(0, 6).toUpperCase()}`, email: targetProfile.email, is_active: true });
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
