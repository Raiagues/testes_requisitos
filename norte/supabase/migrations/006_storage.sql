alter table public.norte_jobs add column byte_size bigint not null default 0 check(byte_size between 0 and 20971520);
create table norte_private.storage_limits(id boolean primary key default true check(id),account_bytes bigint not null default 268435456,global_bytes bigint not null default 838860800);
insert into norte_private.storage_limits(id) values(true);
create function norte_private.reserve_storage() returns trigger language plpgsql security definer set search_path = '' as $$
declare limits norte_private.storage_limits; total bigint; personal bigint;
begin
  perform pg_advisory_xact_lock(83045714);
  select * into limits from norte_private.storage_limits where id;
  select coalesce(sum(case when status in ('queued','running') then 20971520 else byte_size end),0),coalesce(sum(case when user_id = new.user_id then case when status in ('queued','running') then 20971520 else byte_size end else 0 end),0) into total,personal from public.norte_jobs where status in ('queued','running','ready') or storage_path is not null;
  if personal + 20971520 > limits.account_bytes or total + 20971520 > limits.global_bytes then raise exception 'storage_limit'; end if;
  return new;
end $$;
create trigger norte_storage_reservation before insert on public.norte_jobs for each row execute function norte_private.reserve_storage();
revoke all on function norte_private.reserve_storage() from public,anon,authenticated;

create function public.norte_job_bytes(p_id uuid,p_lease uuid,p_bytes bigint) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_bytes not between 1 and 20971520 then raise exception 'document_size_limit'; end if;
  update public.norte_jobs set byte_size = p_bytes where id = p_id and lease_token = p_lease and status = 'running' and lease_until > now();
  return found;
end $$;
create function public.norte_cleanup_done(p_paths text[]) returns void language sql security definer set search_path = '' as $$
  update public.norte_jobs set storage_path = null,byte_size = 0 where status = 'cancelled' and storage_path = any(p_paths)
$$;
create function public.norte_admin_storage(p_account bigint default null,p_global bigint default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare limits norte_private.storage_limits;
begin
  perform norte_private.require_admin('technical');
  if p_account is not null or p_global is not null then
    if p_account is null or p_global is null or p_account not between 20971520 and 1099511627776 or p_global < p_account or p_global > 10995116277760 then raise exception 'invalid_storage_limit'; end if;
    update norte_private.storage_limits set account_bytes = p_account,global_bytes = p_global where id;
    insert into public.norte_audit(actor_id,event) values(auth.uid(),'storage_limits_changed');
  end if;
  select * into limits from norte_private.storage_limits where id;
  return to_jsonb(limits);
end $$;
revoke all on function public.norte_job_bytes(uuid,uuid,bigint),public.norte_cleanup_done(text[]) from public,anon,authenticated;
grant execute on function public.norte_job_bytes(uuid,uuid,bigint),public.norte_cleanup_done(text[]) to service_role;
revoke all on function public.norte_admin_storage(bigint,bigint) from public,anon;
grant execute on function public.norte_admin_storage(bigint,bigint) to authenticated;
