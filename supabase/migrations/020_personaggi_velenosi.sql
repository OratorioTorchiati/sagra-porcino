-- =====================================================================================
-- 020 — Personaggi velenosi e cambio del personaggio dal profilo (D85)
--
-- - 4 nuovi personaggi: ovolaccio, fungo giallo, fungo stregato, riccio di castagna.
-- - set_avatar: il giocatore cambia il proprio personaggio dal profilo (la classifica si aggiorna da sola).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Personaggi ammessi (stessi id di app/src/characters/characters.js)
create or replace function public._avatar_ids()
returns text[] language sql immutable as $$
  select array['porcino', 'montanaro', 'porcino_nero', 'castagna', 'scoiattolo', 'riccio',
               'cinghialotto', 'foglia', 'abetino', 'gufetto', 'cestino', 'lumachina',
               'ovolaccio', 'fungo_giallo', 'fungo_stregato', 'riccio_castagna'];
$$;

-- Cambio del personaggio (dal profilo)
create or replace function public.set_avatar(p_token text, p_avatar text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
begin
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_LOGGED_IN');
  end if;
  if p_avatar is null or not (p_avatar = any (_avatar_ids())) then
    return jsonb_build_object('ok', false, 'error', 'AVATAR_INVALID');
  end if;
  update players set avatar = p_avatar where id = v_player.id returning * into v_player;
  return jsonb_build_object('ok', true, 'player', _player_json(v_player));
end;
$$;

revoke execute on function public.set_avatar(text, text) from public;
grant execute on function public.set_avatar(text, text) to anon, authenticated;
