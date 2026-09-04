import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/queries";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/ai")({ component: AIPage });

function AIPage() {
  const schoolId = useSchoolId(); const { user } = useAuth(); const qc = useQueryClient(); const [text,setText]=useState(""); const [busy,setBusy]=useState(false);
  const conversations = useQuery({queryKey:["ai-conversations",schoolId,user?.id],enabled:!!schoolId&&!!user,queryFn:()=>api.aiConversations(schoolId!,user!.id)});
  const [conversationId,setConversationId]=useState<string|null>(null);
  const messages = useQuery({queryKey:["ai-messages",conversationId],enabled:!!conversationId,queryFn:()=>api.aiMessages(conversationId!)});
  async function send(){ if(!schoolId||!user||!text.trim())return; setBusy(true); try { let cid=conversationId; if(!cid){const {data,error}=await supabase.from("ai_conversations").insert({school_id:schoolId,user_id:user.id,title:text.trim().slice(0,60),mode:"tutor"}).select("id").single();if(error||!data)throw new Error(error?.message??"Could not start conversation");cid=data.id;setConversationId(cid);await qc.invalidateQueries({queryKey:["ai-conversations",schoolId,user.id]});} const prompt=text.trim(); const {error}=await supabase.from("ai_messages").insert({school_id:schoolId,conversation_id:cid,user_id:user.id,role:"user",content:prompt});if(error)throw new Error(error.message); setText(""); await qc.invalidateQueries({queryKey:["ai-messages",cid]}); toast.success("Question saved"); } catch(e){toast.error(e instanceof Error?e.message:"Could not send");} finally{setBusy(false);} }
  return <AppShell title="EduFlow AI" description="AI learning workspace"><div className="grid gap-5 lg:grid-cols-[280px_1fr]"><Card><CardHeader><CardTitle className="text-base">Conversations</CardTitle></CardHeader><CardContent className="space-y-2">{(conversations.data??[]).map(c=><Button key={c.id} variant={conversationId===c.id?"secondary":"ghost"} className="w-full justify-start" onClick={()=>setConversationId(c.id)}>{c.title}</Button>)}{!conversations.data?.length&&<p className="text-sm text-muted-foreground">Start a learning conversation.</p>}</CardContent></Card><Card className="min-h-[560px]"><CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5"/>AI Tutor</CardTitle></CardHeader><CardContent className="flex h-[470px] flex-col"><div className="flex-1 space-y-3 overflow-y-auto">{(messages.data??[]).map(m=><div key={m.id} className={m.role==="user"?"ml-auto max-w-[80%] rounded-2xl bg-primary p-3 text-sm text-primary-foreground":"max-w-[80%] rounded-2xl bg-muted p-3 text-sm"}>{m.content}</div>)}{!messages.data?.length&&<div className="grid h-full place-items-center text-center text-sm text-muted-foreground"><div><Bot className="mx-auto mb-3 size-10"/><p>Ask a question about Mathematics, Physics, Chemistry, Biology, English or any school subject.</p></div></div>}</div><div className="flex gap-2 border-t pt-4"><Input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void send()}} placeholder="Ask EduFlow AI a question..."/><Button onClick={()=>void send()} disabled={busy||!text.trim()}><Send className="size-4"/>Send</Button></div></CardContent></Card></div></AppShell>;
}
