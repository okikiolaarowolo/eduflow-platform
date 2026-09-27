import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const AI_MODES = ["tutor", "question-generator", "explanation", "study-plan", "teacher-assistant", "report-assistant", "academic-insights"] as const;
export type AiMode = (typeof AI_MODES)[number];

const MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MAX_MESSAGE = 4000;
const MAX_CONTEXT = 12000;

const BLOCKED = [/\b(kill|hurt)\s+(myself|yourself|someone)\b/i, /\bsuicide\s+method/i, /\bmake\s+(a\s+)?(bomb|explosive|weapon)/i, /\b(porn|sexual\s+content|nude)\b/i, /\bhack\s+(into|the)\b/i];

function modeInstruction(mode: AiMode) {
  switch (mode) {
    case "question-generator": return "Generate school-appropriate practice questions at the requested level. Put answers in a separate section. Never claim they are official exam papers.";
    case "explanation": return "Explain the concept step-by-step with a simple example, then give one short check-for-understanding question.";
    case "study-plan": return "Create a practical study plan with short sessions, review checkpoints, retrieval practice and measurable tasks.";
    case "teacher-assistant": return "Act as a teacher productivity assistant. Draft lesson notes, classroom activities, practice questions, rubrics, feedback and evidence-based academic interventions. Never invent student records, grades, attendance or school policy.";
    case "report-assistant": return "Act as a report-writing assistant. Use ONLY facts supplied in the context. Draft concise teacher or principal remarks. Never invent grades, attendance, rankings, behaviour or achievements; if facts are missing, say what is needed. Start the output with the line 'DRAFT — requires staff review'.";
    case "academic-insights": return "Act as a school academic analyst. Use ONLY the aggregated evidence supplied. Identify strongest/weakest areas, risk signals, confidence limits and 3-5 practical interventions. Never infer individual student facts or invent numbers.";
    default: return "Teach step-by-step and finish with a short practice question.";
  }
}

class AiError extends Error { constructor(public status: number, message: string) { super(message); } }

export const sendAiMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    conversationId: z.string().uuid(),
    message: z.string().trim().min(1).max(MAX_MESSAGE),
    mode: z.enum(AI_MODES),
    subjectId: z.string().uuid().nullable().optional(),
    context: z.string().max(MAX_CONTEXT).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      // Authorization through RLS as the user
      const { data: conv } = await supabase.from("ai_conversations").select("id,school_id,user_id").eq("id", data.conversationId).eq("user_id", userId).maybeSingle();
      if (!conv) throw new AiError(404, "Conversation not found.");
      const schoolId = conv.school_id as string;
      const [{ data: settingsRow }, { data: roleRows }] = await Promise.all([
        supabase.from("ai_settings").select("*").eq("school_id", schoolId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      const settings = settingsRow as { enabled: boolean; teacher_assistant_enabled: boolean; monthly_token_limit: number; max_output_tokens?: number; disclosure_text: string } | null;
      if (!settings?.enabled) throw new AiError(403, "EduFlow AI is disabled for this school.");
      const roles = new Set((roleRows ?? []).map((r) => r.role as string));
      const isManager = roles.has("school_admin") || roles.has("principal") || roles.has("super_admin");
      const isTeacher = roles.has("teacher");
      if (!isManager && !isTeacher) throw new AiError(403, "Your role does not have access to EduFlow AI.");
      if (data.mode === "academic-insights" && !isManager) throw new AiError(403, "AI academic insights are available to school managers.");
      if (!isManager && !settings.teacher_assistant_enabled) throw new AiError(403, "The teacher AI assistant is disabled for this school.");

      const combined = `${data.message}\n${data.context ?? ""}`;
      if (BLOCKED.some((re) => re.test(combined))) throw new AiError(400, "I can only help with safe, school-appropriate requests. Please rephrase.");

      let subjectName = "general school subjects";
      if (data.subjectId) {
        const { data: s } = await supabase.from("subjects").select("name").eq("id", data.subjectId).eq("school_id", schoolId).maybeSingle();
        if (s?.name) subjectName = s.name;
      }
      const { data: history } = await supabase.from("ai_messages").select("role,content").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(12);
      const prior = (history ?? []).reverse().filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 4000) }));

      const maxOut = Math.min(4000, Math.max(128, Number(settings.max_output_tokens ?? 900)));
      const estimatedInput = Math.ceil((combined.length + prior.reduce((n, m) => n + m.content.length, 0) + 1500) / 4);
      const reserve = Math.min(20000, estimatedInput + maxOut);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Save the user message (RLS-checked)
      const { error: userMsgErr } = await supabase.from("ai_messages").insert({ school_id: schoolId, conversation_id: conv.id, user_id: userId, role: "user", content: data.message });
      if (userMsgErr) throw new AiError(500, "Could not save your message.");

      const { data: ok, error: resErr } = await supabaseAdmin.rpc("ai_reserve_tokens" as never, { p_school_id: schoolId, p_tokens: reserve } as never);
      if (resErr) throw new AiError(503, "AI quota service is unavailable. Try again shortly.");
      if (ok !== true) throw new AiError(429, "This school's monthly AI limit has been reached. Ask an administrator to adjust it.");

      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) { await supabaseAdmin.rpc("ai_release_tokens" as never, { p_school_id: schoolId, p_reserved: reserve } as never); throw new AiError(503, "EduFlow AI is not configured."); }

      const instructions = `You are EduFlow AI, a safe academic assistant for secondary-school education. Subject focus: ${subjectName}. ${modeInstruction(data.mode)} Keep answers clear, practical, age-appropriate and under about ${Math.round(maxOut * 0.7)} words. Never expose or infer sensitive personal information. Refuse harmful, sexual, hateful or dangerous content. Do not claim to have accessed school records beyond the supplied context.`;
      const userContent = data.context?.trim() ? `${data.message}\n\nAUTHORIZED CONTEXT:\n${data.context.trim()}` : data.message;

      let text = ""; let inputTokens = 0; let outputTokens = 0;
      try {
        const res = await fetch(GATEWAY, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, Authorization: `Bearer ${apiKey}`, "X-Lovable-AIG-SDK": "fetch" },
          body: JSON.stringify({ model: MODEL, instructions, input: [...prior, { role: "user", content: userContent }], stream: true, store: false, reasoning: { effort: "low" } }),
        });
        if (!res.ok || !res.body) {
          const status = res.status;
          if (status === 429) throw new AiError(429, "EduFlow AI is busy. Please try again in a moment.");
          if (status === 402) throw new AiError(503, "AI credits are exhausted for this workspace.");
          if (status === 403) throw new AiError(403, "The AI provider declined this request.");
          throw new AiError(503, `AI service unavailable (${status}).`);
        }
        const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim(); if (!payload || payload === "[DONE]") continue;
            try {
              const ev = JSON.parse(payload) as { type?: string; delta?: string; response?: { usage?: { input_tokens?: number; output_tokens?: number } }; error?: { message?: string } };
              if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
              else if (ev.type === "response.completed") { inputTokens = Number(ev.response?.usage?.input_tokens ?? 0); outputTokens = Number(ev.response?.usage?.output_tokens ?? 0); }
              else if (ev.type === "response.failed" || ev.type === "error") throw new AiError(503, "The AI service failed to respond.");
            } catch (e) { if (e instanceof AiError) throw e; }
          }
        }
      } catch (e) {
        await supabaseAdmin.rpc("ai_release_tokens" as never, { p_school_id: schoolId, p_reserved: reserve } as never);
        throw e;
      }
      if (!text.trim()) { await supabaseAdmin.rpc("ai_release_tokens" as never, { p_school_id: schoolId, p_reserved: reserve } as never); throw new AiError(503, "The AI returned no response. Please try again."); }
      const total = inputTokens + outputTokens || estimatedInput + Math.ceil(text.length / 4);
      const cost = (inputTokens * 1.25 + outputTokens * 10) / 1_000_000;
      await supabaseAdmin.rpc("ai_finalize_tokens" as never, { p_school_id: schoolId, p_reserved: reserve, p_actual: total, p_cost: cost } as never);
      await supabaseAdmin.from("ai_usage").insert({ school_id: schoolId, user_id: userId, feature: data.mode, model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: total, estimated_cost: cost } as never);
      const disclosure = settings.disclosure_text?.trim() || "AI-generated content may contain mistakes. Review important information.";
      const content = `${text.trim()}\n\n_${disclosure}_`;
      await supabaseAdmin.from("ai_messages").insert({ school_id: schoolId, conversation_id: conv.id, user_id: userId, role: "assistant", content, tokens_used: total } as never);
      await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conv.id);
      return { ok: true as const, content, tokens: total };
    } catch (e) {
      if (e instanceof AiError) return { ok: false as const, status: e.status, error: e.message };
      console.error("AI error", e);
      return { ok: false as const, status: 500, error: "Unexpected AI service error." };
    }
  });
