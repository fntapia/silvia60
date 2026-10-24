-- SILVIA 60 · Actualización 2: integrantes por grupo + máximo 2 canciones
-- Correr UNA vez en SQL Editor → Run (sin nada seleccionado). Se puede repetir sin problema.

-- 1) Integrantes de cada grupo (nombres separados por coma). La invitación muestra una casilla por persona.
alter table public.grupos add column if not exists integrantes text;

create or replace function public.obtener_grupo(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('slug', slug, 'nombres', nombres, 'cupo', cupo,
    'integrantes', coalesce((select json_agg(trim(x)) from unnest(string_to_array(integrantes, ',')) x where trim(x) <> ''), '[]'::json))
  from grupos where slug = lower(trim(p_slug));
$$;

-- 2) Guardar confirmación: ahora rechaza más de 2 canciones
create or replace function public.guardar_rsvp(p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  g grupos;
  v_cupo int := 10;
  v_asiste text := p ->> 'asiste';
  v_cant int;
  v_token uuid;
  v_canciones jsonb;
  v_menu text := coalesce(p ->> 'menu', 'ninguno');
begin
  if now() > rsvp_limite() then
    raise exception 'La fecha para confirmar ya pasó. Comunicate directamente con la familia.';
  end if;
  if nullif(p ->> 'slug', '') is not null then
    select * into g from grupos where slug = lower(trim(p ->> 'slug'));
    if not found then raise exception 'Invitación no encontrada'; end if;
    v_cupo := g.cupo;
  elsif coalesce(trim(p ->> 'nombre_contacto'), '') = '' then
    raise exception 'Contanos tu nombre';
  end if;
  if v_asiste is null or v_asiste not in ('si', 'no', 'nose') then raise exception 'Elegí si vienen o no'; end if;
  if v_menu not in ('ninguno', 'vegetariano', 'celiaco', 'otro') then v_menu := 'ninguno'; end if;
  v_cant := case when v_asiste = 'si' then greatest(1, coalesce(nullif(p ->> 'cantidad', '')::int, 1)) else 0 end;
  if v_cant > v_cupo then raise exception 'El máximo para esta invitación es %', v_cupo; end if;
  if jsonb_typeof(p -> 'canciones') = 'array' and jsonb_array_length(p -> 'canciones') > 2 then
    raise exception 'Podés sumar hasta 2 canciones';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('tema', left(trim(c ->> 'tema'), 100), 'artista', left(trim(coalesce(c ->> 'artista', '')), 100))), '[]'::jsonb)
    into v_canciones
    from (select c from jsonb_array_elements(coalesce(p -> 'canciones', '[]'::jsonb)) c
          where coalesce(trim(c ->> 'tema'), '') <> '' limit 2) x;

  if g.id is not null then
    insert into rsvps (grupo_id, nombre_contacto, asiste, cantidad, nombres_asistentes, menu, menu_detalle, canciones, mensaje, mostrar_mensaje)
    values (g.id, left(p ->> 'nombre_contacto', 120), v_asiste, v_cant, left(p ->> 'nombres_asistentes', 400), v_menu, left(p ->> 'menu_detalle', 200),
            v_canciones, left(p ->> 'mensaje', 600), coalesce((p ->> 'mostrar_mensaje')::boolean, true))
    on conflict (grupo_id) do update set
      nombre_contacto = excluded.nombre_contacto, asiste = excluded.asiste, cantidad = excluded.cantidad,
      nombres_asistentes = excluded.nombres_asistentes, menu = excluded.menu, menu_detalle = excluded.menu_detalle,
      canciones = excluded.canciones, mensaje = excluded.mensaje, mostrar_mensaje = excluded.mostrar_mensaje, actualizado = now()
    returning token into v_token;
  else
    update rsvps set nombre_contacto = left(p ->> 'nombre_contacto', 120), asiste = v_asiste, cantidad = v_cant,
      nombres_asistentes = left(p ->> 'nombres_asistentes', 400), menu = v_menu, menu_detalle = left(p ->> 'menu_detalle', 200),
      canciones = v_canciones, mensaje = left(p ->> 'mensaje', 600), mostrar_mensaje = coalesce((p ->> 'mostrar_mensaje')::boolean, true), actualizado = now()
    where grupo_id is null and token = nullif(p ->> 'token', '')::uuid
    returning token into v_token;
    if v_token is null then
      insert into rsvps (grupo_id, nombre_contacto, asiste, cantidad, nombres_asistentes, menu, menu_detalle, canciones, mensaje, mostrar_mensaje)
      values (null, left(p ->> 'nombre_contacto', 120), v_asiste, v_cant, left(p ->> 'nombres_asistentes', 400), v_menu, left(p ->> 'menu_detalle', 200),
              v_canciones, left(p ->> 'mensaje', 600), coalesce((p ->> 'mostrar_mensaje')::boolean, true))
      returning token into v_token;
    end if;
  end if;
  return json_build_object('token', v_token);
end $$;

-- Comprobación: tienen que aparecer 2 filas: "integrantes | text" y "guardar_rsvp valida canciones | true"
select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'grupos' and column_name = 'integrantes'
union all
select 'guardar_rsvp valida canciones', (position('hasta 2 canciones' in lower(prosrc)) > 0)::text from pg_proc where proname = 'guardar_rsvp';
