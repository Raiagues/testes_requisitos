create or replace function norte_private.assert_keys(v jsonb,allowed text[]) returns void language plpgsql set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v) k where not k=any(allowed)) then raise exception 'invalid_fields'; end if;
end $$;
create function norte_private.check_team_documents() returns trigger language plpgsql set search_path='' as $$
declare value jsonb:=new.payload; d jsonb; ids text[]:=array[]::text[];
begin
  if value->'engineering' ? 'customDocs' then
    if jsonb_typeof(value->'engineering'->'customDocs') is distinct from 'array' or jsonb_array_length(value->'engineering'->'customDocs')>100 then raise exception 'invalid_fields'; end if;
    for d in select * from jsonb_array_elements(value->'engineering'->'customDocs') loop
      perform norte_private.assert_keys(d,array['id','code','title','kind','content','source','clause','reviews','flow','maturity','state','owner','body','note']);
      if coalesce(d->>'id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$' or d->>'id'=any(ids) or d->>'id' in ('NEC','CON','MOE','SEMP','REQ','HSI','ARQ','TPM','PRE','DET','INT','VVP','VCD','RTM','RES','DES','DSP','REG','ANA','CRN') or d->>'id' ~ '^(PROC|ATA)-' then raise exception 'invalid_fields'; end if;
      ids:=ids || (d->>'id');
      if coalesce(d->>'kind','') not in ('company','optional') or d->>'source' is distinct from '' or d->>'state' is distinct from 'Rascunho' or jsonb_typeof(d->'reviews') is distinct from 'array' or jsonb_typeof(d->'title') is distinct from 'string' or length(d->>'title') not between 1 and 300 or (d ? 'body' and (jsonb_typeof(d->'body') is distinct from 'string' or length(d->>'body')>20000)) then raise exception 'invalid_fields'; end if;
    end loop;
  end if;
  return new;
end $$;
create trigger norte_project_document_integrity before insert or update of payload on public.norte_projects for each row execute function norte_private.check_team_documents();
create trigger norte_change_document_integrity before insert or update of payload on norte_private.changes for each row execute function norte_private.check_team_documents();

-- O endpoint anterior também revoga a concessão nova. Histórico e propostas
-- permanecem privados e preservados; as funções exigem acesso atual ao projeto.
create or replace function public.norte_project_access(p_id uuid,p_user uuid,p_scope text,p_expires timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare p public.norte_projects; e jsonb;
begin
  e:=public.norte_entitlements(); p:=norte_private.assert_owner(p_id);
  if p_scope='revoke' then
    delete from public.norte_access where project_id=p.id and user_id=p_user;
    delete from norte_private.members where project_id=p.id and user_id=p_user;
    delete from norte_private.presence where project_id=p.id and user_id=p_user;
    update norte_private.invitations set status='revoked' where project_id=p.id and status='pending' and email=(select lower(email) from auth.users where id=p_user);
  else
    if e->>'tier'='essential' then raise exception 'single_user_plan'; end if;
    if p_expires is null or p_expires<=now() or p_expires>now()+interval '90 days' or p_scope is null or p_scope not in ('read','review') then raise exception 'invalid_grant'; end if;
    if exists(select 1 from norte_private.members where project_id=p.id and user_id=p_user) then raise exception 'invalid_grant'; end if;
    insert into public.norte_access(project_id,user_id,scope,expires_at,granted_by) values(p.id,p_user,p_scope,p_expires,p.owner_id) on conflict(project_id,user_id) do update set scope=excluded.scope,expires_at=excluded.expires_at;
  end if;
  update public.norte_projects set team_version=team_version+1 where id=p.id;
  insert into public.norte_audit(actor_id,project_id,event) values(auth.uid(),p.id,'project_access_changed');
end $$;
revoke all on all functions in schema norte_private from public,anon,authenticated;
