import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, useSchoolId } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/timetable")({ component: TimetablePage });
const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function TimetablePage() {
  const schoolId = useSchoolId();
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ["classes", schoolId], enabled: !!schoolId, queryFn: () => api.classes(schoolId!) });
  const subjects = useQuery({ queryKey: ["subjects", schoolId], enabled: !!schoolId, queryFn: () => api.subjects(schoolId!) });
  const teachers = useQuery({ queryKey: ["teachers", schoolId], enabled: !!schoolId, queryFn: () => api.teachers(schoolId!) });
  const timetable = useQuery({ queryKey: ["timetable", schoolId], enabled: !!schoolId, queryFn: () => api.timetable(schoolId!) });
  const [form, setForm] = useState({ class_id:"",subject_id:"",teacher_id:"",day:"1",start_time:"08:00",end_time:"09:00",room:"" });
  const add = useMutation({ mutationFn: async()=>{ if(!schoolId||!form.class_id||!form.subject_id)throw new Error("Class and subject are required"); const {error}=await supabase.from("timetable_entries").insert({school_id:schoolId,class_id:form.class_id,subject_id:form.subject_id,teacher_id:form.teacher_id||null,day_of_week:Number(form.day),start_time:form.start_time,end_time:form.end_time,room:form.room||null}); if(error)throw new Error(error.message); },onSuccess:async()=>{setForm({...form,room:""});toast.success("Timetable entry added");await qc.invalidateQueries({queryKey:["timetable",schoolId]});},onError:e=>toast.error(e.message)});
  const remove=useMutation({mutationFn:async(id:string)=>{const{error}=await supabase.from("timetable_entries").delete().eq("id",id);if(error)throw new Error(error.message)},onSuccess:()=>qc.invalidateQueries({queryKey:["timetable",schoolId]}),onError:e=>toast.error(e.message)});
  return <AppShell title="Timetable" description="Build a clear weekly schedule for every class"><div className="space-y-5">
    {isManager&&<Card><CardHeader><CardTitle>Add timetable entry</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Select value={form.class_id} onValueChange={v=>setForm({...form,class_id:v})}><SelectTrigger><SelectValue placeholder="Class"/></SelectTrigger><SelectContent>{(classes.data??[]).map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><Select value={form.subject_id} onValueChange={v=>setForm({...form,subject_id:v})}><SelectTrigger><SelectValue placeholder="Subject"/></SelectTrigger><SelectContent>{(subjects.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><Select value={form.teacher_id} onValueChange={v=>setForm({...form,teacher_id:v})}><SelectTrigger><SelectValue placeholder="Teacher"/></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{(teachers.data??[]).filter(t=>t.is_active).map(t=><SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>)}</SelectContent></Select><Select value={form.day} onValueChange={v=>setForm({...form,day:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{days.map((d,i)=><SelectItem key={d} value={String(i+1)}>{d}</SelectItem>)}</SelectContent></Select><Input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/><Input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/><Input value={form.room} onChange={e=>setForm({...form,room:e.target.value})} placeholder="Room"/><Button onClick={()=>add.mutate()} disabled={add.isPending}><Plus className="size-4"/>Add</Button></CardContent></Card>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(timetable.data??[]).map(entry=><Card key={entry.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><CalendarDays className="size-5 text-primary"/>{isManager&&<Button variant="ghost" size="icon" onClick={()=>remove.mutate(entry.id)}><Trash2 className="size-4"/></Button>}</div><p className="mt-4 font-semibold">{days[entry.day_of_week-1] ?? "Day"}</p><p className="text-lg font-bold">{entry.start_time.slice(0,5)} – {entry.end_time.slice(0,5)}</p><p className="mt-1 text-sm">{(subjects.data??[]).find(s=>s.id===entry.subject_id)?.name ?? "Subject"}</p><p className="text-sm text-muted-foreground">{(classes.data??[]).find(c=>c.id===entry.class_id)?.name ?? "Class"}{entry.room ? ` · ${entry.room}` : ""}</p><p className="text-xs text-muted-foreground">{(teachers.data??[]).find(t=>t.id===entry.teacher_id)?.first_name ?? "No teacher"}</p></CardContent></Card>)}</div>
    {!timetable.isLoading&&!timetable.data?.length&&<EmptyState icon={CalendarDays} title="No timetable entries" description="Add the first lesson above to build your weekly schedule."/>}
  </div></AppShell>;
}
