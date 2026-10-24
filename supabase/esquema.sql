-- =====================================================================
--  SILVIA 60 · Base de datos (Supabase)
--  Cómo usarlo: en Supabase → SQL Editor → New query → pegá TODO este
--  archivo → Run. Se puede volver a correr sin romper nada.
--  El email del administrador está en la línea marcada con  <<< (cambialo si va a entrar otra persona)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Ajustes (cambiá acá si cambia la fecha límite para confirmar)
-- ---------------------------------------------------------------------
-- Datos del evento (se editan desde el panel → Evento; config.js queda de respaldo)
create table if not exists public.evento_config (
  id int primary key default 1 check (id = 1),
  fecha_evento timestamptz not null default '2026-12-05 22:30:00-03',
  texto_puntual text not null default '¡Por favor, sé puntual!',
  fecha_limite_rsvp timestamptz not null default '2026-11-20 23:59:59-03',
  actualizado timestamptz not null default now()
);
insert into public.evento_config (id) values (1) on conflict do nothing;

create or replace function public.rsvp_limite() returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce((select fecha_limite_rsvp from evento_config where id = 1), '2026-11-20 23:59:59-03'::timestamptz);
$$;

create or replace function public.espacio_originales_bytes() returns bigint
language sql immutable as $$ select 800::bigint * 1024 * 1024 $$;

-- ---------------------------------------------------------------------
-- Administradores
-- ---------------------------------------------------------------------
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;   -- sin políticas: nadie la lee desde la web

insert into public.admins (email) values (lower('TU-EMAIL@ejemplo.com'))   -- <<< email del administrador (el mismo con el que vas a entrar al panel)
on conflict do nothing;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  nombres text not null check (char_length(nombres) between 1 and 120),
  cupo int not null default 2 check (cupo between 1 and 30),
  telefono text,
  integrantes text,      -- nombres separados por coma: "Marta, Carlos, Sofi"
  creado timestamptz not null default now()
);
alter table public.grupos add column if not exists integrantes text;

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid unique references public.grupos(id) on delete cascade,   -- null = link general
  token uuid not null unique default gen_random_uuid(),
  nombre_contacto text,
  asiste text not null check (asiste in ('si', 'no', 'nose')),
  cantidad int not null default 0 check (cantidad between 0 and 30),
  nombres_asistentes text,
  menu text not null default 'ninguno' check (menu in ('ninguno', 'vegetariano', 'celiaco', 'otro')),
  menu_detalle text,
  canciones jsonb not null default '[]'::jsonb,
  mensaje text,
  mostrar_mensaje boolean not null default true,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create table if not exists public.fotos (
  id uuid primary key,
  ruta text not null,
  ruta_original text,
  bytes bigint not null default 0,
  autor text not null,
  leyenda text,
  estado text not null default 'publicada' check (estado in ('publicada', 'oculta', 'revision')),
  favorita boolean not null default false,
  dispositivo text,
  puntajes jsonb,
  creado timestamptz not null default now()
);
create index if not exists fotos_dispositivo_idx on public.fotos (dispositivo, creado);
create index if not exists fotos_creado_idx on public.fotos (creado);

create table if not exists public.pantalla_estado (
  id int primary key default 1 check (id = 1),
  muro_pausado boolean not null default false,
  modo text not null default 'fotos' check (modo in ('fotos', 'trivia')),
  mensaje_manual text not null default '',
  mensaje_ts timestamptz,
  modo_prueba boolean not null default false     -- habilita /fotos antes del día (se maneja desde el panel)
);
alter table public.pantalla_estado add column if not exists modo_prueba boolean not null default false;
insert into public.pantalla_estado (id) values (1) on conflict do nothing;

create table if not exists public.trivia_preguntas (
  id uuid primary key default gen_random_uuid(),
  orden int not null default 1,
  texto text not null check (char_length(texto) between 1 and 200),
  tipo text not null default 'multiple',          -- 'multiple' (2 a 4 opciones) o 'vf' (Verdadero, Falso)
  opciones jsonb not null,
  correcta int not null,
  dato text,                                       -- se muestra al revelar la respuesta (opcional)
  imagen text,
  activa boolean not null default true,
  creado timestamptz not null default now(),
  constraint trivia_preguntas_formato_ok check (
    tipo in ('multiple', 'vf') and jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) between 2 and 4
    and (tipo <> 'vf' or jsonb_array_length(opciones) = 2)
    and correcta >= 0 and correcta < jsonb_array_length(opciones)
    and (dato is null or char_length(dato) <= 160))
);

create table if not exists public.trivia_estado (
  id int primary key default 1 check (id = 1),
  partida uuid,
  fase text not null default 'apagada' check (fase in ('apagada', 'lobby', 'pregunta', 'resultado', 'ranking', 'podio')),
  pregunta_id uuid,
  pregunta_num int not null default 0,
  total int not null default 0,
  inicio timestamptz,
  duracion int not null default 20,
  actualizado timestamptz not null default now()
);
insert into public.trivia_estado (id) values (1) on conflict do nothing;

create table if not exists public.trivia_jugadores (
  id uuid primary key default gen_random_uuid(),
  partida uuid not null,
  token uuid not null unique default gen_random_uuid(),
  apodo text not null,
  puntos int not null default 0,
  creado timestamptz not null default now()
);
create index if not exists trivia_jugadores_partida_idx on public.trivia_jugadores (partida, puntos desc);

create table if not exists public.trivia_respuestas (
  jugador_id uuid not null references public.trivia_jugadores(id) on delete cascade,
  pregunta_id uuid not null,
  partida uuid not null,
  opcion int not null check (opcion between 0 and 3),
  correcta boolean not null,
  puntos int not null,
  ms int not null,
  creado timestamptz not null default now(),
  primary key (jugador_id, pregunta_id)
);

-- ---------------------------------------------------------------------
-- Seguridad (Row Level Security): por defecto nadie ve nada.
-- Los invitados solo usan las funciones de más abajo.
-- ---------------------------------------------------------------------
alter table public.grupos enable row level security;
alter table public.rsvps enable row level security;
alter table public.fotos enable row level security;
alter table public.pantalla_estado enable row level security;
alter table public.trivia_preguntas enable row level security;
alter table public.trivia_estado enable row level security;
alter table public.trivia_jugadores enable row level security;
alter table public.trivia_respuestas enable row level security;
alter table public.evento_config enable row level security;

do $$
declare t text;
begin
  foreach t in array array['grupos', 'rsvps', 'fotos', 'pantalla_estado', 'trivia_preguntas', 'trivia_estado', 'trivia_jugadores', 'trivia_respuestas', 'evento_config'] loop
    execute format('drop policy if exists "admin_todo" on public.%I', t);
    execute format('create policy "admin_todo" on public.%I for all to authenticated using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;

-- La pantalla del salón (sin login) puede leer: fotos no bloqueadas, estado de pantalla y de trivia
drop policy if exists "publico_fotos" on public.fotos;
create policy "publico_fotos" on public.fotos for select to anon using (estado <> 'revision');

drop policy if exists "publico_pantalla" on public.pantalla_estado;
create policy "publico_pantalla" on public.pantalla_estado for select to anon, authenticated using (true);

drop policy if exists "publico_trivia_estado" on public.trivia_estado;
create policy "publico_trivia_estado" on public.trivia_estado for select to anon, authenticated using (true);

drop policy if exists "publico_evento" on public.evento_config;
create policy "publico_evento" on public.evento_config for select to anon, authenticated using (true);

-- Permisos de tabla (los proyectos nuevos de Supabase no los dan solos). La seguridad fina la ponen las reglas RLS de arriba.
grant usage on schema public to anon, authenticated;
grant select on public.fotos, public.pantalla_estado, public.trivia_estado, public.evento_config to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;   -- RLS: solo el admin pasa

-- Los invitados nunca escriben directo en las tablas (ni tienen permisos que no hacen falta)
revoke insert, update, delete on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- Funciones para invitados
-- ---------------------------------------------------------------------
create or replace function public.obtener_grupo(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('slug', slug, 'nombres', nombres, 'cupo', cupo,
    'integrantes', coalesce((select json_agg(trim(x)) from unnest(string_to_array(integrantes, ',')) x where trim(x) <> ''), '[]'::json))
  from grupos where slug = lower(trim(p_slug));
$$;

create or replace function public.obtener_rsvp(p_slug text, p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('token', r.token, 'nombre_contacto', r.nombre_contacto, 'asiste', r.asiste, 'cantidad', r.cantidad,
    'nombres_asistentes', r.nombres_asistentes, 'menu', r.menu, 'menu_detalle', r.menu_detalle, 'canciones', r.canciones,
    'mensaje', r.mensaje, 'mostrar_mensaje', r.mostrar_mensaje, 'actualizado', r.actualizado)
  from rsvps r left join grupos g on g.id = r.grupo_id
  where (p_slug is not null and g.slug = lower(trim(p_slug)))
     or (p_slug is null and p_token is not null and r.token = p_token and r.grupo_id is null)
  limit 1;
$$;

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

create or replace function public.permite_original() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(sum(bytes), 0) < espacio_originales_bytes() from fotos;
$$;

create or replace function public.registrar_foto(p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_bloq boolean := coalesce((p ->> 'bloqueada')::boolean, false);
  v_bucket text := case when v_bloq then 'revision' else 'fotos' end;
  v_ruta text := case when v_bloq then 'rev/' else 'pub/' end || v_id::text || '.jpg';
  v_estado text := case when v_bloq then 'revision' else 'publicada' end;
  v_disp text := left(coalesce(p ->> 'dispositivo', ''), 64);
begin
  if p ->> 'ruta' is distinct from v_ruta then raise exception 'Ruta inválida'; end if;
  if not exists (select 1 from storage.objects where bucket_id = v_bucket and name = v_ruta) then
    raise exception 'No se encontró la foto subida';
  end if;
  if (select count(*) from fotos where dispositivo = v_disp and creado > now() - interval '1 hour') >= 30 then
    raise exception 'Llegaste al límite de fotos por hora. ¡Probá en un ratito!';
  end if;
  insert into fotos (id, ruta, bytes, autor, leyenda, estado, dispositivo, puntajes)
  values (v_id, v_ruta, least(coalesce((p ->> 'bytes')::bigint, 0), 20000000),
          coalesce(nullif(left(trim(p ->> 'autor'), 40), ''), 'Invitado'), nullif(left(trim(p ->> 'leyenda'), 80), ''),
          v_estado, v_disp, p -> 'puntajes')
  on conflict (id) do nothing;
  return json_build_object('id', v_id, 'estado', v_estado);
end $$;

create or replace function public.adjuntar_original(p_id uuid, p_ruta text, p_bytes bigint, p_dispositivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_ruta !~ ('^orig/' || p_id::text || '\.(jpg|png|webp)$') then raise exception 'Ruta inválida'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'fotos' and name = p_ruta) then return; end if;
  update fotos set ruta_original = p_ruta, bytes = bytes + least(coalesce(p_bytes, 0), 9000000)
  where id = p_id and dispositivo = p_dispositivo and ruta_original is null;
end $$;

create or replace function public.mensajes_pantalla() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('texto', r.mensaje, 'autor', coalesce(nullif(r.nombre_contacto, ''), g.nombres, ''))), '[]'::json)
  from (select * from rsvps where mostrar_mensaje and coalesce(trim(mensaje), '') <> '' order by actualizado desc limit 200) r
  left join grupos g on g.id = r.grupo_id;
$$;

-- ---------------------------------------------------------------------
-- Trivia (los puntos se calculan en el servidor: nadie puede hacer trampa)
-- ---------------------------------------------------------------------
create or replace function public.trivia_pregunta_actual() returns json
language plpgsql stable security definer set search_path = public as $$
declare e trivia_estado; q trivia_preguntas; v_fin boolean;
begin
  select * into e from trivia_estado where id = 1;
  select * into q from trivia_preguntas where id = e.pregunta_id;
  if q.id is null or e.fase not in ('pregunta', 'resultado', 'ranking') then
    return json_build_object('fase', e.fase, 'partida', e.partida, 'total', e.total, 'ahora', now());
  end if;
  v_fin := e.fase <> 'pregunta' or now() > e.inicio + make_interval(secs => e.duracion);
  return json_build_object('fase', e.fase, 'partida', e.partida, 'id', q.id, 'num', e.pregunta_num, 'total', e.total,
    'tipo', q.tipo, 'texto', q.texto, 'opciones', q.opciones, 'imagen', q.imagen, 'duracion', e.duracion, 'inicio', e.inicio, 'ahora', now(),
    'correcta', case when v_fin then q.correcta end, 'dato', case when v_fin then q.dato end);
end $$;

create or replace function public.trivia_unirse(p_apodo text) returns json
language plpgsql security definer set search_path = public as $$
declare e trivia_estado; v_base text := left(trim(coalesce(p_apodo, '')), 20); v_apodo text; n int := 2; j trivia_jugadores;
begin
  select * into e from trivia_estado where id = 1;
  if e.partida is null or e.fase = 'apagada' then raise exception 'La trivia todavía no empezó'; end if;
  if char_length(v_base) < 2 then raise exception 'Elegí un apodo de al menos 2 letras'; end if;
  if (select count(*) from trivia_jugadores where partida = e.partida) >= 300 then raise exception 'La trivia está llena'; end if;
  v_apodo := v_base;
  while exists (select 1 from trivia_jugadores where partida = e.partida and lower(apodo) = lower(v_apodo)) loop
    v_apodo := v_base || ' ' || n; n := n + 1;
  end loop;
  insert into trivia_jugadores (partida, apodo) values (e.partida, v_apodo) returning * into j;
  return json_build_object('token', j.token, 'apodo', j.apodo, 'partida', j.partida);
end $$;

create or replace function public.trivia_responder(p_token uuid, p_pregunta uuid, p_opcion int) returns json
language plpgsql security definer set search_path = public as $$
declare e trivia_estado; j trivia_jugadores; q trivia_preguntas; v_ms int; v_ok boolean; v_pts int;
begin
  select * into e from trivia_estado where id = 1;
  select * into j from trivia_jugadores where token = p_token and partida = e.partida;
  if j.id is null then raise exception 'Tenés que volver a entrar con tu apodo'; end if;
  if e.fase <> 'pregunta' or e.pregunta_id is distinct from p_pregunta then raise exception 'Esa pregunta ya cerró'; end if;
  select * into q from trivia_preguntas where id = p_pregunta;
  if p_opcion is null or p_opcion < 0 or p_opcion >= jsonb_array_length(q.opciones) then raise exception 'Opción inválida'; end if;
  v_ms := (extract(epoch from (now() - e.inicio)) * 1000)::int;
  if v_ms > e.duracion * 1000 + 1000 then raise exception '¡Se terminó el tiempo!'; end if;
  v_ok := q.correcta = p_opcion;
  v_pts := case when v_ok then round(500 + 500 * (1 - least(1, greatest(0, v_ms::numeric / (e.duracion * 1000)))))::int else 0 end;
  begin
    insert into trivia_respuestas (jugador_id, pregunta_id, partida, opcion, correcta, puntos, ms)
    values (j.id, p_pregunta, e.partida, p_opcion, v_ok, v_pts, v_ms);
  exception when unique_violation then
    raise exception 'Ya respondiste esta pregunta';
  end;
  update trivia_jugadores set puntos = puntos + v_pts where id = j.id;
  return json_build_object('ok', true);
end $$;

create or replace function public.trivia_resultados() returns json
language plpgsql stable security definer set search_path = public as $$
declare e trivia_estado; q trivia_preguntas; v_resp int; v_conteos json;
begin
  select * into e from trivia_estado where id = 1;
  select * into q from trivia_preguntas where id = e.pregunta_id;
  if q.id is null then return null; end if;
  select count(*) into v_resp from trivia_respuestas where pregunta_id = q.id and partida = e.partida;
  if e.fase = 'pregunta' and now() <= e.inicio + make_interval(secs => e.duracion) then
    return json_build_object('respondieron', v_resp, 'correcta', null);
  end if;
  select json_build_array(count(*) filter (where opcion = 0), count(*) filter (where opcion = 1), count(*) filter (where opcion = 2), count(*) filter (where opcion = 3))
    into v_conteos from trivia_respuestas where pregunta_id = q.id and partida = e.partida;
  return json_build_object('correcta', q.correcta, 'conteos', v_conteos, 'respondieron', v_resp, 'tipo', q.tipo, 'dato', q.dato);
end $$;

create or replace function public.trivia_ranking(p_n int) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('apodo', apodo, 'puntos', puntos) order by puntos desc, creado), '[]'::json)
  from (select apodo, puntos, creado from trivia_jugadores
        where partida = (select partida from trivia_estado where id = 1)
        order by puntos desc, creado limit least(greatest(coalesce(p_n, 5), 1), 50)) x;
$$;

create or replace function public.trivia_mi_estado(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare e trivia_estado; j trivia_jugadores; r trivia_respuestas; v_pos int; v_tot int;
begin
  select * into e from trivia_estado where id = 1;
  select * into j from trivia_jugadores where token = p_token and partida = e.partida;
  if j.id is null then return null; end if;
  select count(*) + 1 into v_pos from trivia_jugadores where partida = e.partida and (puntos > j.puntos or (puntos = j.puntos and creado < j.creado));
  select count(*) into v_tot from trivia_jugadores where partida = e.partida;
  select * into r from trivia_respuestas where jugador_id = j.id and pregunta_id = e.pregunta_id;
  return json_build_object('apodo', j.apodo, 'puntos', j.puntos, 'posicion', v_pos, 'jugadores', v_tot,
    'ultima', case when r.jugador_id is null then null else json_build_object('correcta', r.correcta, 'puntos', r.puntos, 'opcion', r.opcion) end);
end $$;

create or replace function public.trivia_cantidad() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from trivia_jugadores where partida = (select partida from trivia_estado where id = 1);
$$;

-- Apodos de los que se van sumando (para las burbujas de la pantalla de inicio)
create or replace function public.trivia_apodos() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(apodo order by creado), '[]'::json)
  from (select apodo, creado from trivia_jugadores
        where partida = (select partida from trivia_estado where id = 1)
        order by creado desc limit 60) x;
$$;
grant execute on function public.trivia_apodos() to anon, authenticated;

-- Borrar datos de prueba (solo admin): confirmaciones, fotos y trivia. NO toca invitados ni preguntas.
create or replace function public.borrar_datos_prueba() returns json
language plpgsql security definer set search_path = public as $$
declare n_rsvp int; n_fotos int; n_jug int;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  delete from trivia_respuestas where true;
  delete from trivia_jugadores where true; get diagnostics n_jug = row_count;
  update trivia_estado set partida = null, fase = 'apagada', pregunta_id = null, pregunta_num = 0, total = 0, inicio = null, actualizado = now() where id = 1;
  delete from fotos where true; get diagnostics n_fotos = row_count;
  delete from rsvps where true; get diagnostics n_rsvp = row_count;
  update pantalla_estado set muro_pausado = false, modo = 'fotos', mensaje_manual = '' where id = 1;
  return json_build_object('rsvps', n_rsvp, 'fotos', n_fotos, 'jugadores', n_jug);
end $$;
revoke execute on function public.borrar_datos_prueba() from anon;

-- Control del juego (solo admin)
create or replace function public.trivia_control(p_accion text) returns json
language plpgsql security definer set search_path = public as $$
declare e trivia_estado; v_total int; v_id uuid;
begin
  if not es_admin() then raise exception 'No autorizado'; end if;
  select * into e from trivia_estado where id = 1 for update;
  select count(*) into v_total from trivia_preguntas where activa;
  if p_accion = 'abrir' then
    update trivia_estado set partida = gen_random_uuid(), fase = 'lobby', pregunta_id = null, pregunta_num = 0, total = v_total, inicio = null, actualizado = now() where id = 1;
    update pantalla_estado set modo = 'trivia' where id = 1;
  elsif p_accion = 'siguiente' then
    if e.partida is null then raise exception 'Primero abrí la trivia'; end if;
    if e.pregunta_num >= v_total then
      update trivia_estado set fase = 'podio', actualizado = now() where id = 1;
    else
      select id into v_id from trivia_preguntas where activa order by orden, creado offset e.pregunta_num limit 1;
      update trivia_estado set fase = 'pregunta', pregunta_id = v_id, pregunta_num = e.pregunta_num + 1, total = v_total, inicio = now(), actualizado = now() where id = 1;
    end if;
  elsif p_accion = 'revelar' then update trivia_estado set fase = 'resultado', actualizado = now() where id = 1;
  elsif p_accion = 'ranking' then update trivia_estado set fase = 'ranking', actualizado = now() where id = 1;
  elsif p_accion = 'terminar' then update trivia_estado set fase = 'podio', actualizado = now() where id = 1;
  elsif p_accion = 'cerrar' then
    update trivia_estado set fase = 'apagada', actualizado = now() where id = 1;
    update pantalla_estado set modo = 'fotos' where id = 1;
  else raise exception 'Acción desconocida';
  end if;
  return (select row_to_json(t) from trivia_estado t where id = 1);
end $$;

-- ---------------------------------------------------------------------
-- Almacenamiento de fotos
--   fotos    → público (lo que se ve en pantalla + originales)
--   revision → privado (fotos que no pasaron el filtro; solo admin)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
       ('revision', 'revision', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "s60_invitados_suben" on storage.objects;
create policy "s60_invitados_suben" on storage.objects for insert to anon, authenticated
with check (
  (bucket_id = 'fotos' and (name like 'pub/%' or name like 'orig/%'))
  or (bucket_id = 'revision' and name like 'rev/%')
);

drop policy if exists "s60_admin_todo" on storage.objects;
create policy "s60_admin_todo" on storage.objects for all to authenticated
using (bucket_id in ('fotos', 'revision') and public.es_admin())
with check (bucket_id in ('fotos', 'revision') and public.es_admin());

-- ---------------------------------------------------------------------
-- Tiempo real (muro de fotos, pantalla y trivia)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['fotos', 'pantalla_estado', 'trivia_estado'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Preguntas de la trivia (editalas desde el panel)
-- ---------------------------------------------------------------------
insert into public.trivia_preguntas (orden, tipo, texto, opciones, correcta, dato)
select orden, tipo, texto, opciones::jsonb, correcta, dato from (values
(1, 'multiple', '🎂 ¿En qué año nació Silvia?', '["1964", "1966", "1967", "1969"]', 1, null),
      (2, 'multiple', '🎬 ¿Cuál es su película favorita?', '["Esperando la carroza", "La propuesta", "La boda de mi mejor amigo", "Diario de una pasión"]', 1, null),
      (3, 'multiple', '👩‍🏫 Si no hubiera sido docente, ¿qué le habría gustado ser?', '["Psicóloga 🧠", "Abogada ⚖️", "Astronauta 🚀", "Contadora 📊"]', 1, null),
      (4, 'vf', '🚌 A los 5 años la atropelló un colectivo… ¡y salió ilesa!', '["Verdadero", "Falso"]', 0, '¡Así de fuerte es Silvia! 💪'),
      (5, 'vf', '🎤 En la secundaria fue la cantante de la banda de sus compañeros de la ECLGS.', '["Verdadero", "Falso"]', 1, null),
      (6, 'multiple', '🎸 ¿Cuál fue el primer recital al que fue?', '["Pedro y Pablo (1982)", "Charly García (1984)", "Miguel Mateos/Zas (1985)", "Shakira (2025) 😂"]', 0, null),
      (7, 'multiple', '📻 El día que nació Silvia, ¿qué canción era la n.º 1 en las radios argentinas?', '["Strangers in the Night – Frank Sinatra", "Yellow Submarine – The Beatles 🟡", "Satisfaction – The Rolling Stones", "Despacito – Luis Fonsi 😂"]', 1, null),
      (8, 'multiple', '🌍 Si pudiera festejar su cumpleaños en cualquier lugar del mundo, ¿dónde sería?', '["En París 🗼", "En el Caribe 🏝️", "En Nueva York 🗽", "En San Juan, con su familia y amigos ❤️"]', 3, null),
      (9, 'vf', '🐱 Olivia, la reina de la casa, es una gata.', '["Verdadero", "Falso"]', 1, '¡Olivia es una caniche! 🐩'),
      (10, 'multiple', '📺 ¿Cuál era el dibujito "sagrado" de su infancia, el que no se perdía por nada?', '["Heidi 🏔️", "Tom y Jerry 🐱🐭", "El Pájaro Loco 🐦", "El Correcaminos 💨"]', 1, null),
      (11, 'multiple', '🤫 ¿Cuántos años cumple Silvia?', '["29 (otra vez) 😉", "39 y pico 🤭", "60 y divina ✨", "Una dama no dice su edad 🤐"]', 2, null),
      (12, 'multiple', '⏳ ¿Cuántos días de vida lleva Silvia, más o menos?', '["Unos 8.500", "Unos 15.000", "Unos 21.900", "Unos 30.000"]', 2, '¡Más de 21.900 días! Y todos llenos de amor 💛'),
      (13, 'vf', '❤️ Esta noche Silvia está rodeada de la gente que más quiere.', '["Verdadero", "Falso"]', 0, '¡Gracias por estar! 💛🥂')
) as v(orden, tipo, texto, opciones, correcta, dato)
where not exists (select 1 from public.trivia_preguntas);

-- ¡Listo! Si ves "Success. No rows returned", salió todo bien.
