-- Public-read bucket for startup logos. Objects live under `{startup_id}/`,
-- and only founders of that startup may write there.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Validates the first path segment as a uuid before the founder check,
-- so malformed paths are denied instead of raising a cast error.
create function private.can_manage_logo(object_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  folder text := (storage.foldername(object_name))[1];
begin
  if folder is null or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_startup_founder(folder::uuid);
end;
$$;

revoke all on function private.can_manage_logo(text) from public;
grant execute on function private.can_manage_logo(text) to authenticated, service_role;

-- Public URLs serve reads; this lets founders list and upsert their own files.
create policy "Founders read their logo files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'logos' and private.can_manage_logo(name));

create policy "Founders upload logos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'logos' and private.can_manage_logo(name));

create policy "Founders replace logos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'logos' and private.can_manage_logo(name))
  with check (bucket_id = 'logos' and private.can_manage_logo(name));

create policy "Founders delete logos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'logos' and private.can_manage_logo(name));
