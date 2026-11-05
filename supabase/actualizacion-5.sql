-- SILVIA 60 · Actualización 5
--   A) Itinerario final (reemplaza TODOS los momentos del itinerario, una sola vez)
--   B) Videos: tarjetas fijas "Vals" y "Piñata de Silvidólares", con bucle y sin sonido
-- Correr UNA vez en SQL Editor → Run (sin nada seleccionado), DESPUÉS de actualizacion-4.sql. Se puede repetir sin problema:
-- si el itinerario final ya está cargado no se vuelve a pisar, así no perdés lo que edites en el panel.
-- NO toca invitados, confirmaciones, fotos, trivia, la fecha/hora del evento ni el modo prueba.

-- =====================================================================
-- A) ITINERARIO FINAL
-- =====================================================================
do $$
begin
  if not exists (select 1 from public.itinerario where titulo = 'Show Marvel') then
    delete from public.itinerario where true;
    insert into public.itinerario (orden, emoji, titulo, duracion, hora_fija, notas, boton) values
      (1,  '🚪', 'Apertura de puertas', 30, null, 'Música instrumental', null),
      (2,  '✨', 'Llega Silvia', 5, null, '▶ Animación «Entrada de Silvia»; el tema de entrada lo pone el DJ', 'entrada'),
      (3,  '💐', 'Ramo', 5, null, 'Hijos, nietos y Raúl le entregan el ramo', null),
      (4,  '💃', 'Vals', 15, null, '«Tiempo de vals» (Chayanne) lo pone el DJ · ▶ video «Vals» en pantalla (en bucle) · bailan varios', 'video:vals'),
      (5,  '📸', 'Fotos mesa a mesa', 20, null, 'Con la fotógrafa', null),
      (6,  '🥂', 'Brindis, velas y «Feliz cumpleaños»', 15, null, null, null),
      (7,  '🍽️', 'Cena', 30, null, 'Música electro pop baja', null),
      (8,  '🎬', 'Video homenaje', 20, null, '▶ Video homenaje; el DJ pone la música en 0', 'video:homenaje'),
      (9,  '🏆', 'Trivia', 15, null, null, 'trivia'),
      (10, '🍽️', 'Cierre de la cena', 10, null, 'Sin postre', null),
      (11, '🌹', 'Tango', 15, null, '2 tangos (Silvia baila: prever su cambio de ropa)', null),
      (12, '🪕', 'Folklore', 15, null, null, null),
      (13, '🚨', '¡BOOM! Arranca la fiesta', 5, null, '▶ Animación «¡Arranca la fiesta!»; en el BOOM el DJ larga «Mi chica sexy» (Banda XXI); abre la barra 🍸', 'fiesta'),
      (14, '🎁', 'Entrega de cotillón', 10, null, 'Después de «Mi chica sexy»; sigue cuarteto', null),
      (15, '🦸', 'Show Marvel', 60, '01:30', 'Cabezones Daddy Yankee, La Mona y Messi; la música la coordina la animación con el DJ', null),
      (16, '🔥', 'Post show', 15, null, null, null),
      (17, '🪅', 'Piñata de Silvidólares', 15, null, '▶ Video «Piñata»; el DJ pone Bzrp Music Sessions #53 (Shakira); papel picado y silbatos', 'video:pinata'),
      (18, '🎂', 'Torta y mesa dulce', 60, '03:00', 'Sigue el baile', null),
      (19, '🥪', 'Sándwiches y salado', 55, '04:00', null, null),
      (20, '👋', 'Cierre y despedida', 5, null, null, null);
    -- Contratado 7 h; fotógrafa desde 22:30 (30 min después del inicio de las 22:00), 3 h
    update public.itinerario_config set duracion_horas = 7, fotografa_desde = 30, fotografa_horas = 3 where id = 1;
  end if;
end $$;

-- =====================================================================
-- B) VIDEOS
-- =====================================================================
alter table public.videos add column if not exists emoji text not null default '🎬';
alter table public.videos add column if not exists bucle boolean not null default false;
alter table public.videos add column if not exists bucle_desde numeric(7,2) not null default 0;
alter table public.videos add column if not exists mudo boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'videos_bucle_ok' and conrelid = 'public.videos'::regclass) then
    alter table public.videos add constraint videos_bucle_ok check (bucle_desde >= 0 and char_length(emoji) <= 16);
  end if;
end $$;

-- Si ya existen no se pisan (los podés editar en el panel)
insert into public.videos (id, emoji, titulo, fijo, orden, bucle, bucle_desde, mudo) values
  ('vals', '💃', 'Vals', true, 2, true, 0, true),
  ('pinata', '🪅', 'Piñata de Silvidólares', true, 3, true, 12, true)
on conflict do nothing;

-- =====================================================================
-- Comprobación (1 fila). Tiene que decir:
--   momentos = 20 · minutos = 420 · horas_fijas = 01:30, 03:00, 04:00
--   horas_contratadas = 7 · fotografa_desde_min = 30 · fotografa_horas = 3
--   videos_ok = true · inicio_argentina = 2026-12-05 22:00 · modo_prueba = false
--   invitados / confirmaciones / fotos = lo que ya tenías
-- =====================================================================
select
  (select count(*) from public.itinerario) as momentos,
  (select sum(duracion) from public.itinerario) as minutos,
  (select string_agg(hora_fija, ', ' order by orden) from public.itinerario where hora_fija is not null) as horas_fijas,
  (select duracion_horas from public.itinerario_config where id = 1) as horas_contratadas,
  (select fotografa_desde from public.itinerario_config where id = 1) as fotografa_desde_min,
  (select fotografa_horas from public.itinerario_config where id = 1) as fotografa_horas,
  ((select count(*) from public.videos where id = 'vals' and bucle and bucle_desde = 0 and mudo) = 1
    and (select count(*) from public.videos where id = 'pinata' and bucle and bucle_desde = 12 and mudo) = 1
    and (select count(*) from public.videos where id = 'homenaje') = 1) as videos_ok,
  (select fecha_evento at time zone 'America/Argentina/San_Juan' from public.evento_config where id = 1) as inicio_argentina,
  (select modo_prueba from public.pantalla_estado where id = 1) as modo_prueba,
  (select count(*) from public.grupos) as invitados,
  (select count(*) from public.rsvps) as confirmaciones,
  (select count(*) from public.fotos) as fotos;
