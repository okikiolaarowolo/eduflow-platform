create or replace function public.sync_fee_assignment_status() returns trigger language plpgsql security definer set search_path = public as $$
declare paid numeric(12,2); assignment_id uuid;
begin
  assignment_id := coalesce(new.fee_assignment_id, old.fee_assignment_id);
  select coalesce(sum(amount),0) into paid from public.fee_payments where fee_assignment_id = assignment_id;
  update public.fee_assignments set status = case when amount_due = 0 then 'paid' when paid >= amount_due then 'paid' when paid > 0 then 'partial' else 'unpaid' end, updated_at = now() where id = assignment_id;
  return coalesce(new,old);
end; $$;
