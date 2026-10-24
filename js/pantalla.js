/* /pantalla: muro de fotos en vivo + mensajes + trivia. Pensada para correr horas sin intervención. */
(function () {
  const C = window.CONFIG;
  const { $, esc } = S60;

  const MAX_FOTOS = 400;          // en memoria (las más nuevas)
  const SEG_DESTACADA = 7000;
  const SEG_TESELA = 3500;
  const SEG_PROTAGONISTA = 7000;
  const CADA_MENSAJE = 80000, DURA_MENSAJE = 13000;

  let fotos = [];                 // [{id,url,autor,leyenda}]
  const vistas = new Set();       // ids ya mostrados como protagonista
  const colaNuevas = [];
  let pantalla = { muro_pausado: false, modo: 'fotos', mensaje_manual: '' };
  let trivia = { fase: 'apagada' };
  let mensajes = [];
  let conectadoFotos = true;

  S60.brillos($('#brillos'), { cantidad: 50 });

  /* ---------- Inicio: pantalla completa + no apagar la pantalla ---------- */
  let wakeLock = null;
  async function mantenerEncendida() {
    try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) mantenerEncendida(); });
  $('#iniciar').addEventListener('click', async () => {
    $('#iniciar').classList.add('oculto');
    try { await document.documentElement.requestFullscreen(); } catch (e) {}
    mantenerEncendida();
  });
  if (new URLSearchParams(location.search).has('sinInicio')) $('#iniciar').classList.add('oculto');

  /* ---------- QR ---------- */
  const linkFotos = S60.url('fotos/');
  const linkTrivia = S60.url('trivia/');
  const textoLink = u => C.linkCortoTexto || u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  function esquinaFotos() {
    $('#qrFotos').innerHTML = S60.qrSvg(linkFotos);
    $('.esquina-titulo').textContent = '¡Subí tus fotos! 📸';
    $('#linkFotos').textContent = textoLink(linkFotos);
  }
  function esquinaTrivia() {
    $('#qrFotos').innerHTML = S60.qrSvg(linkTrivia);
    $('.esquina-titulo').textContent = '¡Sumate a la trivia! 🎯';
    $('#linkFotos').textContent = linkTrivia.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  esquinaFotos();
  $('#qrTrivia').innerHTML = S60.qrSvg(linkTrivia);
  $('#linkTrivia').textContent = linkTrivia.replace(/^https?:\/\//, '');

  /* ---------- Precarga de imágenes ---------- */
  function precargar(url) {
    return new Promise(ok => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => ok(true)); };
      im.onerror = () => ok(false);
      im.src = url;
    });
  }
  const pie = f => `<span class="autor">📸 por ${esc(f.autor)}</span>${f.leyenda ? `<span class="ley">“${esc(f.leyenda)}”</span>` : ''}`;

  /* ---------- Lista de fotos ---------- */
  function agregarFoto(f, esNueva) {
    if (!f || !f.url || fotos.some(x => x.id === f.id)) return;
    fotos.push(f);
    if (fotos.length > MAX_FOTOS) fotos.splice(0, fotos.length - MAX_FOTOS);
    if (esNueva && !vistas.has(f.id)) { colaNuevas.push(f); vistas.add(f.id); }
    actualizarVacio();
  }
  function quitarFoto(id) {
    const i = fotos.findIndex(x => x.id === id);
    if (i >= 0) fotos.splice(i, 1);
    const j = colaNuevas.findIndex(x => x.id === id);
    if (j >= 0) colaNuevas.splice(j, 1);
    // si está a la vista, se reemplaza ya
    document.querySelectorAll(`[data-foto="${id}"]`).forEach(el => {
      if (el.closest('.capa')) { el.closest('.capa').classList.remove('activa'); rotarDestacada(); }
      else if (el.closest('.tesela')) cambiarTesela(el.closest('.tesela'), true);
      else if (el.closest('.protagonista')) terminarProtagonista();
    });
    actualizarVacio();
  }
  function actualizarVacio() {
    const hay = fotos.length > 0;
    $('#vacio').classList.toggle('oculto', hay);
    $('#muro').classList.toggle('oculto', !hay);
  }

  /* ---------- Destacada (izquierda) ---------- */
  let idxDestacada = -1, capaActual = 'A';
  async function rotarDestacada() {
    if (!fotos.length) return;
    // favorece las últimas: la mitad de las veces muestra una de las 10 más nuevas
    let f;
    if (Math.random() < .5 && fotos.length > 3) f = fotos[fotos.length - 1 - Math.floor(Math.random() * Math.min(10, fotos.length))];
    else { idxDestacada = (idxDestacada + 1) % fotos.length; f = fotos[idxDestacada]; }
    const ok = await precargar(f.url);
    if (!ok) return;
    const siguiente = capaActual === 'A' ? 'B' : 'A';
    const capa = $('#capa' + siguiente), vieja = $('#capa' + capaActual);
    const img = capa.querySelector('img');
    img.src = f.url; img.dataset.foto = f.id;
    capa.querySelector('figcaption').innerHTML = pie(f);
    capa.classList.add('activa');
    vieja.classList.remove('activa');
    capaActual = siguiente;
  }

  /* ---------- Mosaico (derecha) ---------- */
  const teselas = [];
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div');
    d.className = 'tesela';
    d.innerHTML = '<img alt="">';
    $('#mosaico').appendChild(d);
    teselas.push(d);
  }
  async function cambiarTesela(t, forzar) {
    if (!fotos.length) return;
    const enVista = new Set(teselas.map(x => x.querySelector('img').dataset.foto));
    const candidatas = fotos.filter(f => !enVista.has(f.id));
    const f = (candidatas.length ? candidatas : fotos)[Math.floor(Math.random() * (candidatas.length || fotos.length))];
    if (!(await precargar(f.url))) return;
    const img = t.querySelector('img');
    img.classList.add('saliendo');
    setTimeout(() => { img.src = f.url; img.dataset.foto = f.id; img.classList.remove('saliendo'); }, forzar ? 0 : 700);
  }
  let idxTesela = 0;
  function rotarMosaico() { cambiarTesela(teselas[idxTesela++ % teselas.length]); }

  /* ---------- Protagonista ---------- */
  let protaActiva = false, protaTimer = null;
  async function mostrarProtagonista() {
    if (protaActiva || !colaNuevas.length || pantalla.muro_pausado || pantalla.modo !== 'fotos' || pantalla.mensaje_manual) return;
    const f = colaNuevas.shift();
    if (!(await precargar(f.url))) return;
    protaActiva = true;
    const p = $('#protagonista');
    const fig = p.querySelector('figure');
    const nueva = fig.cloneNode(true);    // reinicia la animación
    fig.replaceWith(nueva);
    const img = nueva.querySelector('img'); img.src = f.url; img.dataset.foto = f.id;
    nueva.querySelector('figcaption').innerHTML = pie(f);
    p.classList.remove('oculto', 'saliendo');
    setTimeout(() => S60.fiesta(1400, 2.4), 450);   // confeti multicolor + fuegos cuando entra una foto nueva
    protaTimer = setTimeout(terminarProtagonista, colaNuevas.length > 3 ? 4000 : SEG_PROTAGONISTA);
  }
  function terminarProtagonista() {
    clearTimeout(protaTimer);
    const p = $('#protagonista');
    p.classList.add('saliendo');
    setTimeout(() => { p.classList.add('oculto'); p.classList.remove('saliendo'); p.querySelector('img').removeAttribute('src'); protaActiva = false; }, 800);
  }

  /* ---------- Mensajes para Silvia ---------- */
  let idxMensaje = 0;
  async function cargarMensajes() { try { mensajes = await Datos.mensajesPantalla() || []; } catch (e) {} }
  function mostrarMensaje() {
    if (!mensajes.length || pantalla.muro_pausado || pantalla.modo !== 'fotos' || protaActiva || pantalla.mensaje_manual) return;
    const m = mensajes[idxMensaje++ % mensajes.length];
    $('#mensajeTexto').textContent = '“' + m.texto + '”';
    $('#mensajeAutor').textContent = m.autor ? '— ' + m.autor : '';
    const el = $('#mensaje');
    el.classList.remove('oculto');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    setTimeout(() => el.classList.add('oculto'), DURA_MENSAJE);
  }

  /* ---------- Estado de pantalla (panel) ---------- */
  function aplicarPantalla(p) {
    if (!p) return;
    const modoAntes = pantalla.modo;
    pantalla = Object.assign(pantalla, p);
    if (modoAntes !== pantalla.modo && typeof Trivia !== 'undefined') setTimeout(() => Trivia.cambio(), 0);
    $('#pausa').classList.toggle('oculto', !pantalla.muro_pausado || pantalla.modo === 'trivia');
    const manual = (pantalla.mensaje_manual || '').trim();
    $('#manual').classList.toggle('oculto', !manual);
    $('#manualTexto').textContent = manual;
    if (pantalla.muro_pausado || manual) { $('#mensaje').classList.add('oculto'); if (protaActiva) terminarProtagonista(); }
    aplicarModo();
  }
  function aplicarModo() {
    const enTrivia = pantalla.modo === 'trivia' && trivia.fase !== 'apagada';
    $('#vistaFotos').classList.toggle('oculto', enTrivia);
    $('#vistaTrivia').classList.toggle('oculto', !enTrivia);
    document.body.classList.toggle('modo-trivia', enTrivia);
    if (enTrivia) { esquinaTrivia(); $('#mensaje').classList.add('oculto'); } else esquinaFotos();
    $('#esquinaQr').classList.toggle('oculto', enTrivia && (trivia.fase === 'lobby' || trivia.fase === 'podio'));
  }

  /* ---------- Sincronización robusta ---------- */
  async function sincronizarFotos(primera) {
    try {
      const lista = await Datos.fotosPublicas();
      const ids = new Set(lista.map(f => f.id));
      fotos.filter(f => !ids.has(f.id)).map(f => f.id).forEach(quitarFoto);
      lista.forEach(f => { if (primera) vistas.add(f.id); agregarFoto(f, !primera && !vistas.has(f.id)); });
      if (primera && fotos.length) { rotarDestacada(); teselas.forEach(t => cambiarTesela(t, true)); }
      marcarConexion(true);
    } catch (e) { marcarConexion(false); }
  }
  function marcarConexion(ok) { $('#conexion').classList.toggle('oculto', ok && conectadoFotos); }

  function escuchar() {
    Datos.escucharFotos(ev => {
      const f = ev.foto;
      if (!f) return;
      if (f.estado === 'publicada') agregarFoto(f, true);
      else quitarFoto(f.id);
    }, ok => { conectadoFotos = ok; marcarConexion(ok); if (ok) sincronizarFotos(false); });
    Datos.escucharPantalla(aplicarPantalla);
    Datos.trivia.escuchar(e => { trivia = Object.assign(trivia, e); Trivia.cambio(); });
  }

  /* ====================== TRIVIA ====================== */
  const Trivia = (function () {
    let preguntaId = null, offset = 0, reloj = null, pollResp = null, pollJug = null, mostroResultado = null;
    const secciones = ['tLobby', 'tPregunta', 'tResultado', 'tRanking', 'tPodio'];
    const ver = id => secciones.forEach(s => $('#' + s).classList.toggle('oculto', s !== id));
    const limpiar = () => { clearInterval(reloj); clearInterval(pollResp); clearInterval(pollJug); reloj = pollResp = pollJug = null; };

    async function cambio() {
      aplicarModo();
      limpiar();
      const f = trivia.fase;
      if (f === 'apagada' || pantalla.modo !== 'trivia') return;
      if (f === 'lobby') {
        ver('tLobby');
        const act = async () => { try { $('#tCantJug').textContent = await Datos.trivia.cantidadJugadores(); } catch (e) {} };
        act(); pollJug = setInterval(act, 3000);
      } else if (f === 'pregunta') {
        await pregunta();
      } else if (f === 'resultado') {
        await resultado();
      } else if (f === 'ranking') {
        ver('tRanking');
        const r = await Datos.trivia.ranking(10);
        $('#rankingLista').innerHTML = r.map((j, i) => `<li style="--i:${i}"><span>${esc(j.apodo)}</span><b>${j.puntos}</b></li>`).join('') || '<li><span>Todavía no hay puntajes</span></li>';
      } else if (f === 'podio') {
        ver('tPodio');
        const r = await Datos.trivia.ranking(3);
        const medallas = ['🥇', '🥈', '🥉'];
        const orden = [1, 0, 2].filter(i => r[i]);
        $('#podio').innerHTML = orden.map(i => `<div class="podio-lugar p${i + 1}"><div class="podio-medalla">${medallas[i]}</div><p class="podio-nombre">${esc(r[i].apodo)}</p><p class="podio-pts">${r[i].puntos} puntos</p><div class="podio-base">${i + 1}</div></div>`).join('');
        setTimeout(() => { S60.fiesta(6000, 2.4); S60.destellos(9000); }, 1800);
      }
    }

    async function pregunta() {
      const p = await Datos.trivia.preguntaActual();
      if (!p || !p.id) return;
      preguntaId = p.id;
      mostroResultado = null;
      offset = new Date(p.ahora).getTime() - Date.now();
      ver('tPregunta');
      $('#tNum').textContent = `Pregunta ${p.num} de ${p.total}`;
      $('#tTexto').textContent = p.texto;
      const img = $('#tImagen');
      if (p.imagen) { img.src = await Datos.resolverImagen(p.imagen); img.classList.remove('oculto'); } else { img.classList.add('oculto'); img.removeAttribute('src'); }
      $('#tOpciones').innerHTML = p.opciones.map((o, i) => `<div class="t-op op op${i}"><span class="forma"></span><span>${esc(o)}</span></div>`).join('');
      $('#tResp').textContent = '0';
      const fin = new Date(p.inicio).getTime() + p.duracion * 1000;
      const arco = $('#relojArco');
      const tic = () => {
        const resta = Math.max(0, fin - (Date.now() + offset));
        const seg = Math.ceil(resta / 1000);
        $('#relojNum').textContent = seg;
        arco.style.strokeDashoffset = 276.5 * (1 - resta / (p.duracion * 1000));
        $('#reloj').classList.toggle('urgente', seg <= 5);
        if (resta <= 0 && mostroResultado !== preguntaId) { mostroResultado = preguntaId; limpiar(); setTimeout(resultado, 600); }
      };
      tic(); reloj = setInterval(tic, 250);
      const resp = async () => { try { const r = await Datos.trivia.resultados(); if (r) $('#tResp').textContent = r.respondieron; } catch (e) {} };
      pollResp = setInterval(resp, 2000);
    }

    async function resultado() {
      const [p, r, top] = await Promise.all([Datos.trivia.preguntaActual(), Datos.trivia.resultados(), Datos.trivia.ranking(5)]);
      if (!p || !p.id || !r || r.correcta == null) return;
      ver('tResultado');
      $('#trNum').textContent = `Pregunta ${p.num} de ${p.total}`;
      $('#trTexto').textContent = p.texto;
      const max = Math.max(1, ...r.conteos);
      $('#barras').innerHTML = p.opciones.map((o, i) => `
        <div class="barra-col op op${i} ${i === r.correcta ? 'correcta' : ''}">
          <span class="barra-cant">${r.conteos[i]}</span>
          <div class="barra-alta" style="height:${Math.max(2, r.conteos[i] / max * 62)}%"></div>
          <div class="barra-etq"><span class="forma"></span><span>${esc(o)}</span></div>
        </div>`).join('');
      $('#top5').innerHTML = top.map(j => `<li><span>${esc(j.apodo)}</span><b>${j.puntos}</b></li>`).join('') || '<li><span>Nadie sumó puntos todavía</span></li>';
    }

    return { cambio };
  })();

  /* ---------- Arranque ---------- */
  (async function iniciar() {
    try { aplicarPantalla(await Datos.pantalla()); } catch (e) {}
    try { trivia = await Datos.trivia.estado(); } catch (e) {}
    await sincronizarFotos(true);
    await cargarMensajes();
    escuchar();
    Trivia.cambio();

    setInterval(() => { if (pantalla.modo === 'fotos' && !pantalla.muro_pausado && !protaActiva) rotarDestacada(); }, SEG_DESTACADA);
    setInterval(() => { if (pantalla.modo === 'fotos' && !pantalla.muro_pausado) rotarMosaico(); }, SEG_TESELA);
    setInterval(mostrarProtagonista, 1000);
    setTimeout(() => { mostrarMensaje(); setInterval(mostrarMensaje, CADA_MENSAJE); }, 25000);
    setInterval(cargarMensajes, 5 * 60000);
    // Respaldo por si se pierde algún aviso en vivo (reconexiones, cortes)
    setInterval(() => sincronizarFotos(false), 45000);
    setInterval(async () => {
      try { aplicarPantalla(await Datos.pantalla()); } catch (e) {}
      try { const e = await Datos.trivia.estado(); if (e.fase !== trivia.fase || e.pregunta_id !== trivia.pregunta_id) { trivia = e; Trivia.cambio(); } } catch (e) {}
    }, 10000);
    addEventListener('online', () => sincronizarFotos(false));
    addEventListener('offline', () => marcarConexion(false));
    // Recarga preventiva cada 6 h (libera memoria del navegador), solo si no hay trivia en curso
    setTimeout(function recargar() {
      // Con F11 la pantalla completa sobrevive a la recarga; con el botón no, así que en ese caso no se recarga
      if (navigator.onLine && pantalla.modo === 'fotos' && !document.fullscreenElement) location.replace(location.pathname + '?sinInicio=1');
      else setTimeout(recargar, 60000);
    }, 6 * 3600e3);
  })();

  window.__pantalla = { estado: () => ({ fotos: fotos.length, cola: colaNuevas.length, protaActiva, pantalla, trivia }) };
})();
