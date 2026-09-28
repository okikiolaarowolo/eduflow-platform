alter table public.fee_assignments add column if not exists title text;
update public.fee_assignments fa
set title = coalesce(ft.name, 'Fee')
from public.fee_types ft
where fa.fee_type_id = ft.id and (fa.title is null or btrim(fa.title) = '');
update public.fee_assignments set title = 'Fee' where title is null or btrim(title) = '';
alter table public.fee_assignments alter column title set not null;
