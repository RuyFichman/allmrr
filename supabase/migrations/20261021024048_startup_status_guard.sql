-- `hidden` is a moderation state: clients may neither set it nor leave it.
-- A founder can still edit a hidden startup; it simply stays hidden.

create or replace function private.startups_classify()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.business_model_id is null then
      new.business_model_id := new.declared_business_model_id;
    end if;
  elsif new.declared_business_model_id is distinct from old.declared_business_model_id
    and new.model_review_status <> 'overridden' then
    -- A new declaration needs a fresh review; an admin override always wins.
    new.business_model_id := new.declared_business_model_id;
    new.model_review_status := 'pending';
  end if;

  if current_user in ('anon', 'authenticated') then
    if tg_op = 'UPDATE' and old.status = 'hidden' then
      new.status := 'hidden';
    elsif new.status = 'hidden' then
      raise exception 'Only moderators can hide a startup'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  return new;
end;
$$;
