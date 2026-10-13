-- O arquivo é entregue pela API após autorização com o JWT do usuário e
-- nova conferência antes da resposta. O caminho vem da tarefa autorizada;
-- o cliente nunca escolhe bucket/caminho nem recebe uma URL assinada.
-- Impede também mintar links pelo SDK do Storage que sobrevivam à revogação.
drop policy norte_files_read on storage.objects;
create policy norte_files_no_direct_access on storage.objects as restrictive
  for select to anon,authenticated
  using (bucket_id not in ('norte-projects','norte-sources','norte-quarantine'));
