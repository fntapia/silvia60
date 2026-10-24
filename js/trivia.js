/* /trivia: los invitados juegan desde el celular */
(function () {
  const { $, esc, local, toast } = S60;
  let estado = { fase: 'apagada' };
  let yo = local.leer('trivia_jugador');          // {token, apodo, partida}
  let respondidas = local.leer('trivia_respondidas', {}) || {};   // preguntaId -> opcion
  let relojTimer = null, mostroFinDe = null, renderando = 0;

  S60.bannerDemo();
  S60.brillos($('#brillos'), { cantidad: 18 });

  const vistas = ['vEspera', 'vUnirse', 'vListo', 'vPregunta', 'vEnviada', 'vResultado', 'vFinal'];
  const ver = id => vistas.forEach(v => $('#' + v).classList.toggle('oculto', v !== id));
  const soyDeEstaPartida = () => yo && yo.partida && yo.partida === estado.partida;

  async function actualizarJugador() {
    if (!soyDeEstaPartida()) { $('#jugador').classList.add('oculto'); return null; }
    try {
      const m = await Datos.trivia.miEstado(yo.token);
      if (!m) return null;
      $('#jugador').classList.remove('oculto');
      $('#jugadorApodo').textContent = m.apodo;
      $('#jugadorPuntos').textContent = m.puntos;
      return m;
    } catch (e) { return null; }
  }

  async function render() {
    const turno = ++renderando;
    clearInterval(relojTimer);
    const f = estado.fase;
    if (!f || f === 'apagada') { ver('vEspera'); $('#jugador').classList.add('oculto'); return; }
    if (!soyDeEstaPartida()) {
      if (f === 'podio') { ver('vFinal'); $('#fDetalle').textContent = '¡La próxima te sumás desde el principio!'; return; }
      ver('vUnirse'); return;
    }
    const m = await actualizarJugador();
    if (turno !== renderando) return;
    if (f === 'lobby') { ver('vListo'); return; }
    if (f === 'pregunta') return pregunta(turno);
    if (f === 'resultado' || f === 'ranking') return resultado(m);
    if (f === 'podio') {
      ver('vFinal');
      if (m) {
        const top = m.posicion <= 3;
        $('#fEmoji').textContent = ['🥇', '🥈', '🥉'][m.posicion - 1] || '🎉';
        $('#fTitulo').textContent = top ? '¡Estás en el podio!' : '¡Terminó la trivia!';
        $('#fDetalle').textContent = `Quedaste en el puesto ${m.posicion} de ${m.jugadores} con ${m.puntos} puntos.`;
        if (top) S60.fiesta(3500);
      }
    }
  }

  async function pregunta(turno) {
    const p = await Datos.trivia.preguntaActual();
    if (turno !== renderando || !p || !p.id) return;
    const offset = new Date(p.ahora).getTime() - Date.now();
    const fin = new Date(p.inicio).getTime() + p.duracion * 1000;
    const terminada = () => Date.now() + offset >= fin;
    if (terminada()) return resultado(await actualizarJugador());
    if (respondidas[p.id] != null) { ver('vEnviada'); esperarFin(); return; }

    ver('vPregunta');
    $('#pNum').textContent = `Pregunta ${p.num} de ${p.total}`;
    $('#pTexto').textContent = p.texto;
    $('#pOpciones').innerHTML = p.opciones.map((o, i) => `<button type="button" class="p-op op op${i}" data-i="${i}"><span class="forma"></span><span>${esc(o)}</span></button>`).join('');
    $('#pOpciones').querySelectorAll('.p-op').forEach(b => b.addEventListener('click', () => responder(p, +b.dataset.i, b)));
    esperarFin();

    function esperarFin() {
      const tic = () => {
        const s = Math.max(0, Math.ceil((fin - Date.now() - offset) / 1000));
        $('#pReloj').textContent = s;
        $('#pReloj').classList.toggle('urgente', s <= 5);
        if (s <= 0 && mostroFinDe !== p.id) { mostroFinDe = p.id; clearInterval(relojTimer); setTimeout(async () => resultado(await actualizarJugador()), 900); }
      };
      tic(); relojTimer = setInterval(tic, 250);
    }
  }

  async function responder(p, i, boton) {
    $('#pOpciones').querySelectorAll('.p-op').forEach(b => { b.disabled = true; });
    boton.classList.add('elegida');
    try {
      await Datos.trivia.responder(yo.token, p.id, i);
      respondidas[p.id] = i;
      local.guardar('trivia_respondidas', respondidas);
      ver('vEnviada');
    } catch (e) {
      toast(e.message || 'No se pudo enviar', 'error');
      if (/ya respondiste/i.test(e.message)) { respondidas[p.id] = i; ver('vEnviada'); }
      else if (/cerró|tiempo/i.test(e.message)) { /* se muestra el resultado al terminar el reloj */ }
      else $('#pOpciones').querySelectorAll('.p-op').forEach(b => { b.disabled = false; b.classList.remove('elegida'); });
    }
  }

  function resultado(m) {
    ver('vResultado');
    const u = m && m.ultima;
    if (u && u.correcta) { $('#rEmoji').textContent = '🎉'; $('#rTitulo').textContent = '¡Correcto!'; $('#rPuntos').textContent = '+' + u.puntos; }
    else if (u) { $('#rEmoji').textContent = '🙈'; $('#rTitulo').textContent = '¡Uy, no era esa!'; $('#rPuntos').textContent = '+0'; }
    else { $('#rEmoji').textContent = '⏰'; $('#rTitulo').textContent = 'No llegaste a responder'; $('#rPuntos').textContent = ''; }
    $('#rPosicion').textContent = m ? `Vas en el puesto ${m.posicion} de ${m.jugadores} con ${m.puntos} puntos` : '';
  }

  $('#vUnirse').addEventListener('submit', async e => {
    e.preventDefault();
    const apodo = $('#apodo').value.trim();
    if (apodo.length < 2) { $('#errorApodo').textContent = 'Elegí un apodo de al menos 2 letras'; return; }
    if (S60.tieneMalasPalabras(apodo)) { $('#errorApodo').textContent = 'Elegí otro apodo, porfa 🙂'; return; }
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const r = await Datos.trivia.unirse(apodo);
      yo = { token: r.token, apodo: r.apodo, partida: r.partida || estado.partida };
      local.guardar('trivia_jugador', yo);
      respondidas = {}; local.guardar('trivia_respondidas', respondidas);
      $('#errorApodo').textContent = '';
      render();
    } catch (ex) { $('#errorApodo').textContent = ex.message || 'No se pudo entrar'; }
    finally { btn.disabled = false; }
  });

  function cambio(e) {
    const antes = estado;
    estado = Object.assign({}, estado, e);
    if (antes.fase !== estado.fase || antes.pregunta_id !== estado.pregunta_id || antes.partida !== estado.partida) render();
  }

  (async function iniciar() {
    const nombre = local.leer('nombre_fotos');
    if (nombre) $('#apodo').value = nombre.slice(0, 20);
    try { estado = await Datos.trivia.estado(); } catch (e) {}
    render();
    Datos.trivia.escuchar(cambio);
    setInterval(async () => { try { cambio(await Datos.trivia.estado()); } catch (e) {} }, 5000);
  })();
})();
