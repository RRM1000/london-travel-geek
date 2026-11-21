-- Some registers (Westminster) list applications without a received date; use the day we first
-- saw the application instead, so they still appear in upcoming_openings.
create or replace view public.upcoming_openings with (security_invoker = true) as
select a.id, a.council, a.premises_name, a.address, a.postcode, a.application_type, a.activities,
       coalesce(a.received_on, a.first_seen) as received_on, a.status, a.url, a.place_id,
       p.name as matched_place, p.first_seen as place_first_seen
from public.licence_applications a left join public.places p on p.id = a.place_id
where coalesce(a.received_on, a.first_seen) >= current_date - 183
  and coalesce(a.application_type, '') !~* 'transfer|review|minor|temporary|personal'
order by coalesce(a.received_on, a.first_seen) desc;
