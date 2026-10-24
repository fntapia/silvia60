-- SILVIA 60 · Actualización 1: modo prueba + "Borrar datos de prueba"
-- Correr UNA vez en SQL Editor → Run (sin nada seleccionado). Se puede repetir sin problema.

-- Modo prueba: habilita /fotos antes del 5/12. Se prende y apaga desde el panel → Pantalla.
alter table public.pantalla_estado add column if not exists modo_prueba boolean not null default false;

-- Borra confirmaciones, fotos (sus filas) y jugadores/respuestas de la trivia. NO toca invitados ni preguntas.
-- Los archivos de las fotos los borra el panel antes de llamar a esta función.
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

-- Comprobación: tiene que mostrar una fila con modo_prueba = false
select id, modo, muro_pausado, modo_prueba from public.pantalla_estado;
