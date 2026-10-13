-- SELECT no Storage também permite assinar URLs; restringimos à leitura
-- autenticada para que cada nova requisição dependa do acesso vigente.
drop policy norte_files_read on storage.objects;
create policy norte_files_read on storage.objects for select to authenticated
  using (storage.allow_only_operation('object.get_authenticated') and public.norte_file_allowed(bucket_id,name));
