-- SILVIA 60 · Permisos de tabla que faltaban (correr en SQL Editor → Run, SIN nada seleccionado)
-- Los proyectos nuevos de Supabase no dan permiso de lectura automático.
-- Esto no abre nada de más: las reglas de seguridad (RLS) siguen decidiendo quién ve qué.
grant usage on schema public to anon, authenticated;
grant select on public.fotos, public.pantalla_estado, public.trivia_estado to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from anon;

-- Comprobación: tienen que aparecer 3 filas "anon | SELECT" (fotos, pantalla_estado, trivia_estado)
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
order by table_name;
