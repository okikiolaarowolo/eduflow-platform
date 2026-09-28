-- Finance ledger integrity and reporting hardening
create or replace function public.validate_fee_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_school uuid;
  fee_school uuid;
  session_school uuid;
  term_school uuid;
  term_session uuid;
begin
  select school_id into student_school from public.students where id = new.student_id;
  if student_school is null or student_school <> new.school_id then
    raise exception 'Student does not belong to the fee assignment school';
  end if;

  if new.fee_type_id is not null then
    select school_id into fee_school from public.fee_types where id = new.fee_type_id;
    if fee_school is null or fee_school <> new.school_id then
      raise exception 'Fee type does not belong to the fee assignment school';
    end if;
  end if;

  if new.session_id is not null then
    select school_id into session_school from public.academic_sessions where id = new.session_id;
    if session_school is null or session_school <> new.school_id then
      raise exception 'Academic session does not belong to the fee assignment school';
    end if;
  end if;

  if new.term_id is not null then
    select school_id, session_id into term_school, term_session from public.terms where id = new.term_id;
    if term_school is null or term_school <> new.school_id then
      raise exception 'Term does not belong to the fee assignment school';
    end if;
    if new.session_id is not null and term_session <> new.session_id then
      raise exception 'Term does not belong to the selected academic session';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_fee_assignment_integrity on public.fee_assignments;
create trigger trg_validate_fee_assignment_integrity
before insert or update on public.fee_assignments
for each row execute function public.validate_fee_assignment_integrity();

create or replace function public.validate_fee_payment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_school uuid;
  assignment_student uuid;
  assignment_due numeric(12,2);
  already_paid numeric(12,2);
begin
  select school_id, student_id, amount_due
    into assignment_school, assignment_student, assignment_due
  from public.fee_assignments
  where id = new.fee_assignment_id
  for update;

  if assignment_school is null or assignment_school <> new.school_id then
    raise exception 'Fee assignment does not belong to the payment school';
  end if;

  if assignment_student <> new.student_id then
    raise exception 'Payment student does not match the fee assignment';
  end if;

  if new.amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select coalesce(sum(amount),0) into already_paid
  from public.fee_payments
  where fee_assignment_id = new.fee_assignment_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if already_paid + new.amount > assignment_due then
    raise exception 'Payment exceeds the outstanding fee balance';
  end if;

  new.recorded_by := coalesce(new.recorded_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_validate_fee_payment_integrity on public.fee_payments;
create trigger trg_validate_fee_payment_integrity
before insert or update on public.fee_payments
for each row execute function public.validate_fee_payment_integrity();

create or replace function public.sync_fee_assignment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_id uuid;
  paid numeric(12,2);
  due numeric(12,2);
begin
  assignment_id := coalesce(new.fee_assignment_id, old.fee_assignment_id);
  select amount_due into due from public.fee_assignments where id = assignment_id;
  if due is null then return coalesce(new, old); end if;

  select coalesce(sum(amount),0) into paid
  from public.fee_payments
  where fee_assignment_id = assignment_id;

  update public.fee_assignments
  set status = case
    when amount_due = 0 then 'paid'
    when paid >= amount_due then 'paid'
    when paid > 0 then 'partial'
    else 'unpaid'
  end,
  updated_at = now()
  where id = assignment_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_fee_assignment_status on public.fee_payments;
create trigger trg_sync_fee_assignment_status
after insert or update or delete on public.fee_payments
for each row execute function public.sync_fee_assignment_status();

create or replace function public.generate_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.receipt_number is null or btrim(new.receipt_number) = '' then
    new.receipt_number := 'RCP-' || to_char(coalesce(new.payment_date, now()), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_generate_receipt_number on public.fee_payments;
create trigger trg_generate_receipt_number
before insert on public.fee_payments
for each row execute function public.generate_receipt_number();

create index if not exists idx_fee_assignments_school_session_term on public.fee_assignments(school_id, session_id, term_id);
create index if not exists idx_fee_assignments_school_student on public.fee_assignments(school_id, student_id);
create index if not exists idx_fee_payments_assignment on public.fee_payments(fee_assignment_id);

drop policy if exists fee_assignments_insert_secretary on public.fee_assignments;
drop policy if exists fee_payments_insert_secretary on public.fee_payments;
