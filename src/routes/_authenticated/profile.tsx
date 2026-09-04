import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You are not signed in");
      if (!name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() || null }).eq("id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Profile updated");
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell title="My profile" description="Manage your personal EduFlow information">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4" /> Personal information</CardTitle><CardDescription>Your account email is managed by authentication.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
            <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" /></div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="size-4 animate-spin" />} Save profile</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
