import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/ai-tutor")({ component: AiTutorPage });

function AiTutorPage() {
  const schoolId = useSchoolId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [prompt, setPrompt] = useState("");
  const conversations = useQuery({ queryKey: ["ai-conversations", schoolId, user?.id], enabled: !!schoolId && !!user, queryFn: () => api.aiConversations(schoolId!, user!.id) });
  const subjects = useQuery({ queryKey: ["subjects", schoolId], enabled: !!schoolId, queryFn: () => api.subjects(schoolId!) });
  const messages = useQuery({ queryKey: ["ai-messages", conversationId], enabled: !!conversationId, queryFn: () => api.aiMessages(conversationId) });
  useEffect(() => { if (!conversationId && conversations.data?.[0]) setConversationId(conversations.data[0].id); }, [conversationId, conversations.data]);
  const createConversation = useMutation({ mutationFn: async () => { if (!schoolId || !user) throw new Error("You must be signed in"); const { data, error } = await supabase.from("ai_conversations").insert({ school_id: schoolId, user_id: user.id, title: "New tutoring session", context_subject_id: subjectId || null, mode: "tutor" }).select("id").single(); if (error) throw new Error(error.message); return data.id; }, onSuccess: async id => { setConversationId(id); await qc.invalidateQueries({ queryKey: ["ai-conversations", schoolId, user?.id] }); }, onError: e => toast.error(e.message) });
  const send = useMutation({ mutationFn: async () => { if (!schoolId || !user || !conversationId || !prompt.trim()) throw new Error("Write a question first"); const text = prompt.trim(); setPrompt(""); const { error: insertError } = await supabase.from("ai_messages").insert({ school_id: schoolId, conversation_id: conversationId, user_id: user.id, role: "user", content: text }); if (insertError) throw new Error(insertError.message); const { data, error } = await supabase.functions.invoke("ai-tutor", { body: { conversation_id: conversationId, message: text, subject_id: subjectId || null } }); if (error) throw new Error(error.message); if (data?.content) { const { error: saveError } = await supabase.from("ai_messages").insert({ school_id: schoolId, conversation_id: conversationId, user_id: user.id, role: "assistant", content: data.content, tokens_used: Number(data.tokens_used ?? 0) }); if (saveError) throw new Error(saveError.message); } else throw new Error("The AI service returned no response"); }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["ai-messages", conversationId] }); await qc.invalidateQueries({ queryKey: ["ai-conversations", schoolId, user?.id] }); }, onError: e => toast.error(e.message) });
  const remove = useMutation({ mutationFn: async (id:string) => { const { error } = await supabase.from("ai_conversations").delete().eq("id",id); if(error)throw new Error(error.message); }, onSuccess: async()=>{setConversationId("");await qc.invalidateQueries({queryKey:["ai-conversations",schoolId,user?.id]});},onError:e=>toast.error(e.message)});
  const current = conversations.data?.find(c=>c.id===conversationId);
  return <AppShell title="EduFlow AI Tutor" description="Personalized explanations, practice and study support"><div className="grid gap-5 lg:grid-cols-[280px_1fr]">
    <Card className="h-fit"><CardHeader><CardTitle className="flex items-center justify-between text-base">Sessions<Button size="icon" variant="outline" onClick={()=>createConversation.mutate()} disabled={createConversation.isPending}><Plus className="size-4"/></Button></CardTitle></CardHeader><CardContent className="space-y-2">{(conversations.data??[]).map(c=><div key={c.id} className="flex items-center gap-1"><Button variant={c.id===conversationId?"secondary":"ghost"} className="min-w-0 flex-1 justify-start" onClick={()=>setConversationId(c.id)}><span className="truncate">{c.title}</span></Button><Button size="icon" variant="ghost" onClick={()=>remove.mutate(c.id)}><Trash2 className="size-3.5"/></Button></div>)}{!conversations.data?.length&&<p className="text-sm text-muted-foreground">Start a new tutoring session.</p>}</CardContent></Card>
    <Card className="min-h-[620px]"><CardHeader className="border-b"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary"/>{current?.title ?? "AI learning assistant"}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Ask for explanations, worked examples, revision plans or practice questions.</p></div><Select value={subjectId} onValueChange={setSubjectId}><SelectTrigger className="w-[190px]"><SelectValue placeholder="Subject context"/></SelectTrigger><SelectContent>{(subjects.data??[]).filter(s=>!s.is_archived).map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div></CardHeader><CardContent className="flex h-[520px] flex-col p-0"><ScrollArea className="flex-1 p-5"><div className="space-y-4">{!conversationId?<EmptyState icon={Bot} title="Your AI tutor is ready" description="Create a session and ask your first question."/>:(messages.data??[]).map(m=><div key={m.id} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role==="user"?"bg-primary text-primary-foreground":"bg-muted"}`}>{m.content}</div></div>)}</div></ScrollArea><div className="border-t p-4"><div className="flex gap-2"><Input value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send.mutate();}}} placeholder="Ask EduFlow AI anything about your learning..." disabled={!conversationId||send.isPending}/><Button onClick={()=>send.mutate()} disabled={!conversationId||!prompt.trim()||send.isPending}>{send.isPending?<Loader2 className="size-4 animate-spin"/>:<Send className="size-4"/>}</Button></div></div></CardContent></Card>
  </div></AppShell>;
}
