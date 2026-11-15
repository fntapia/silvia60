-- =====================================================================
--  SILVIA 60 · Actualización 6: confirmar "por ellos" desde el panel, invitación enviada y recordatorios
--  Cómo usarlo: Supabase → SQL Editor → New query → pegá TODO → Run (sin nada seleccionado).
--  Se puede correr más de una vez.
--  NO borra ni cambia invitados ni confirmaciones: solo agrega columnas vacías (las confirmaciones
--  que ya están quedan como "Confirmó el invitado"), dos funciones y dos índices.
--  Al final sale UNA fila de comprobación.
-- =====================================================================

-- 1) Columnas nuevas
alter table public.rsvps add column if not exists origen text not null default 'invitado';   -- 'invitado' | 'panel'
alter table public.rsvps add column if not exists cargado_por text;                            -- quién la cargó desde el panel
alter table public.rsvps add column if not exists cargado_en timestamptz;
alter table public.rsvps add column if not exists nota_interna text;                           -- solo la ve el admin
alter table public.grupos add column if not exists recordatorio timestamptz;                   -- último recordatorio por WhatsApp
alter table public.grupos add column if not exists enviada_en timestamptz;                     -- cuándo se mandó la invitación (vacío = sin marcar)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rsvps_origen_ok' and conrelid = 'public.rsvps'::regclass) then
    alter table public.rsvps add constraint rsvps_origen_ok check (origen in ('invitado', 'panel')
      and char_length(coalesce(cargado_por, '')) <= 40 and char_length(coalesce(nota_interna, '')) <= 500);
  end if;
end $$;

-- 2) Cuando el invitado responde (o cambia su respuesta) desde su link, queda "Confirmó el invitado".
--    Es la misma función de siempre: solo se agrega origen = 'invitado'. La nota interna no se toca.
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
    insert into rsvps (grupo_id, nombre_contacto, asiste, cantidad, nombres_asistentes, menu, menu_detalle, canciones, mensaje, mostrar_mensaje, origen)
    values (g.id, left(p ->> 'nombre_contacto', 120), v_asiste, v_cant, left(p ->> 'nombres_asistentes', 400), v_menu, left(p ->> 'menu_detalle', 200),
            v_canciones, left(p ->> 'mensaje', 600), coalesce((p ->> 'mostrar_mensaje')::boolean, true), 'invitado')
    on conflict (grupo_id) do update set
      nombre_contacto = excluded.nombre_contacto, asiste = excluded.asiste, cantidad = excluded.cantidad,
      nombres_asistentes = excluded.nombres_asistentes, menu = excluded.menu, menu_detalle = excluded.menu_detalle,
      canciones = excluded.canciones, mensaje = excluded.mensaje, mostrar_mensaje = excluded.mostrar_mensaje,
      origen = 'invitado', actualizado = now()
    returning token into v_token;
  else
    update rsvps set nombre_contacto = left(p ->> 'nombre_contacto', 120), asiste = v_asiste, cantidad = v_cant,
      nombres_asistentes = left(p ->> 'nombres_asistentes', 400), menu = v_menu, menu_detalle = left(p ->> 'menu_detalle', 200),
      canciones = v_canciones, mensaje = left(p ->> 'mensaje', 600), mostrar_mensaje = coalesce((p ->> 'mostrar_mensaje')::boolean, true),
      origen = 'invitado', actualizado = now()
    where grupo_id is null and token = nullif(p ->> 'token', '')::uuid
    returning token into v_token;
    if v_token is null then
      insert into rsvps (grupo_id, nombre_contacto, asiste, cantidad, nombres_asistentes, menu, menu_detalle, canciones, mensaje, mostrar_mensaje, origen)
      values (null, left(p ->> 'nombre_contacto', 120), v_asiste, v_cant, left(p ->> 'nombres_asistentes', 400), v_menu, left(p ->> 'menu_detalle', 200),
              v_canciones, left(p ->> 'mensaje', 600), coalesce((p ->> 'mostrar_mensaje')::boolean, true), 'invitado')
      returning token into v_token;
    end if;
  end if;
  return json_build_object('token', v_token);
end $$;

-- 3) "Confirmar por ellos" (solo admin). Una sola confirmación por familia: si ya respondieron, se modifica.
--    No tiene fecha límite (el admin puede cargar después del plazo). El mensaje para Silvia no se toca.
create or replace function public.rsvp_por_admin(p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  g grupos;
  r rsvps;
  v_asiste text := p ->> 'asiste';
  v_cant int;
  v_canciones jsonb;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  select * into g from grupos where id = nullif(p ->> 'grupo_id', '')::uuid;
  if not found then raise exception 'Familia no encontrada'; end if;
  if v_asiste is null or v_asiste not in ('si', 'no', 'nose') then raise exception 'Elegí si vienen o no'; end if;
  v_cant := case when v_asiste = 'si' then greatest(1, coalesce(nullif(p ->> 'cantidad', '')::int, 1)) else 0 end;
  if v_cant > g.cupo then raise exception 'El máximo para esta familia es %', g.cupo; end if;
  select coalesce(jsonb_agg(jsonb_build_object('tema', left(trim(c ->> 'tema'), 100), 'artista', left(trim(coalesce(c ->> 'artista', '')), 100))), '[]'::jsonb)
    into v_canciones
    from (select c from jsonb_array_elements(case when jsonb_typeof(p -> 'canciones') = 'array' then p -> 'canciones' else '[]'::jsonb end) c
          where coalesce(trim(c ->> 'tema'), '') <> '' limit 2) x;

  insert into rsvps (grupo_id, asiste, cantidad, nombres_asistentes, canciones, nota_interna, origen, cargado_por, cargado_en)
  values (g.id, v_asiste, v_cant, case when v_asiste = 'si' then left(p ->> 'nombres_asistentes', 400) end, v_canciones,
          nullif(left(trim(coalesce(p ->> 'nota_interna', '')), 500), ''), 'panel',
          left(coalesce(nullif(trim(p ->> 'por'), ''), 'el panel'), 40), now())
  on conflict (grupo_id) do update set
    asiste = excluded.asiste, cantidad = excluded.cantidad, nombres_asistentes = excluded.nombres_asistentes,
    canciones = excluded.canciones, nota_interna = excluded.nota_interna,
    origen = 'panel', cargado_por = excluded.cargado_por, cargado_en = now(), actualizado = now()
  returning * into r;
  return json_build_object('id', r.id, 'token', r.token);
end $$;
revoke all on function public.rsvp_por_admin(jsonb) from public, anon;
grant execute on function public.rsvp_por_admin(jsonb) to authenticated;

-- 4) Índices para el día del evento (cientos de fotos, trivia con muchos jugadores)
create index if not exists fotos_estado_creado_idx on public.fotos (estado, creado);
create index if not exists trivia_respuestas_pregunta_idx on public.trivia_respuestas (pregunta_id, partida);

-- 5) Comprobación: tiene que salir UNA fila con columnas_ok = true, funciones_ok = true, visitante_no_puede = true,
--    indices = 2, modo_prueba = false, y los números de invitados/confirmaciones que ya tenías.
select
  (select count(*) = 6 from information_schema.columns where table_schema = 'public'
     and ((table_name = 'rsvps' and column_name in ('origen', 'cargado_por', 'cargado_en', 'nota_interna'))
       or (table_name = 'grupos' and column_name in ('recordatorio', 'enviada_en')))) as columnas_ok,
  (select prosrc like '%origen = ''invitado''%' from pg_proc where proname = 'guardar_rsvp' and pronamespace = 'public'::regnamespace)
    and exists (select 1 from pg_proc where proname = 'rsvp_por_admin' and pronamespace = 'public'::regnamespace) as funciones_ok,
  not has_function_privilege('anon', 'public.rsvp_por_admin(jsonb)', 'execute') as visitante_no_puede,
  (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('fotos_estado_creado_idx', 'trivia_respuestas_pregunta_idx')) as indices,
  (select modo_prueba from public.pantalla_estado where id = 1) as modo_prueba,
  (select count(*) from public.grupos) as invitados,
  (select count(*) from public.rsvps) as confirmaciones,
  (select count(*) from public.rsvps where origen = 'invitado') as confirmo_el_invitado;
