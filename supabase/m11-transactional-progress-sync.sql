-- Transactional progress sync with deletion tombstones. Apply after
-- supabase-setup.sql. Safe to re-run.
create or replace function public.sync_merge_node(p_local jsonb,p_remote jsonb,p_tombstones jsonb,p_path text)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare
  v_result jsonb; v_children jsonb := '{}'::jsonb; v_name text; v_child jsonb;
  v_local_children jsonb := '{}'::jsonb; v_remote_children jsonb := '{}'::jsonb;
  v_deleted_at timestamptz; v_mtime timestamptz;
begin
  if p_local is null then v_result:=p_remote;
  elsif p_remote is null then v_result:=p_local;
  elsif p_local->>'type'='dir' and p_remote->>'type'='dir' then v_result:=p_local||p_remote;
  elsif coalesce((p_remote->>'mtime')::numeric,0)>=coalesce((p_local->>'mtime')::numeric,0) then v_result:=p_remote;
  else v_result:=p_local;
  end if;
  if v_result is null then return null; end if;

  if v_result->>'type'='dir' then
    if p_local->>'type'='dir' then v_local_children:=coalesce(p_local->'children','{}'::jsonb); end if;
    if p_remote->>'type'='dir' then v_remote_children:=coalesce(p_remote->'children','{}'::jsonb); end if;
    for v_name in
      select key from (
        select jsonb_object_keys(v_local_children) key
        union select jsonb_object_keys(v_remote_children) key
      ) names
    loop
      v_child:=public.sync_merge_node(v_local_children->v_name,v_remote_children->v_name,p_tombstones,
        case when p_path='/' then '/'||v_name else p_path||'/'||v_name end);
      if v_child is not null then v_children:=v_children||jsonb_build_object(v_name,v_child); end if;
    end loop;
    v_result:=jsonb_set(v_result,'{children}',v_children,true);
    v_result:=jsonb_set(v_result,'{mtime}',to_jsonb(greatest(
      coalesce((p_local->>'mtime')::numeric,0),coalesce((p_remote->>'mtime')::numeric,0)
    )),true);
  end if;

  select max((item->>'deletedAt')::timestamptz) into v_deleted_at
    from jsonb_array_elements(coalesce(p_tombstones,'[]'::jsonb)) item
    where item->>'path'=p_path;
  v_mtime:=to_timestamp(coalesce((v_result->>'mtime')::numeric,0)/1000.0);
  if v_result->>'type'='dir' then
    if v_children='{}'::jsonb and v_deleted_at is not null and v_deleted_at>=v_mtime then return null; end if;
  elsif v_deleted_at is not null and v_deleted_at>=v_mtime then return null;
  end if;
  return v_result;
end; $$;

create or replace function public.merge_progress(p_data jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_uid uuid:=auth.uid(); v_existing jsonb; v_existing_updated_at timestamptz;
  v_tombstones jsonb; v_merged jsonb; v_preferred jsonb; v_key text; v_array jsonb;
  v_local_time timestamptz; v_remote_time timestamptz;
  v_incoming_tombstones jsonb; v_existing_tombstones jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or p_data->>'v' is distinct from '1' or jsonb_typeof(p_data->'fs') is distinct from 'object' or p_data->'fs'->>'type' is distinct from 'dir' then
    raise exception 'Invalid progress payload' using errcode='22023';
  end if;
  v_incoming_tombstones:=case when jsonb_typeof(p_data->'syncTombstones')='array' then p_data->'syncTombstones' else '[]'::jsonb end;
  insert into public.progress(user_id,data,tickets,updated_at)
    values(v_uid,p_data,jsonb_array_length(case when jsonb_typeof(p_data->'done')='array' then p_data->'done' else '[]'::jsonb end),now())
    on conflict(user_id) do nothing;
  select data,updated_at into v_existing,v_existing_updated_at
    from public.progress where user_id=v_uid for update;
  if v_existing is null or v_existing->'fs' is null then
    v_tombstones:=v_incoming_tombstones;
    v_merged:=jsonb_set(p_data,'{fs}',public.sync_merge_node(null,p_data->'fs',v_tombstones,'/'),true);
  else
    v_local_time:=case when v_existing->>'syncUpdatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?Z$' then (v_existing->>'syncUpdatedAt')::timestamptz else null end;
    v_remote_time:=case when p_data->>'syncUpdatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?Z$' then (p_data->>'syncUpdatedAt')::timestamptz else null end;
    if coalesce(v_remote_time,'-infinity'::timestamptz)>=coalesce(v_local_time,v_existing_updated_at,'-infinity'::timestamptz) then v_preferred:=p_data;
    else v_preferred:=v_existing; end if;
    select coalesce(jsonb_agg(item order by item->>'path'),'[]'::jsonb) into v_tombstones
      from (
        select distinct on (item->>'path') item from (
          select jsonb_array_elements(v_existing_tombstones) item
          union all select jsonb_array_elements(v_incoming_tombstones) item
        ) all_items
        where item->>'path' like '/%' and item->>'path'<>'/' and item ? 'deletedAt'
          and item->>'path' !~ '(^|/)[.][.]?(/|$)'
          and item->>'deletedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?Z$'
        order by item->>'path',case when item->>'deletedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?Z$' then (item->>'deletedAt')::timestamptz else '-infinity'::timestamptz end desc
      ) newest;
    v_merged:=jsonb_set(v_preferred,'{fs}',public.sync_merge_node(v_existing->'fs',p_data->'fs',v_tombstones,'/'),true);
    foreach v_key in array array['done','learned','history','readM','cmdsM','nudged','times'] loop
      select coalesce(jsonb_agg(value),'[]'::jsonb) into v_array from (
        select value from jsonb_array_elements(case when jsonb_typeof(v_existing->v_key)='array' then v_existing->v_key else '[]'::jsonb end)
        union
        select value from jsonb_array_elements(case when jsonb_typeof(p_data->v_key)='array' then p_data->v_key else '[]'::jsonb end)
      ) merged_items;
      v_merged:=jsonb_set(v_merged,array[v_key],v_array,true);
    end loop;
    v_merged:=jsonb_set(v_merged,'{hints}',(case when jsonb_typeof(v_existing->'hints')='object' then v_existing->'hints' else '{}'::jsonb end)||(case when jsonb_typeof(p_data->'hints')='object' then p_data->'hints' else '{}'::jsonb end),true);
    v_merged:=jsonb_set(v_merged,'{xp}',to_jsonb(greatest(coalesce((v_existing->>'xp')::numeric,0),coalesce((p_data->>'xp')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{mission}',to_jsonb(greatest(coalesce((v_existing->>'mission')::numeric,0),coalesce((p_data->>'mission')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{finished}',to_jsonb(coalesce((v_existing->>'finished')::boolean,false) or coalesce((p_data->>'finished')::boolean,false)),true);
  end if;
  v_merged:=jsonb_set(v_merged,'{syncTombstones}',coalesce(v_tombstones,'[]'::jsonb),true);
  v_merged:=jsonb_set(v_merged,'{syncUpdatedAt}',to_jsonb(coalesce(nullif(greatest(
    coalesce(nullif(v_existing->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz),
    coalesce(nullif(p_data->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz)),'-infinity'::timestamptz),now())::text),true);
  update public.progress set data=v_merged,tickets=jsonb_array_length(case when jsonb_typeof(v_merged->'done')='array' then v_merged->'done' else '[]'::jsonb end),updated_at=now() where user_id=v_uid;
  return v_merged;
end; $$;

drop policy if exists "users insert their own progress" on public.progress;
drop policy if exists "users update their own progress" on public.progress;
revoke insert,update on public.progress from anon,authenticated;
revoke all on function public.sync_merge_node(jsonb,jsonb,jsonb,text) from public;
revoke all on function public.merge_progress(jsonb) from public;
grant execute on function public.merge_progress(jsonb) to authenticated;
 then (p_data->>'syncUpdatedAt')::timestamptz else null end;
    v_existing_tombstones:=case when jsonb_typeof(v_existing->'syncTombstones')='array' then v_existing->'syncTombstones' else '[]'::jsonb end;
    if coalesce(v_remote_time,'-infinity'::timestamptz)>=coalesce(v_local_time,v_existing_updated_at,'-infinity'::timestamptz) then v_preferred:=p_data;
    else v_preferred:=v_existing; end if;
    select coalesce(jsonb_agg(item order by item->>'path'),'[]'::jsonb) into v_tombstones
      from (
        select distinct on (item->>'path') item from (
          select jsonb_array_elements(coalesce(v_existing->'syncTombstones','[]'::jsonb)) item
          union all select jsonb_array_elements(coalesce(p_data->'syncTombstones','[]'::jsonb)) item
        ) all_items
        where item->>'path' like '/%' and item ? 'deletedAt'
        order by item->>'path',(item->>'deletedAt')::timestamptz desc
      ) newest;
    v_merged:=jsonb_set(v_preferred,'{fs}',public.sync_merge_node(v_existing->'fs',p_data->'fs',v_tombstones,'/'),true);
    foreach v_key in array array['done','learned','history','readM','cmdsM','nudged','times'] loop
      select coalesce(jsonb_agg(value),'[]'::jsonb) into v_array from (
        select value from jsonb_array_elements(case when jsonb_typeof(v_existing->v_key)='array' then v_existing->v_key else '[]'::jsonb end)
        union
        select value from jsonb_array_elements(case when jsonb_typeof(p_data->v_key)='array' then p_data->v_key else '[]'::jsonb end)
      ) merged_items;
      v_merged:=jsonb_set(v_merged,array[v_key],v_array,true);
    end loop;
    v_merged:=jsonb_set(v_merged,'{hints}',coalesce(v_existing->'hints','{}'::jsonb)||coalesce(p_data->'hints','{}'::jsonb),true);
    v_merged:=jsonb_set(v_merged,'{xp}',to_jsonb(greatest(coalesce((v_existing->>'xp')::numeric,0),coalesce((p_data->>'xp')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{mission}',to_jsonb(greatest(coalesce((v_existing->>'mission')::numeric,0),coalesce((p_data->>'mission')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{finished}',to_jsonb(coalesce((v_existing->>'finished')::boolean,false) or coalesce((p_data->>'finished')::boolean,false)),true);
  end if;
  v_merged:=jsonb_set(v_merged,'{syncTombstones}',coalesce(v_tombstones,'[]'::jsonb),true);
  v_merged:=jsonb_set(v_merged,'{syncUpdatedAt}',to_jsonb(coalesce(nullif(greatest(
    coalesce(nullif(v_existing->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz),
    coalesce(nullif(p_data->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz)),'-infinity'::timestamptz),now())::text),true);
  update public.progress set data=v_merged,tickets=jsonb_array_length(case when jsonb_typeof(v_merged->'done')='array' then v_merged->'done' else '[]'::jsonb end),updated_at=now() where user_id=v_uid;
  return v_merged;
end; $$;

drop policy if exists "users insert their own progress" on public.progress;
drop policy if exists "users update their own progress" on public.progress;
revoke insert,update on public.progress from anon,authenticated;
revoke all on function public.sync_merge_node(jsonb,jsonb,jsonb,text) from public;
revoke all on function public.merge_progress(jsonb) from public;
grant execute on function public.merge_progress(jsonb) to authenticated;

        order by item->>'path',case when item->>'deletedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,3})?Z
      ) newest;
    v_merged:=jsonb_set(v_preferred,'{fs}',public.sync_merge_node(v_existing->'fs',p_data->'fs',v_tombstones,'/'),true);
    foreach v_key in array array['done','learned','history','readM','cmdsM','nudged','times'] loop
      select coalesce(jsonb_agg(value),'[]'::jsonb) into v_array from (
        select value from jsonb_array_elements(case when jsonb_typeof(v_existing->v_key)='array' then v_existing->v_key else '[]'::jsonb end)
        union
        select value from jsonb_array_elements(case when jsonb_typeof(p_data->v_key)='array' then p_data->v_key else '[]'::jsonb end)
      ) merged_items;
      v_merged:=jsonb_set(v_merged,array[v_key],v_array,true);
    end loop;
    v_merged:=jsonb_set(v_merged,'{hints}',coalesce(v_existing->'hints','{}'::jsonb)||coalesce(p_data->'hints','{}'::jsonb),true);
    v_merged:=jsonb_set(v_merged,'{xp}',to_jsonb(greatest(coalesce((v_existing->>'xp')::numeric,0),coalesce((p_data->>'xp')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{mission}',to_jsonb(greatest(coalesce((v_existing->>'mission')::numeric,0),coalesce((p_data->>'mission')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{finished}',to_jsonb(coalesce((v_existing->>'finished')::boolean,false) or coalesce((p_data->>'finished')::boolean,false)),true);
  end if;
  v_merged:=jsonb_set(v_merged,'{syncTombstones}',coalesce(v_tombstones,'[]'::jsonb),true);
  v_merged:=jsonb_set(v_merged,'{syncUpdatedAt}',to_jsonb(coalesce(nullif(greatest(
    coalesce(nullif(v_existing->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz),
    coalesce(nullif(p_data->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz)),'-infinity'::timestamptz),now())::text),true);
  update public.progress set data=v_merged,tickets=jsonb_array_length(case when jsonb_typeof(v_merged->'done')='array' then v_merged->'done' else '[]'::jsonb end),updated_at=now() where user_id=v_uid;
  return v_merged;
end; $$;

drop policy if exists "users insert their own progress" on public.progress;
drop policy if exists "users update their own progress" on public.progress;
revoke insert,update on public.progress from anon,authenticated;
revoke all on function public.sync_merge_node(jsonb,jsonb,jsonb,text) from public;
revoke all on function public.merge_progress(jsonb) from public;
grant execute on function public.merge_progress(jsonb) to authenticated;
 then (p_data->>'syncUpdatedAt')::timestamptz else null end;
    v_existing_tombstones:=case when jsonb_typeof(v_existing->'syncTombstones')='array' then v_existing->'syncTombstones' else '[]'::jsonb end;
    if coalesce(v_remote_time,'-infinity'::timestamptz)>=coalesce(v_local_time,v_existing_updated_at,'-infinity'::timestamptz) then v_preferred:=p_data;
    else v_preferred:=v_existing; end if;
    select coalesce(jsonb_agg(item order by item->>'path'),'[]'::jsonb) into v_tombstones
      from (
        select distinct on (item->>'path') item from (
          select jsonb_array_elements(coalesce(v_existing->'syncTombstones','[]'::jsonb)) item
          union all select jsonb_array_elements(coalesce(p_data->'syncTombstones','[]'::jsonb)) item
        ) all_items
        where item->>'path' like '/%' and item ? 'deletedAt'
        order by item->>'path',(item->>'deletedAt')::timestamptz desc
      ) newest;
    v_merged:=jsonb_set(v_preferred,'{fs}',public.sync_merge_node(v_existing->'fs',p_data->'fs',v_tombstones,'/'),true);
    foreach v_key in array array['done','learned','history','readM','cmdsM','nudged','times'] loop
      select coalesce(jsonb_agg(value),'[]'::jsonb) into v_array from (
        select value from jsonb_array_elements(case when jsonb_typeof(v_existing->v_key)='array' then v_existing->v_key else '[]'::jsonb end)
        union
        select value from jsonb_array_elements(case when jsonb_typeof(p_data->v_key)='array' then p_data->v_key else '[]'::jsonb end)
      ) merged_items;
      v_merged:=jsonb_set(v_merged,array[v_key],v_array,true);
    end loop;
    v_merged:=jsonb_set(v_merged,'{hints}',coalesce(v_existing->'hints','{}'::jsonb)||coalesce(p_data->'hints','{}'::jsonb),true);
    v_merged:=jsonb_set(v_merged,'{xp}',to_jsonb(greatest(coalesce((v_existing->>'xp')::numeric,0),coalesce((p_data->>'xp')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{mission}',to_jsonb(greatest(coalesce((v_existing->>'mission')::numeric,0),coalesce((p_data->>'mission')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{finished}',to_jsonb(coalesce((v_existing->>'finished')::boolean,false) or coalesce((p_data->>'finished')::boolean,false)),true);
  end if;
  v_merged:=jsonb_set(v_merged,'{syncTombstones}',coalesce(v_tombstones,'[]'::jsonb),true);
  v_merged:=jsonb_set(v_merged,'{syncUpdatedAt}',to_jsonb(coalesce(nullif(greatest(
    coalesce(nullif(v_existing->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz),
    coalesce(nullif(p_data->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz)),'-infinity'::timestamptz),now())::text),true);
  update public.progress set data=v_merged,tickets=jsonb_array_length(case when jsonb_typeof(v_merged->'done')='array' then v_merged->'done' else '[]'::jsonb end),updated_at=now() where user_id=v_uid;
  return v_merged;
end; $$;

drop policy if exists "users insert their own progress" on public.progress;
drop policy if exists "users update their own progress" on public.progress;
revoke insert,update on public.progress from anon,authenticated;
revoke all on function public.sync_merge_node(jsonb,jsonb,jsonb,text) from public;
revoke all on function public.merge_progress(jsonb) from public;
grant execute on function public.merge_progress(jsonb) to authenticated;
 then (item->>'deletedAt')::timestamptz else '-infinity'::timestamptz end desc
      ) newest;
    v_merged:=jsonb_set(v_preferred,'{fs}',public.sync_merge_node(v_existing->'fs',p_data->'fs',v_tombstones,'/'),true);
    foreach v_key in array array['done','learned','history','readM','cmdsM','nudged','times'] loop
      select coalesce(jsonb_agg(value),'[]'::jsonb) into v_array from (
        select value from jsonb_array_elements(case when jsonb_typeof(v_existing->v_key)='array' then v_existing->v_key else '[]'::jsonb end)
        union
        select value from jsonb_array_elements(case when jsonb_typeof(p_data->v_key)='array' then p_data->v_key else '[]'::jsonb end)
      ) merged_items;
      v_merged:=jsonb_set(v_merged,array[v_key],v_array,true);
    end loop;
    v_merged:=jsonb_set(v_merged,'{hints}',coalesce(v_existing->'hints','{}'::jsonb)||coalesce(p_data->'hints','{}'::jsonb),true);
    v_merged:=jsonb_set(v_merged,'{xp}',to_jsonb(greatest(coalesce((v_existing->>'xp')::numeric,0),coalesce((p_data->>'xp')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{mission}',to_jsonb(greatest(coalesce((v_existing->>'mission')::numeric,0),coalesce((p_data->>'mission')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{finished}',to_jsonb(coalesce((v_existing->>'finished')::boolean,false) or coalesce((p_data->>'finished')::boolean,false)),true);
  end if;
  v_merged:=jsonb_set(v_merged,'{syncTombstones}',coalesce(v_tombstones,'[]'::jsonb),true);
  v_merged:=jsonb_set(v_merged,'{syncUpdatedAt}',to_jsonb(coalesce(nullif(greatest(
    coalesce(nullif(v_existing->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz),
    coalesce(nullif(p_data->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz)),'-infinity'::timestamptz),now())::text),true);
  update public.progress set data=v_merged,tickets=jsonb_array_length(case when jsonb_typeof(v_merged->'done')='array' then v_merged->'done' else '[]'::jsonb end),updated_at=now() where user_id=v_uid;
  return v_merged;
end; $$;

drop policy if exists "users insert their own progress" on public.progress;
drop policy if exists "users update their own progress" on public.progress;
revoke insert,update on public.progress from anon,authenticated;
revoke all on function public.sync_merge_node(jsonb,jsonb,jsonb,text) from public;
revoke all on function public.merge_progress(jsonb) from public;
grant execute on function public.merge_progress(jsonb) to authenticated;
 then (p_data->>'syncUpdatedAt')::timestamptz else null end;
    v_existing_tombstones:=case when jsonb_typeof(v_existing->'syncTombstones')='array' then v_existing->'syncTombstones' else '[]'::jsonb end;
    if coalesce(v_remote_time,'-infinity'::timestamptz)>=coalesce(v_local_time,v_existing_updated_at,'-infinity'::timestamptz) then v_preferred:=p_data;
    else v_preferred:=v_existing; end if;
    select coalesce(jsonb_agg(item order by item->>'path'),'[]'::jsonb) into v_tombstones
      from (
        select distinct on (item->>'path') item from (
          select jsonb_array_elements(coalesce(v_existing->'syncTombstones','[]'::jsonb)) item
          union all select jsonb_array_elements(coalesce(p_data->'syncTombstones','[]'::jsonb)) item
        ) all_items
        where item->>'path' like '/%' and item ? 'deletedAt'
        order by item->>'path',(item->>'deletedAt')::timestamptz desc
      ) newest;
    v_merged:=jsonb_set(v_preferred,'{fs}',public.sync_merge_node(v_existing->'fs',p_data->'fs',v_tombstones,'/'),true);
    foreach v_key in array array['done','learned','history','readM','cmdsM','nudged','times'] loop
      select coalesce(jsonb_agg(value),'[]'::jsonb) into v_array from (
        select value from jsonb_array_elements(case when jsonb_typeof(v_existing->v_key)='array' then v_existing->v_key else '[]'::jsonb end)
        union
        select value from jsonb_array_elements(case when jsonb_typeof(p_data->v_key)='array' then p_data->v_key else '[]'::jsonb end)
      ) merged_items;
      v_merged:=jsonb_set(v_merged,array[v_key],v_array,true);
    end loop;
    v_merged:=jsonb_set(v_merged,'{hints}',coalesce(v_existing->'hints','{}'::jsonb)||coalesce(p_data->'hints','{}'::jsonb),true);
    v_merged:=jsonb_set(v_merged,'{xp}',to_jsonb(greatest(coalesce((v_existing->>'xp')::numeric,0),coalesce((p_data->>'xp')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{mission}',to_jsonb(greatest(coalesce((v_existing->>'mission')::numeric,0),coalesce((p_data->>'mission')::numeric,0))),true);
    v_merged:=jsonb_set(v_merged,'{finished}',to_jsonb(coalesce((v_existing->>'finished')::boolean,false) or coalesce((p_data->>'finished')::boolean,false)),true);
  end if;
  v_merged:=jsonb_set(v_merged,'{syncTombstones}',coalesce(v_tombstones,'[]'::jsonb),true);
  v_merged:=jsonb_set(v_merged,'{syncUpdatedAt}',to_jsonb(coalesce(nullif(greatest(
    coalesce(nullif(v_existing->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz),
    coalesce(nullif(p_data->>'syncUpdatedAt','')::timestamptz,'-infinity'::timestamptz)),'-infinity'::timestamptz),now())::text),true);
  update public.progress set data=v_merged,tickets=jsonb_array_length(case when jsonb_typeof(v_merged->'done')='array' then v_merged->'done' else '[]'::jsonb end),updated_at=now() where user_id=v_uid;
  return v_merged;
end; $$;

drop policy if exists "users insert their own progress" on public.progress;
drop policy if exists "users update their own progress" on public.progress;
revoke insert,update on public.progress from anon,authenticated;
revoke all on function public.sync_merge_node(jsonb,jsonb,jsonb,text) from public;
revoke all on function public.merge_progress(jsonb) from public;
grant execute on function public.merge_progress(jsonb) to authenticated;
