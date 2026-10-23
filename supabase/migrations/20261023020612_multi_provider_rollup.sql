-- Only complete days may contribute to a startup's rollup. A failed sync must not
-- silently remove an account from the total; only an explicit disconnect does.
create or replace function public.refresh_startup_revenue(p_startup_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Concurrent connection syncs must not interleave rollup rebuilds.
  perform 1 from public.startups where id = p_startup_id for update;

  if exists (select 1 from public.revenue_connections where startup_id = p_startup_id) then
    delete from public.revenue_snapshots where startup_id = p_startup_id;

    insert into public.revenue_snapshots (
      startup_id, date, mrr_cents, revenue_cents, revenue_total_cents,
      active_subscriptions, is_estimated
    )
    select
      p_startup_id, s.date, sum(s.mrr_cents), sum(s.revenue_cents),
      sum(s.revenue_total_cents), sum(s.active_subscriptions), bool_or(s.is_estimated)
    from public.connection_revenue_snapshots s
    join public.revenue_connections c on c.id = s.connection_id
    where c.startup_id = p_startup_id and c.disconnected_at is null
    group by s.date
    having count(*) = (
      select count(*) from public.revenue_connections c2
      where c2.startup_id = p_startup_id and c2.disconnected_at is null
    );
  end if;

  perform public.refresh_verification(p_startup_id);
end;
$$;

revoke all on function public.refresh_startup_revenue(uuid) from public, anon, authenticated;
grant execute on function public.refresh_startup_revenue(uuid) to service_role;
