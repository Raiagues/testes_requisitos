insert into public.norte_sources(id,title,issuer,code,edition,issued_on,official_url,license_status,license_note) values
('nasa-handbook-2016','Systems Engineering Handbook','NASA','NASA/SP-2016-6105','Rev. 2','2016-12-01','https://www.nasa.gov/reference/systems-engineering-handbook/','pending','Conferir créditos de terceiros e integridade do original antes de distribuir. Orientações, não aprovação automática.'),
('npr-7123-1d','NASA Systems Engineering Processes and Requirements','NASA','NPR 7123.1D','D; conferir alterações no NODIS',null,'https://nodis3.gsfc.nasa.gov/displayDir.cfm?t=NPR&c=7123&s=1D','metadata','Condições de aplicabilidade do NPR precisam ser adotadas explicitamente. Metadados; não é cópia integral.'),
('ecss-10-2017','System engineering general requirements','ECSS','ECSS-E-ST-10C','Rev. 1','2017-02-15','https://ecss.nl/standard/ecss-e-st-10c-rev-1-system-engineering-general-requirements-15-february-2017/','metadata','Copyright ESA. Reprodução, indexação e envio a IA aguardam autorização expressa.'),
('ecss-10-06-2009','Technical requirements specification','ECSS','ECSS-E-ST-10-06C','C','2009-03-06','https://ecss.nl/standard/ecss-e-st-10-06c-technical-requirements-specification/','metadata','Copyright ESA. DRD Anexo A e condições de adoção devem ser conferidos em cópia autorizada.'),
('ecss-10-02-2018','Verification','ECSS','ECSS-E-ST-10-02C','Rev. 1','2018-02-01','https://ecss.nl/standard/ecss-e-st-10-02c-rev-1-verification-1-february-2018/','metadata','Copyright ESA. Confirmar anexos normativos e informativos e adaptações em cópia autorizada.'),
('ecss-m-10-01-2008','Organization and conduct of reviews','ECSS','ECSS-M-ST-10-01C','C','2008-11-15','https://ecss.nl/standard/ecss-m-st-10-01c-organization-and-conduct-of-reviews/','metadata','Copyright ESA. Não redistribuir os anexos nem apresentá-los como integralmente implementados.') on conflict(id) do nothing;

create function public.norte_adopt_source(p_project uuid,p_source text,p_decision text,p_rationale text,p_responsible text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform norte_private.assert_owner(p_project);
  if p_decision not in ('confirmed','pending','not_applicable') or length(p_rationale) not between 1 and 4000 or length(p_responsible) not between 1 and 200 then raise exception 'invalid_decision'; end if;
  if not exists(select 1 from public.norte_sources where id = p_source) then raise exception 'not_found'; end if;
  insert into public.norte_source_adoptions(project_id,source_id,decision,rationale,responsible) values(p_project,p_source,p_decision,p_rationale,p_responsible) on conflict(project_id,source_id) do update set decision = excluded.decision,rationale = excluded.rationale,responsible = excluded.responsible;
  insert into public.norte_audit(actor_id,project_id,event) values(auth.uid(),p_project,'source_adoption_changed');
end $$;
revoke all on function public.norte_adopt_source(uuid,text,text,text,text) from public,anon;
grant execute on function public.norte_adopt_source(uuid,text,text,text,text) to authenticated;
