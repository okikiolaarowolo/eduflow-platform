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
    const { data: history } = await supabase.from("ai_messages").select("role,content").eq("conversation_id", conversation_id).order("created_at", { ascending: true }).limit(30);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ content: "EduFlow AI is configured, but the AI provider key has not been added yet. Ask your administrator to configure OPENAI_API_KEY in Supabase Edge Functions." });
    let subjectName = "general school subjects";
    if (subject_id) { const { data: subject } = await supabase.from("subjects").select("name").eq("id", subject_id).eq("school_id", conversation.school_id).maybeSingle(); if (subject?.name) subjectName = subject.name; }
    const system = `You are EduFlow AI, a safe academic tutor for secondary-school students. Teach step-by-step, encourage understanding, and never pretend a student understands when they do not. Use ${subjectName} context when relevant. Align explanations with standard secondary-school curricula. Do not provide unsafe, sexual, hateful, or harmful content. When solving problems, explain the reasoning and then give a short practice question.`;
    const messages = [{ role: "system", content: system }, ...(history ?? []).map((m: {role:string;content:string}) => ({ role: m.role, content: m.content })), { role: "user", content: message.trim() }];
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini", messages, temperature: 0.3, max_tokens: 900 }) });
    if (!response.ok) return json({ error: `AI provider error (${response.status})` }, 502);
    const result = await response.json();
    return json({ content: result.choices?.[0]?.message?.content ?? "I could not generate a response. Please try again.", tokens_used: result.usage?.total_tokens ?? 0 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected AI service error" }, 500); }
});
