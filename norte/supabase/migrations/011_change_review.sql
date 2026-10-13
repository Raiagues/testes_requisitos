-- A aplicação oficial preserva as cotas, versões e vínculos da transação original.
create function norte_private.apply_payload(p_id uuid, p_version integer, p_payload jsonb, p_reviewed boolean) returns public.norte_projects language plpgsql security definer set search_path = '' as $$
declare e jsonb; p public.norte_projects; r jsonb; oldr jsonb; newreq jsonb := '[]'; newver jsonb := '[]'; versions jsonb; stale boolean; oldv jsonb; newversion integer;
begin
  e := public.norte_entitlements(); p := norte_private.assert_owner(p_id);
  perform norte_private.assert_editable(p,e);
  if p.review_required and not p_reviewed then raise exception 'review_required'; end if;
  if p.version <> p_version then raise exception 'version_conflict'; end if;
  perform norte_private.validate_payload(p_payload);
  if jsonb_array_length(p_payload->'requirements') > greatest(jsonb_array_length(p.payload->'requirements'),(e->'limits'->>'requirements')::integer) or jsonb_array_length(p_payload->'verifications') > greatest(jsonb_array_length(p.payload->'verifications'),(e->'limits'->>'verifications')::integer) then raise exception 'content_limit'; end if;
  -- Acima da cota permite correções e remoção, nunca substituir um item por outro novo.
  if jsonb_array_length(p.payload->'requirements') >= (e->'limits'->>'requirements')::integer and exists(select 1 from jsonb_array_elements(p_payload->'requirements') n where not exists(select 1 from jsonb_array_elements(p.payload->'requirements') o where o->>'id' = n->>'id')) then raise exception 'content_limit'; end if;
  if jsonb_array_length(p.payload->'verifications') >= (e->'limits'->>'verifications')::integer and exists(select 1 from jsonb_array_elements(p_payload->'verifications') n where not exists(select 1 from jsonb_array_elements(p.payload->'verifications') o where o->>'id' = n->>'id')) then raise exception 'content_limit'; end if;
  for r in select value from jsonb_array_elements(p_payload->'requirements') loop
    select value into oldr from jsonb_array_elements(p.payload->'requirements') where value->>'id' = r->>'id';
    newversion := case when oldr is null then 1 when (oldr - array['version','findings','status','analysedAt','history','review','reviewer','reviewAt','reviewNote']) is distinct from (r - array['version','findings','status','analysedAt','history','review','reviewer','reviewAt','reviewNote']) then (oldr->>'version')::integer + 1 else (oldr->>'version')::integer end;
    r := r || jsonb_build_object('version',newversion);
    newreq := newreq || jsonb_build_array(r);
  end loop;
  for r in select value from jsonb_array_elements(p_payload->'verifications') loop
    select value into oldv from jsonb_array_elements(p.payload->'verifications') where value->>'id' = r->>'id';
    select coalesce(jsonb_object_agg(q->>'id',q->'version'),'{}') into versions from jsonb_array_elements(newreq) q where r->'requirementIds' ? (q->>'id');
    stale := oldv is not null and coalesce(oldv->'requirementVersions','{}') <> versions and coalesce(oldv->>'evidence','') <> '';
    r := r || jsonb_build_object('stale',stale or coalesce((oldv->>'stale')::boolean,false),'requirementVersions',case when stale then oldv->'requirementVersions' else versions end);
    if oldv is not null and oldv->>'evidence' is distinct from r->>'evidence' then r := r || jsonb_build_object('evidenceHistory',coalesce(oldv->'evidenceHistory','[]') || jsonb_build_array(jsonb_build_object('evidence',oldv->'evidence','result',oldv->'result','requirementVersions',oldv->'requirementVersions','replacedAt',now()))); end if;
    newver := newver || jsonb_build_array(r);
  end loop;
  p_payload := p_payload || jsonb_build_object('requirements',newreq,'verifications',newver);
  insert into public.norte_versions(project_id,version,payload,author_id) values(p.id,p.version,p.payload,norte_private.uid());
  delete from public.norte_links where project_id = p.id;
  delete from public.norte_requirements where project_id = p.id;
  delete from public.norte_verifications where project_id = p.id;
  insert into public.norte_requirements select p.id,item->>'id',(item->>'version')::integer,item from jsonb_array_elements(newreq) item;
  insert into public.norte_verifications select p.id,item->>'id',item from jsonb_array_elements(newver) item;
  insert into public.norte_links select p.id,link.id,v.id,coalesce((v.data->'requirementVersions'->>link.id)::integer,reqrow.version) from public.norte_verifications v cross join lateral jsonb_array_elements_text(v.data->'requirementIds') link(id) join public.norte_requirements reqrow on reqrow.project_id = v.project_id and reqrow.id = link.id where v.project_id = p.id;
  update public.norte_projects set payload = p_payload, version = version + 1, updated_at = now() where id = p.id returning * into p;
  insert into public.norte_audit(actor_id,project_id,event) values(norte_private.uid(),p.id,'project_saved');
  return p;
end $$;
create or replace function public.norte_save_project(p_id uuid,p_version integer,p_payload jsonb) returns public.norte_projects language sql security definer set search_path='' as $$
  select norte_private.apply_payload(p_id,p_version,p_payload,false)
$$;
create table norte_private.changes (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.norte_projects(id) on delete cascade,
  author_id uuid not null references auth.users(id), document_id text,
  title text not null default '', description text not null default '',
  revision integer not null default 1, base_version integer not null,
  base_payload jsonb not null, payload jsonb not null,
  status text not null default 'draft' check(status in ('draft','open','changes_requested','closed','merged')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  merged_by uuid references auth.users(id), merged_at timestamptz, merged_version integer
);
create unique index norte_one_working_copy on norte_private.changes(project_id,author_id,coalesce(document_id,'')) where status in ('draft','open','changes_requested');
create table norte_private.change_reviews (
  id uuid primary key default gen_random_uuid(), change_id uuid not null references norte_private.changes(id) on delete cascade,
  revision integer not null, reviewer_id uuid not null references auth.users(id),
  decision text not null check(decision in ('approve','request_changes','comment')), comment text not null,
  created_at timestamptz not null default now()
);
alter table norte_private.changes enable row level security;
alter table norte_private.change_reviews enable row level security;
revoke all on norte_private.changes,norte_private.change_reviews from public,anon,authenticated;

create function norte_private.change_editable(p_id uuid,p_document text) returns boolean language sql stable security definer set search_path='' as $$
  select case when p_document is null then coalesce(norte_private.team_role(p_id) in ('owner','editor') and public.norte_can_read(p_id),false) else public.norte_document_allowed(p_id,p_document,true) end
$$;
create function norte_private.change_readable(c norte_private.changes) returns boolean language sql stable security definer set search_path='' as $$
  select (c.status<>'draft' or c.author_id=norte_private.uid()) and case when c.document_id is null then public.norte_can_read(c.project_id) else public.norte_document_allowed(c.project_id,c.document_id) end
$$;
create function norte_private.change_view(c norte_private.changes,details boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare before jsonb; after jsonb; result jsonb;
begin
  if not norte_private.change_readable(c) then raise exception 'not_found'; end if;
  result:=jsonb_build_object('id',c.id,'projectId',c.project_id,'authorId',c.author_id,'authorName',(select left(split_part(email,'@',1),60) from auth.users where id=c.author_id),'documentId',c.document_id,'title',c.title,'description',c.description,'revision',c.revision,'baseVersion',c.base_version,'status',c.status,'createdAt',c.created_at,'updatedAt',c.updated_at,'mergedVersion',c.merged_version);
  if details then
    if c.document_id is null then before:=c.base_payload; after:=c.payload;
    else
      select d into before from jsonb_array_elements(coalesce(c.base_payload->'engineering'->'customDocs','[]')) d where d->>'id'=c.document_id;
      select d into after from jsonb_array_elements(coalesce(c.payload->'engineering'->'customDocs','[]')) d where d->>'id'=c.document_id;
    end if;
    result:=result || jsonb_build_object('before',before,'after',after,'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision,'reviewerId',r.reviewer_id,'reviewerName',left(split_part(u.email,'@',1),60),'decision',r.decision,'comment',r.comment,'createdAt',r.created_at) order by r.created_at) from norte_private.change_reviews r join auth.users u on u.id=r.reviewer_id where r.change_id=c.id),'[]'));
  end if;
  return result;
end $$;
create function public.norte_changes(p_id uuid,p_change uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c norte_private.changes;
begin
  if norte_private.team_role(p_id) is null then raise exception 'not_found'; end if;
  if p_change is not null then
    select * into c from norte_private.changes where id=p_change and project_id=p_id;
    if c.id is null then raise exception 'not_found'; end if;
    return norte_private.change_view(c);
  end if;
  return coalesce((select jsonb_agg(norte_private.change_view(ch,false) order by ch.updated_at desc) from norte_private.changes ch where ch.project_id=p_id and norte_private.change_readable(ch)),'[]');
end $$;
create function public.norte_change_save(p_id uuid,p_change uuid,p_revision integer,p_version integer,p_payload jsonb,p_document text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.norte_projects; c norte_private.changes; body text; newdocs jsonb;
begin
  if not norte_private.change_editable(p_id,p_document) then raise exception 'not_found'; end if;
  select * into p from public.norte_projects where id=p_id and deleted_at is null for update;
  if not norte_private.change_editable(p_id,p_document) then raise exception 'not_found'; end if;
  if not norte_private.team_advanced(p) then raise exception 'single_user_plan'; end if;
  if p.archived then raise exception 'archived'; end if;
  if p_version is distinct from p.version then raise exception 'version_conflict'; end if;
  if not public.norte_rate('change-write:'||norte_private.uid(),240,3600) then raise exception 'rate_limit'; end if;
  if p_document is not null then
    perform norte_private.assert_keys(p_payload,array['body']);
    if jsonb_typeof(p_payload->'body') is distinct from 'string' or length(p_payload->>'body')>20000 or not exists(select 1 from jsonb_array_elements(coalesce(p.payload->'engineering'->'customDocs','[]')) d where d->>'id'=p_document) then raise exception 'invalid_fields'; end if;
    body:=p_payload->>'body';
    select jsonb_agg(case when d->>'id'=p_document then d || jsonb_build_object('body',body) else d end) into newdocs from jsonb_array_elements(p.payload->'engineering'->'customDocs') d;
    p_payload:=jsonb_set(p.payload,'{engineering,customDocs}',newdocs);
  end if;
  perform norte_private.validate_payload(p_payload);
  if p_change is null then
    if p_revision is distinct from 0 or exists(select 1 from norte_private.changes where project_id=p_id and author_id=norte_private.uid() and document_id is not distinct from p_document and status in ('draft','open','changes_requested')) then raise exception 'version_conflict'; end if;
    if (select count(*) from norte_private.changes where project_id=p_id)>=100 then raise exception 'change_limit'; end if;
    insert into norte_private.changes(project_id,author_id,document_id,base_version,base_payload,payload) values(p_id,norte_private.uid(),p_document,p.version,p.payload,p_payload) returning * into c;
  else
    select * into c from norte_private.changes where id=p_change and project_id=p_id and author_id=norte_private.uid() and document_id is not distinct from p_document for update;
    if c.id is null then raise exception 'not_found'; end if;
    if p_revision is distinct from c.revision or c.status not in ('draft','open','changes_requested') then raise exception 'version_conflict'; end if;
    update norte_private.changes set payload=p_payload,base_version=p.version,base_payload=p.payload,revision=revision+1,status='draft',updated_at=now() where id=c.id returning * into c;
  end if;
  insert into public.norte_audit(actor_id,project_id,event,result) values(norte_private.uid(),p_id,'change_draft_saved',c.id::text||':'||c.revision);
  return norte_private.change_view(c);
end $$;
create function public.norte_change_action(p_id uuid,p_change uuid,p_revision integer,p_action text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.norte_projects; c norte_private.changes; uid uuid:=norte_private.uid(); allowed boolean; approval boolean; blocked boolean; newdocs jsonb; proposal_body jsonb;
begin
  if norte_private.team_role(p_id) is null then raise exception 'not_found'; end if;
  -- Mesma ordem do salvamento oficial: conta antes do projeto.
  if p_action='merge' and norte_private.team_role(p_id)='owner' then perform public.norte_entitlements(); end if;
  select * into p from public.norte_projects where id=p_id and deleted_at is null for update;
  select * into c from norte_private.changes where id=p_change and project_id=p_id for update;
  if c.id is null or not norte_private.change_readable(c) then raise exception 'not_found'; end if;
  if c.revision is distinct from p_revision or c.status in ('closed','merged') then raise exception 'version_conflict'; end if;
  if not public.norte_rate('change-action:'||uid,120,3600) then raise exception 'rate_limit'; end if;
  if p_action='close' then
    perform norte_private.assert_keys(p_input,array[]::text[]);
    if uid not in (c.author_id,p.owner_id) then raise exception 'not_found'; end if;
    update norte_private.changes set status='closed',updated_at=now() where id=c.id returning * into c;
  else
    if not norte_private.team_advanced(p) then raise exception 'single_user_plan'; end if;
    if p.archived then raise exception 'archived'; end if;
    if c.base_version<>p.version then raise exception 'version_conflict'; end if;
    if p_action='submit' then
      perform norte_private.assert_keys(p_input,array['title','description']);
      if c.author_id<>uid or not norte_private.change_editable(p_id,c.document_id) then raise exception 'not_found'; end if;
      if coalesce(length(trim(p_input->>'title')),0) not between 3 and 160 or coalesce(length(p_input->>'description'),0)>4000 or c.payload=c.base_payload then raise exception 'invalid_fields'; end if;
      update norte_private.changes set title=trim(p_input->>'title'),description=coalesce(p_input->>'description',''),status='open',updated_at=now() where id=c.id returning * into c;
    elsif p_action='review' then
      perform norte_private.assert_keys(p_input,array['decision','comment']);
      if c.status not in ('open','changes_requested') or p_input->>'decision' is null or p_input->>'decision' not in ('approve','request_changes','comment') or coalesce(length(p_input->>'comment'),0)>4000 then raise exception 'invalid_fields'; end if;
      if p_input->>'decision'<>'comment' and (c.author_id=uid or norte_private.team_role(p_id) not in ('owner','reviewer')) then raise exception 'review_not_authorized'; end if;
      if p_input->>'decision' in ('request_changes','comment') and coalesce(length(trim(p_input->>'comment')),0)=0 then raise exception 'invalid_fields'; end if;
      if (select count(*) from norte_private.change_reviews where change_id=c.id)>=300 then raise exception 'change_limit'; end if;
      insert into norte_private.change_reviews(change_id,revision,reviewer_id,decision,comment) values(c.id,c.revision,uid,p_input->>'decision',coalesce(p_input->>'comment',''));
      if p_input->>'decision'='request_changes' then update norte_private.changes set status='changes_requested',updated_at=now() where id=c.id returning * into c; end if;
    elsif p_action='merge' then
      perform norte_private.assert_keys(p_input,array[]::text[]);
      if uid<>p.owner_id or c.status not in ('open','changes_requested') then raise exception 'review_not_authorized'; end if;
      -- O autor e os revisores precisam continuar autorizados no instante da incorporação.
      select exists(select 1 from auth.users u left join norte_private.members m on m.user_id=u.id and m.project_id=p_id and m.expires_at>now() where u.id=c.author_id and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now()) and not exists(select 1 from public.norte_accounts a where a.user_id=u.id and a.suspended) and (u.id=p.owner_id or (m.role='editor' and (m.scope='project' or (c.document_id is not null and m.documents->>c.document_id='edit'))))) into allowed;
      if not allowed then raise exception 'review_not_authorized'; end if;
      select coalesce(bool_or(r.decision='approve'),false),coalesce(bool_or(r.decision='request_changes'),false) into approval,blocked from
        (select distinct on (reviewer_id) * from norte_private.change_reviews where change_id=c.id and revision=c.revision and decision<>'comment' order by reviewer_id,created_at desc,id desc) r
        join auth.users u on u.id=r.reviewer_id and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
        left join norte_private.members m on m.project_id=p_id and m.user_id=r.reviewer_id and m.expires_at>now()
        where r.reviewer_id<>c.author_id and not exists(select 1 from public.norte_accounts a where a.user_id=r.reviewer_id and a.suspended) and (r.reviewer_id=p.owner_id or (m.role='reviewer' and (m.scope='project' or (c.document_id is not null and m.documents ? c.document_id))));
      if not approval or blocked then raise exception 'review_required'; end if;
      if c.document_id is null then proposal_body:=c.payload;
      else
        select jsonb_agg(case when d->>'id'=c.document_id then d || jsonb_build_object('body',(select item->>'body' from jsonb_array_elements(c.payload->'engineering'->'customDocs') item where item->>'id'=c.document_id)) else d end) into newdocs from jsonb_array_elements(p.payload->'engineering'->'customDocs') d;
        proposal_body:=jsonb_set(p.payload,'{engineering,customDocs}',newdocs);
      end if;
      p:=norte_private.apply_payload(p.id,p.version,proposal_body,true);
      update norte_private.changes set status='merged',merged_by=uid,merged_at=now(),merged_version=p.version,updated_at=now() where id=c.id returning * into c;
    else raise exception 'invalid_action'; end if;
  end if;
  insert into public.norte_audit(actor_id,project_id,event,result) values(uid,p_id,'change_'||p_action,c.id::text||':'||c.revision);
  return norte_private.change_view(c);
end $$;
revoke all on all functions in schema norte_private from public,anon,authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('norte_changes','norte_change_save','norte_change_action') loop
    execute format('revoke all on function %s from public,anon',f.signature); execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
