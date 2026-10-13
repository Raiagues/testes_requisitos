create function norte_private.pick_fields(value jsonb,keys text[]) returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(key,v),'{}') from jsonb_each(value) e(key,v) where key=any(keys)
$$;
-- Uma concessão por documento nunca entrega o payload completo. Só os campos
-- efetivamente utilizados pelo modelo selecionado atravessam esta fronteira.
create function public.norte_document_snapshot(p_id uuid,p_document text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.norte_projects; rkeys text[]:='{}'; vkeys text[]:='{}'; reqs jsonb; vers jsonb; eng jsonb;
begin
  if not public.norte_document_allowed(p_id,p_document) then raise exception 'not_found'; end if;
  select * into p from public.norte_projects where id=p_id;
  if not norte_private.document_exists(p,p_document) then raise exception 'not_found'; end if;
  if public.norte_can_read(p_id) then return to_jsonb(p); end if;
  eng:=jsonb_build_object('profile',p.profile,'customDocs',coalesce((select jsonb_agg(d) from jsonb_array_elements(coalesce(p.payload->'engineering'->'customDocs','[]')) d where d->>'id'=p_document),'[]'::jsonb));
  if p_document in ('REQ','RTM','ANA','VCD') then
    rkeys:=array['id','text','version','subsystem','acceptance','reference']; vkeys:=array['id','requirementIds'];
    if p_document='REQ' then rkeys:=rkeys || array['type','origin','sourceVersion','parent','rationale','owner','method','condition','limit','review']; end if;
    if p_document='ANA' then rkeys:=rkeys || array['findings']; end if;
    if p_document in ('RTM','VCD') then vkeys:=vkeys || array['status','result','requirementVersions','stale','evidence']; end if;
  elsif p_document in ('VVP','RES') then vkeys:=array['id','title','status','result','evidence','criteria','method','owner','review','procedure','conditions','note'];
  elsif p_document='REG' then rkeys:=array['id','review','reviewer','reviewNote']; eng:=eng || jsonb_build_object('changes',coalesce(p.payload->'engineering'->'changes','[]'));
  elsif p_document in ('ARQ','PRE','DET') then rkeys:=array['id','subsystem','architecture'];
  elsif p_document='TPM' then rkeys:=array['id','acceptance']; vkeys:=array['id'];
  end if;
  if p_document='CRN' or p_document ~ '^(PROC|ATA)-' then
    eng:=eng || jsonb_build_object('schedules',jsonb_build_object(p.profile,coalesce((select jsonb_agg(norte_private.pick_fields(r,array['id','title','date','active','phase','position','prepDays','closeDays','focus'])) from jsonb_array_elements(coalesce(p.payload->'engineering'->'schedules'->p.profile,'[]')) r where p_document='CRN' or r->>'id'=regexp_replace(p_document,'^(PROC|ATA)-','')),'[]')));
  end if;
  select coalesce(jsonb_agg(norte_private.pick_fields(r,rkeys)),'[]') into reqs from jsonb_array_elements(p.payload->'requirements') r where cardinality(rkeys)>0;
  select coalesce(jsonb_agg(norte_private.pick_fields(v,vkeys)),'[]') into vers from jsonb_array_elements(p.payload->'verifications') v where cardinality(vkeys)>0;
  return jsonb_build_object('id',p.id,'name',p.name,'profile',p.profile,'version',p.version,'updated_at',p.updated_at,'payload',jsonb_build_object('requirements',reqs,'verifications',vers,'engineering',eng,'settings','{}'::jsonb,'lifecycle','{}'::jsonb));
end $$;
revoke all on function norte_private.pick_fields(jsonb,text[]) from public,anon,authenticated;
revoke all on function public.norte_document_snapshot(uuid,text) from public,anon;
grant execute on function public.norte_document_snapshot(uuid,text) to authenticated;
