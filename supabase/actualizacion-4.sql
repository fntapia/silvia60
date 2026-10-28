-- SILVIA 60 · Actualización 4
--   A) Itinerario encadenado (pestaña 🕒 Itinerario del panel) — SOLO admin
--   B) Videos y animaciones en la pantalla del salón (pestaña 🎬 Videos del panel)
-- Correr UNA vez en SQL Editor → Run (sin nada seleccionado). Se puede repetir sin problema.
-- NO borra ni cambia invitados, confirmaciones, fotos ni la trivia. No toca el modo prueba.
-- El itinerario inicial se carga solo si la tabla está vacía (si ya lo editaste, no se pisa).

-- =====================================================================
-- A) ITINERARIO
-- =====================================================================
-- Cada momento guarda su DURACIÓN; la hora de inicio la calcula el panel en cadena
-- (inicio del evento + duraciones). Los de hora_fija ('01:00') no se mueven.
create table if not exists public.itinerario (
  id uuid primary key default gen_random_uuid(),
  orden int not null default 1,
  emoji text not null default '⭐' check (char_length(emoji) <= 16),
  titulo text not null check (char_length(titulo) between 1 and 80),
  duracion int not null default 10 check (duracion between 0 and 600),
  hora_fija text check (hora_fija is null or hora_fija ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  responsable text check (responsable is null or char_length(responsable) <= 80),
  notas text check (notas is null or char_length(notas) <= 300),
  boton text check (boton is null or boton in ('entrada', 'trivia', 'fiesta') or boton ~ '^video:[a-z0-9-]{2,40}$'),
  hecho boolean not null default false,
  creado timestamptz not null default now()
);

-- Duración contratada y horario de la fotógrafa (una sola fila).
-- fotografa_desde = minutos desde el inicio del evento (si la fiesta se corre, la fotógrafa también)
create table if not exists public.itinerario_config (
  id int primary key default 1 check (id = 1),
  duracion_horas numeric(4,2) not null default 7 check (duracion_horas between 1 and 14),
  fotografa_desde int not null default 25 check (fotografa_desde between -600 and 900),
  fotografa_horas numeric(4,2) not null default 3 check (fotografa_horas between 0 and 14)
);
insert into public.itinerario_config (id) values (1) on conflict do nothing;

-- Solo el administrador: lectura y escritura. Los invitados no la ven.
alter table public.itinerario enable row level security;
alter table public.itinerario_config enable row level security;
drop policy if exists "admin_todo" on public.itinerario;
create policy "admin_todo" on public.itinerario for all to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin_todo" on public.itinerario_config;
create policy "admin_todo" on public.itinerario_config for all to authenticated using (public.es_admin()) with check (public.es_admin());
revoke all on public.itinerario, public.itinerario_config from anon;
grant select, insert, update, delete on public.itinerario, public.itinerario_config to authenticated;

-- Itinerario inicial (solo si está vacío). Duración en minutos.
insert into public.itinerario (orden, emoji, titulo, duracion, hora_fija, notas, boton)
select orden, emoji, titulo, duracion, hora_fija, notas, boton from (values
  (1,  '🚪', 'Apertura del salón', 30, null, 'Llegan invitados; muro de fotos', null),
  (2,  '✨', 'Llega Silvia', 15, null, 'Animación de entrada + su canción, flores de los hijos y vals', 'entrada'),
  (3,  '🎂', 'Bienvenida y velas', 10, null, 'Palabras breves, brindis, sopla la vela', null),
  (4,  '🍽️', 'Cena', 45, null, 'Silvia recorre las mesas (foto por mesa)', null),
  (5,  '🎬', 'Video homenaje', 10, null, null, 'video:homenaje'),
  (6,  '🏆', 'Trivia', 20, null, 'Con la gente sentada', 'trivia'),
  (7,  '🍰', 'Postre: torta', 15, null, null, null),
  (8,  '🪕', 'Folklore', 10, null, '2 canciones', null),
  (9,  '👨‍👩‍👧‍👦', 'Coreografía familiar', 5, null, 'Cubre el cambio de vestuario', null),
  (10, '🌹', 'Tango', 10, null, 'Al final sacan a bailar a Silvia y la familia', null),
  (11, '🚨', '¡Arranca la fiesta!', 5, null, 'ALERTA en pantalla + el DJ dispara el mashup en el BOOM; abre la barra', 'fiesta'),
  (12, '🕺', 'Primera tanda de baile', 65, null, null, null),
  (13, '🎊', 'Animación', 60, '01:00', null, null),
  (14, '🥪', 'Madrugada', 30, null, 'Mesa dulce + sándwiches / pizza', null),
  (15, '🎶', 'Última tanda', 85, null, null, null),
  (16, '👋', 'Cierre', 5, null, null, null)
) as v(orden, emoji, titulo, duracion, hora_fija, notas, boton)
where not exists (select 1 from public.itinerario);

-- =====================================================================
-- B) VIDEOS Y ANIMACIONES EN LA PANTALLA
-- =====================================================================
-- Lista de videos (los ARCHIVOS no van a Supabase: se cargan una vez en la notebook del salón).
-- La pantalla (sin login) lee la lista para saber qué archivo corresponde a cada video.
create table if not exists public.videos (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  titulo text not null check (char_length(titulo) between 1 and 80),
  youtube text check (youtube is null or char_length(youtube) <= 200),   -- opcional: link no listado
  fijo boolean not null default false,
  orden int not null default 1,
  creado timestamptz not null default now()
);
insert into public.videos (id, titulo, fijo, orden) values ('homenaje', 'Video homenaje', true, 1) on conflict do nothing;

alter table public.videos enable row level security;
drop policy if exists "publico_videos" on public.videos;
create policy "publico_videos" on public.videos for select to anon, authenticated using (true);
drop policy if exists "admin_todo" on public.videos;
create policy "admin_todo" on public.videos for all to authenticated using (public.es_admin()) with check (public.es_admin());
grant select on public.videos to anon;
revoke insert, update, delete, truncate, references, trigger on public.videos from anon;
grant select, insert, update, delete on public.videos to authenticated;

-- Control remoto desde el panel (lo escribe solo el admin):
--   reproduccion = qué se está mostrando: {tipo: 'video'|'anim', id, estado: 'play'|'pausa', inicio, pos, n}
--   (si la pantalla se recarga, lo lee de acá y sigue donde iba)
-- informe = lo que la notebook avisa: videos cargados, qué está reproduciendo, si tiene sonido
alter table public.pantalla_estado add column if not exists reproduccion jsonb;
alter table public.pantalla_estado add column if not exists volumen int not null default 100;
alter table public.pantalla_estado add column if not exists efectos boolean not null default true;
alter table public.pantalla_estado add column if not exists sonido_ts timestamptz;
alter table public.pantalla_estado add column if not exists informe jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pantalla_volumen_ok' and conrelid = 'public.pantalla_estado'::regclass) then
    alter table public.pantalla_estado add constraint pantalla_volumen_ok check (volumen between 0 and 100);
  end if;
end $$;

-- La pantalla no tiene login: avisa por esta función (solo puede tocar la columna "informe")
create or replace function public.pantalla_informar(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 8000 then
    raise exception 'Informe inválido';
  end if;
  update pantalla_estado set informe = jsonb_build_object(
    'videos', case when jsonb_typeof(p->'videos') = 'array' then p->'videos' else '[]'::jsonb end,
    'reproduciendo', p->'reproduciendo',
    'audio', p->>'audio',
    'ts', now()
  ) where id = 1;
end $$;
revoke all on function public.pantalla_informar(jsonb) from public;
grant execute on function public.pantalla_informar(jsonb) to anon, authenticated;

-- =====================================================================
-- Comprobación (1 fila). Tiene que decir:
--   momentos = 16 (o los que tengas si ya lo editaste) · minutos = 420 (7 h) · animacion_fija = 01:00
--   itinerario_privado = true · videos >= 1 · columnas_pantalla = 5 · informe_ok = true
--   modo_prueba = false · invitados / confirmaciones / fotos = lo que ya tenías
-- =====================================================================
select
  (select count(*) from public.itinerario) as momentos,
  (select sum(duracion) from public.itinerario) as minutos,
  (select hora_fija from public.itinerario where titulo = 'Animación' limit 1) as animacion_fija,
  (select duracion_horas from public.itinerario_config where id = 1) as horas_contratadas,
  (not has_table_privilege('anon', 'public.itinerario', 'select')
     and (select relrowsecurity from pg_class where oid = 'public.itinerario'::regclass)) as itinerario_privado,
  (select count(*) from public.videos) as videos,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pantalla_estado'
     and column_name in ('reproduccion', 'volumen', 'efectos', 'sonido_ts', 'informe')) as columnas_pantalla,
  has_function_privilege('anon', 'public.pantalla_informar(jsonb)', 'execute') as informe_ok,
  (select modo_prueba from public.pantalla_estado where id = 1) as modo_prueba,
  (select count(*) from public.grupos) as invitados,
  (select count(*) from public.rsvps) as confirmaciones,
  (select count(*) from public.fotos) as fotos;
