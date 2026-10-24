-- SILVIA 60 · Actualización 3
--   A) Datos del evento editables desde el panel (pestaña "Evento")
--   B) Trivia final: preguntas de opción múltiple y de Verdadero o Falso, "dato al revelar",
--      apodos en vivo en la pantalla y las 13 preguntas reales
--   C) Pantalla a prueba de fallas: nunca un podio vacío (sin jugadores vuelve al muro de fotos)
-- Correr UNA vez en SQL Editor → Run (sin nada seleccionado). Se puede repetir sin problema.
-- NO borra ni cambia confirmaciones, fotos ni invitados.
-- Las 5 preguntas de ejemplo se reemplazan por las 13 reales (una sola vez: si ya están, no se tocan).

-- =====================================================================
-- A) EVENTO
-- =====================================================================
-- Tabla con fecha y hora, texto de puntualidad y fecha límite para confirmar (una sola fila)
create table if not exists public.evento_config (
  id int primary key default 1 check (id = 1),
  fecha_evento timestamptz not null default '2026-12-05 22:30:00-03',
  texto_puntual text not null default '¡Por favor, sé puntual!',
  fecha_limite_rsvp timestamptz not null default '2026-11-20 23:59:59-03',
  actualizado timestamptz not null default now()
);
insert into public.evento_config (id) values (1) on conflict do nothing;

alter table public.evento_config enable row level security;
drop policy if exists "publico_evento" on public.evento_config;
create policy "publico_evento" on public.evento_config for select to anon, authenticated using (true);
drop policy if exists "admin_todo" on public.evento_config;
create policy "admin_todo" on public.evento_config for all to authenticated using (public.es_admin()) with check (public.es_admin());
grant select on public.evento_config to anon;
grant select, insert, update, delete on public.evento_config to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.evento_config from anon;

-- La fecha límite para confirmar ahora sale de esa tabla (la usa guardar_rsvp)
create or replace function public.rsvp_limite() returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce((select fecha_limite_rsvp from evento_config where id = 1), '2026-11-20 23:59:59-03'::timestamptz);
$$;

-- =====================================================================
-- B) TRIVIA
-- =====================================================================
-- Tipo de pregunta ('multiple' o 'vf') y dato que se muestra al revelar
alter table public.trivia_preguntas add column if not exists tipo text not null default 'multiple';
alter table public.trivia_preguntas add column if not exists dato text;

-- Antes las preguntas tenían que tener 4 opciones: ahora de 2 a 4 (V/F = 2: Verdadero, Falso)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.trivia_preguntas'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) ilike '%opciones%' or pg_get_constraintdef(oid) ilike '%correcta%')
  loop
    execute format('alter table public.trivia_preguntas drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.trivia_preguntas add constraint trivia_preguntas_formato_ok check (
  tipo in ('multiple', 'vf')
  and jsonb_typeof(opciones) = 'array'
  and jsonb_array_length(opciones) between 2 and 4
  and (tipo <> 'vf' or jsonb_array_length(opciones) = 2)
  and correcta >= 0 and correcta < jsonb_array_length(opciones)
  and (dato is null or char_length(dato) <= 160)
);

-- Pregunta en curso: ahora manda el tipo y, cuando termina el tiempo, el dato
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

-- Responder: la opción tiene que existir en esa pregunta (V/F solo tiene 2)
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

-- Resultados: además del conteo, el tipo y el dato
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

-- Apodos de los que se van sumando (para las burbujas de la pantalla de inicio)
create or replace function public.trivia_apodos() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(apodo order by creado), '[]'::json)
  from (select apodo, creado from trivia_jugadores
        where partida = (select partida from trivia_estado where id = 1)
        order by creado desc limit 60) x;
$$;
grant execute on function public.trivia_apodos() to anon, authenticated;

-- Las 13 preguntas reales (reemplazan las de ejemplo). Si ya están cargadas, no se tocan:
-- así, si después las editás en el panel y volvés a correr este archivo, no perdés los cambios.
do $$
begin
  if not exists (select 1 from public.trivia_preguntas where texto = '🎂 ¿En qué año nació Silvia?') then
    delete from public.trivia_preguntas where true;
    -- si había una trivia de prueba abierta, se apaga (las preguntas viejas ya no existen)
    update public.trivia_estado set fase = 'apagada', pregunta_id = null, pregunta_num = 0, total = 0, inicio = null, actualizado = now() where id = 1;
    update public.pantalla_estado set modo = 'fotos' where id = 1 and modo = 'trivia';
    insert into public.trivia_preguntas (orden, tipo, texto, opciones, correcta, dato) values
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
      (13, 'vf', '❤️ Esta noche Silvia está rodeada de la gente que más quiere.', '["Verdadero", "Falso"]', 0, '¡Gracias por estar! 💛🥂');
  end if;
end $$;

-- =====================================================================
-- C) PANTALLA A PRUEBA DE FALLAS
-- =====================================================================
-- Control del juego: si se llega al podio sin ningún jugador, en vez de un podio vacío
-- se apaga la trivia y la pantalla vuelve al muro de fotos.
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
  -- nunca un podio vacío
  select * into e from trivia_estado where id = 1;
  if e.fase = 'podio' and not exists (select 1 from trivia_jugadores where partida = e.partida) then
    update trivia_estado set fase = 'apagada', actualizado = now() where id = 1;
    update pantalla_estado set modo = 'fotos' where id = 1;
  end if;
  return (select row_to_json(t) from trivia_estado t where id = 1);
end $$;

-- Si ahora mismo quedó trabada en un podio sin jugadores (como en la prueba), se destraba
update public.trivia_estado set fase = 'apagada', actualizado = now()
where id = 1 and fase = 'podio' and not exists (select 1 from public.trivia_jugadores j where j.partida = trivia_estado.partida);
update public.pantalla_estado set modo = 'fotos'
where id = 1 and modo = 'trivia' and (select fase from public.trivia_estado where id = 1) = 'apagada';

-- =====================================================================
-- Comprobación (1 fila). Tiene que decir:
--   fecha_y_hora_argentina = 2026-12-05 22:30 · limite_ok = true
--   preguntas = 13 · verdadero_falso = 4 · con_dato = 4 · apodos_ok = true · podio_seguro = true
--   pantalla_modo = fotos y trivia_fase = apagada (salvo que tengas una trivia abierta) · invitados / confirmaciones / fotos = lo que ya tenías
-- =====================================================================
select
  (select fecha_evento at time zone 'America/Argentina/San_Juan' from public.evento_config where id = 1) as fecha_y_hora_argentina,
  (select texto_puntual from public.evento_config where id = 1) as texto_puntual,
  (select rsvp_limite() = fecha_limite_rsvp from public.evento_config where id = 1) as limite_ok,
  (select count(*) from public.trivia_preguntas) as preguntas,
  (select count(*) from public.trivia_preguntas where tipo = 'vf') as verdadero_falso,
  (select count(*) from public.trivia_preguntas where dato is not null) as con_dato,
  (select json_typeof(public.trivia_apodos()) = 'array') as apodos_ok,
  (select prosrc ilike '%nunca un podio vac%' from pg_proc where proname = 'trivia_control' and pronamespace = 'public'::regnamespace) as podio_seguro,
  (select modo from public.pantalla_estado where id = 1) as pantalla_modo,
  (select fase from public.trivia_estado where id = 1) as trivia_fase,
  (select count(*) from public.grupos) as invitados,
  (select count(*) from public.rsvps) as confirmaciones,
  (select count(*) from public.fotos) as fotos;
