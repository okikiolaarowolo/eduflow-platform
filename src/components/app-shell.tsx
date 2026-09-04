import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Bot, BookOpen, CalendarDays, ClipboardCheck, FileText, GraduationCap, LayoutDashboard, LayoutGrid, LogOut, Menu, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { api } from "@/lib/queries";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Students", icon: Users },
  { to: "/teachers", label: "Teachers", icon: GraduationCap },
  { to: "/classes", label: "Classes", icon: LayoutGrid },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/operations", label: "Operations", icon: CalendarDays },
  { to: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { to: "/results", label: "Results & Grading", icon: FileText },
  { to: "/timetable", label: "Timetable", icon: CalendarDays },
  { to: "/ai-tutor", label: "EduFlow AI", icon: Bot },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function useSchoolId() { const { profile } = useAuth(); return profile?.school_id ?? null; }
export function useSchool() { const schoolId = useSchoolId(); return useQuery({ queryKey: ["school", schoolId], queryFn: () => api.school(schoolId!), enabled: !!schoolId }); }
function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) { const pathname = useRouterState({ select: s => s.location.pathname }); return <nav className="space-y-1">{NAV.map(item => { const active = pathname === item.to || pathname.startsWith(item.to + "/"); return <Link key={item.to} to={item.to} onClick={onNavigate} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")}><item.icon className="size-4"/>{item.label}</Link>; })}</nav>; }
function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) { const { profile, primaryRole, signOut } = useAuth(); const { data: school } = useSchool(); const navigate = useNavigate(); const qc = useQueryClient(); return <div className="flex h-full flex-col bg-sidebar p-4 text-sidebar-foreground"><Link to="/dashboard" onClick={onNavigate} className="mb-6 flex items-center gap-2 px-1"><span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><GraduationCap className="size-5"/></span><span className="font-display text-base font-bold">EduFlow AI</span></Link><div className="mb-6 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3"><p className="truncate text-sm font-semibold">{school?.name ?? "Your school"}</p><p className="mt-0.5 text-xs text-sidebar-foreground/60">{school?.is_demo ? "Demo workspace" : "School workspace"}</p></div><NavLinks onNavigate={onNavigate}/><div className="mt-auto space-y-3 pt-6"><div className="rounded-xl border border-sidebar-border p-3"><p className="truncate text-sm font-medium">{profile?.full_name || profile?.email}</p>{primaryRole&&<Badge variant="secondary" className="mt-2 text-[11px]">{ROLE_LABELS[primaryRole]}</Badge>}</div><Button variant="ghost" className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={async()=>{await qc.cancelQueries();qc.clear();await signOut();void navigate({to:"/auth",replace:true});}}><LogOut className="size-4"/>Sign out</Button></div></div>; }
export function AppShell({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) { const { loading, profile } = useAuth(); const navigate = useNavigate(); const [open,setOpen]=useState(false); useEffect(()=>{if(!loading&&profile&&!profile.school_id)void navigate({to:"/onboarding",replace:true});},[loading,profile,navigate]); if(loading||!profile)return <div className="flex min-h-screen items-center justify-center"><GraduationCap className="size-6 animate-pulse text-muted-foreground"/></div>; return <div className="min-h-screen bg-background"><aside className="fixed inset-y-0 left-0 hidden w-64 lg:block"><SidebarBody/></aside><div className="lg:pl-64"><header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur sm:px-6"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline" size="icon" className="lg:hidden"><Menu className="size-4"/></Button></SheetTrigger><SheetContent side="left" className="w-72 border-none p-0"><SheetTitle className="sr-only">Navigation</SheetTitle><SidebarBody onNavigate={()=>setOpen(false)}/></SheetContent></Sheet><div className="min-w-0 flex-1"><h1 className="truncate font-display text-lg font-bold sm:text-xl">{title}</h1>{description&&<p className="truncate text-xs text-muted-foreground sm:text-sm">{description}</p>}</div><div className="flex shrink-0 items-center gap-2">{actions}</div></header><main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main></div></div>; }
export function EmptyState({ icon: Icon, title, description, action }: { icon: typeof Users; title: string; description: string; action?: ReactNode }) { return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Icon className="size-5"/></span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>{action&&<div className="mt-5">{action}</div>}</div>; }
