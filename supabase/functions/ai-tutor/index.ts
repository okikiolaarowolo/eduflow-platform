import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
    const { conversation_id, message, subject_id } = await req.json();
    if (!conversation_id || typeof message !== "string" || !message.trim()) return json({ error: "A message is required" }, 400);

    const { data: conversation } = await supabase.from("ai_conversations").select("id,school_id,user_id,mode").eq("id", conversation_id).eq("user_id", userData.user.id).single();
    if (!conversation) return json({ error: "Conversation not found" }, 404);

    const { data: settings } = await supabase.from("ai_settings").select("enabled,student_tutor_enabled,teacher_assistant_enabled,monthly_token_limit,disclosure_text").eq("school_id", conversation.school_id).maybeSingle();
    if (settings?.enabled === false) return json({ error: "EduFlow AI is disabled for this school." }, 403);

    const { data: usageRows } = await supabase.from("ai_usage").select("input_tokens,output_tokens").eq("school_id", conversation.school_id).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
    const usedTokens = (usageRows ?? []).reduce((sum, row) => sum + Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0), 0);
    const monthlyLimit = Number(settings?.monthly_token_limit ?? 100000);
    if (monthlyLimit > 0 && usedTokens >= monthlyLimit) return json({ error: "The school's monthly AI usage limit has been reached. Ask an administrator to review the AI settings." }, 429);

    const { data: history } = await supabase.from("ai_messages").select("role,content").eq("conversation_id", conversation_id).order("created_at", { ascending: true }).limit(30);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ content: "EduFlow AI is configured, but the AI provider key has not been added yet. Ask your administrator to configure OPENAI_API_KEY in Supabase Edge Functions." });

    let subjectName = "general school subjects";
    if (subject_id) { const { data: subject } = await supabase.from("subjects").select("name").eq("id", subject_id).eq("school_id", conversation.school_id).maybeSingle(); if (subject?.name) subjectName = subject.name; }
    const mode = conversation.mode || "tutor";
    const modeInstruction = mode === "question-generator" ? "Generate practice questions at the student's level and include answers separately." : mode === "explanation" ? "Explain the concept clearly using a simple example, then check understanding with one short question." : mode === "study-plan" ? "Create a practical study plan with topics, short sessions, review checkpoints, and practice tasks." : "Teach step-by-step and ask a short practice question after the explanation.";
    const system = `You are EduFlow AI, a safe academic assistant for secondary-school students. Use ${subjectName} context when relevant. Align explanations with standard secondary-school curricula. ${modeInstruction} Never invent grades or school records. Do not provide unsafe, sexual, hateful, or harmful content. Keep answers understandable and educational.`;
    const messages = [{ role: "system", content: system }, ...(history ?? []).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })), { role: "user", content: message.trim() }];
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 900 }) });
    if (!response.ok) return json({ error: `AI provider error (${response.status})` }, 502);
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content ?? "I could not generate a response. Please try again.";
    const inputTokens = Number(result.usage?.prompt_tokens ?? 0);
    const outputTokens = Number(result.usage?.completion_tokens ?? 0);
    const totalTokens = Number(result.usage?.total_tokens ?? inputTokens + outputTokens);
    await supabase.from("ai_usage").insert({ school_id: conversation.school_id, user_id: userData.user.id, feature: mode, model, input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost: 0 });
    return json({ content: settings?.disclosure_text ? `${content}\n\n_${settings.disclosure_text}_` : content, tokens_used: totalTokens });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected AI service error" }, 500); }
});
