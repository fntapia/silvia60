/* /pantalla: muro de polaroids en vivo + mensajes + trivia. Pensada para correr horas sin intervención. */
(function () {
  const C = window.CONFIG;
  const { $, esc } = S60;

  const MAX_FOTOS = 400;          // en memoria (las más nuevas)
  const SEG_ROTAR = 4500;         // cada cuánto se cambia una polaroid del collage
  const SEG_NUEVA = 5500;         // cuánto queda una foto nueva grande en el centro
  const SEG_ZOOM = 22000;         // cada cuánto puede agrandarse una al azar
  const SEG_LLUVIA = 4 * 60000;   // cada cuánto hay "lluvia de fotos"
  const CADA_MENSAJE = 80000, DURA_MENSAJE = 13000;

  let fotos = [];                 // [{id,url,autor,leyenda,creado}] de la más vieja a la más nueva
  const vistas = new Set();       // ids ya presentados como "foto nueva"
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
    $('.esquina-titulo').innerHTML = '<span class="oro-txt">¡Subí tu foto!</span> 📸';
    $('.esquina-eyebrow').textContent = 'Aparece acá al instante';
    $('#linkFotos').textContent = textoLink(linkFotos);
  }
  function esquinaTrivia() {
    $('#qrFotos').innerHTML = S60.qrSvg(linkTrivia);
    $('.esquina-titulo').innerHTML = '<span class="oro-txt">¡Sumate a la trivia!</span> 🎯';
    $('.esquina-eyebrow').textContent = 'Escaneá y jugá';
    $('#linkFotos').textContent = linkTrivia.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  esquinaFotos();
  $('#qrTrivia').innerHTML = S60.qrSvg(linkTrivia);
  $('#linkTrivia').textContent = linkTrivia.replace(/^https?:\/\//, '');

  /* ---------- Precarga de imágenes ---------- */
  // Con tiempos máximos: si el navegador se cuelga decodificando (pasa con la pestaña en segundo plano), el muro sigue igual
  function precargar(url) {
    return new Promise(ok => {
      const im = new Image();
      const listo = setTimeout(() => ok(false), 20000);
      im.decoding = 'async';
      im.onload = () => {
        const espera = new Promise(r => setTimeout(r, 1500));
        Promise.race([im.decode ? im.decode().catch(() => {}) : Promise.resolve(), espera]).then(() => { clearTimeout(listo); ok(true); });
      };
      im.onerror = () => { clearTimeout(listo); ok(false); };
      im.src = url;
    });
  }
  const azar = (a, b) => a + Math.random() * (b - a);
  const alAzar = l => l[Math.floor(Math.random() * l.length)];

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
    // si está a la vista (en el collage, volando o en la lluvia) se saca ya
    slots.forEach(s => { if (s.foto === id) { retirar(s.el); s.el = null; s.foto = null; } });
    document.querySelectorAll(`.pol[data-foto="${id}"]`).forEach(retirar);
    actualizarVacio();
  }
  function actualizarVacio() {
    const hay = fotos.length > 0;
    $('#vacio').classList.toggle('oculto', hay);
    $('#collage').classList.toggle('oculto', !hay);
  }

  /* ====================== MURO DE POLAROIDS ====================== */
  // Lugares del collage: grilla de 6 × 3 con desorden; abajo a la derecha queda libre para el QR.
  const COLS = 6, FILAS = 3;
  const slots = [];
  for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) {
    if (r === FILAS - 1 && c >= COLS - 2) continue;
    slots.push({ x: (c + .5) / COLS * 100, y: [22, 50, 77][r], el: null, foto: null, t: 0, cargando: null });
  }
  // con pocas fotos, se llenan primero los lugares del centro
  slots.sort((a, b) => Math.hypot((a.x - 46) * 2, a.y - 50) - Math.hypot((b.x - 46) * 2, b.y - 50));

  let zTop = 10;
  let ocupado = false;            // hay una foto nueva, un zoom o una lluvia en curso
  const collage = $('#collage');
  const muroActivo = () => pantalla.modo === 'fotos' && !pantalla.muro_pausado && !(pantalla.mensaje_manual || '').trim() && !document.hidden;
  const pie = f => `📸 ${esc(f.autor)}${f.leyenda ? ' · ' + esc(f.leyenda) : ''}`;
  const base = g => `translate(-50%, -50%) rotate(${g}deg)`;

  function crearPolaroid(f) {
    const el = document.createElement('figure');
    el.className = 'pol';
    el.dataset.foto = f.id;
    el.innerHTML = `<div class="pol-foto"><img alt="" src="${esc(f.url)}"></div><figcaption>${pie(f)}</figcaption>`;
    return el;
  }
  // Lo ubica en su lugar con un poco de desorden y una inclinación al azar
  function ubicar(el, s) {
    const g = azar(-8, 8);
    el.dataset.giro = g;
    el.style.left = (s.x + azar(-2.6, 2.6)) + '%';
    el.style.top = (s.y + azar(-2.5, 2.5)) + '%';
    el.style.transform = base(g);
    el.style.zIndex = ++zTop;
  }
  function retirar(el) {
    if (!el || el.dataset.saliendo) return;
    el.dataset.saliendo = '1';
    el.getAnimations().forEach(a => a.cancel());
    const a = el.animate([{ opacity: 1 }, { opacity: 0, transform: base(+el.dataset.giro || 0) + ' scale(.92)' }], { duration: 1400, easing: 'ease', fill: 'forwards' });
    a.onfinish = () => el.remove();
  }

  // Elige qué foto mostrar: la mitad de las veces una de las 10 más nuevas
  function elegir(lista) {
    if (lista.length > 3 && Math.random() < .5) return lista[Math.max(0, lista.length - 1 - Math.floor(Math.random() * Math.min(10, lista.length)))];
    return alAzar(lista);
  }
  async function ponerEnSlot(s, f, demora) {
    if (s.cargando) return;
    s.cargando = f.id;              // ya cuenta como «a la vista» para no repetirla
    const ok = await precargar(f.url);
    s.cargando = null;
    if (!ok || !fotos.some(x => x.id === f.id)) return;
    const vieja = s.el;
    const el = crearPolaroid(f);
    ubicar(el, s);
    collage.appendChild(el);
    s.el = el; s.foto = f.id; s.t = Date.now();
    const g = +el.dataset.giro;
    el.animate([
      { opacity: 0, transform: `translate(-50%, -50%) translateY(-2.5rem) rotate(${g - 10}deg) scale(1.18)` },
      { opacity: 1, transform: base(g) }
    ], { duration: 1100, delay: demora || 0, easing: 'cubic-bezier(.2, 1.25, .4, 1)', fill: 'backwards' });
    if (vieja) setTimeout(() => retirar(vieja), 500 + (demora || 0));
  }
  function llenarInicial() {
    const lista = fotos.slice().reverse();          // las más nuevas primero
    slots.forEach((s, i) => { if (lista[i]) ponerEnSlot(s, lista[i], i * 160); });
  }
  // Cambia una polaroid: primero llena lugares vacíos, si no reemplaza la que lleva más tiempo
  function rotarUno() {
    if (!fotos.length) return;
    const enVista = new Set(slots.flatMap(s => [s.foto, s.cargando]).filter(Boolean).concat(colaNuevas.map(f => f.id)));
    const libres = fotos.filter(f => !enVista.has(f.id));
    if (!libres.length) return;
    const vacio = slots.find(s => !s.el && !s.cargando);
    const destino = vacio || slots.filter(s => s.el && !s.cargando).sort((a, b) => a.t - b.t)[0];
    if (destino) ponerEnSlot(destino, elegir(libres));
  }

  /* ---------- Foto nueva: entra grande al centro con confeti y cae girando a su lugar ---------- */
  async function fotoNueva() {
    if (ocupado || !colaNuevas.length || !muroActivo()) return;
    const f = colaNuevas.shift();
    if (!(await precargar(f.url))) return;
    if (!fotos.some(x => x.id === f.id)) return;
    ocupado = true;
    const s = slots.find(x => !x.el && !x.cargando) || slots.filter(x => !x.cargando).sort((a, b) => a.t - b.t)[0];
    const vieja = s.el;
    const el = crearPolaroid(f);
    ubicar(el, s);
    el.classList.add('volando');
    collage.appendChild(el);
    s.el = el; s.foto = f.id; s.t = Date.now();
    // distancia desde su lugar final hasta el centro de la pantalla
    const caja = collage.getBoundingClientRect();
    const dx = innerWidth * .44 - (caja.left + caja.width * parseFloat(el.style.left) / 100);
    const dy = innerHeight * .535 - (caja.top + caja.height * parseFloat(el.style.top) / 100);
    const g = +el.dataset.giro;
    const centro = `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(-2deg) scale(1.9)`;
    const entra = 900, espera = colaNuevas.length > 3 ? 2500 : SEG_NUEVA, cae = 1500, total = entra + espera + cae;
    $('#nuevaFondo').classList.add('activo');
    const anim = el.animate([
      { offset: 0, opacity: 0, transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(-16deg) scale(.4)`, easing: 'cubic-bezier(.2, 1.3, .4, 1)' },
      { offset: entra / total, opacity: 1, transform: centro },
      { offset: (entra + espera) / total, opacity: 1, transform: centro, easing: 'cubic-bezier(.55, 0, .35, 1)' },
      { offset: 1, opacity: 1, transform: `translate(-50%, -50%) rotate(${g + 360}deg) scale(1)` }
    ], { duration: total });
    setTimeout(() => S60.fiesta(1400, 2.4), 450);
    setTimeout(() => $('#nuevaFondo').classList.remove('activo'), entra + espera);
    try { await anim.finished; } catch (e) {}
    el.classList.remove('volando');
    el.style.zIndex = ++zTop;
    if (vieja) retirar(vieja);
    ocupado = false;
  }

  /* ---------- De vez en cuando una se agranda y vuelve ---------- */
  async function zoomAlAzar() {
    if (ocupado || !muroActivo()) return;
    const llenos = slots.filter(s => s.el && !s.cargando && !s.el.dataset.saliendo);
    if (llenos.length < 3) return;
    ocupado = true;
    const el = alAzar(llenos).el, g = +el.dataset.giro;
    el.style.zIndex = ++zTop;
    const caja = collage.getBoundingClientRect();
    const dx = (innerWidth * .46 - (caja.left + caja.width * parseFloat(el.style.left) / 100)) * .5;
    const dy = (innerHeight * .5 - (caja.top + caja.height * parseFloat(el.style.top) / 100)) * .5;
    const grande = `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${g / 3}deg) scale(1.9)`;
    const a = el.animate([
      { offset: 0, transform: base(g), easing: 'cubic-bezier(.3, 1.2, .4, 1)' },
      { offset: .18, transform: grande },
      { offset: .8, transform: grande, easing: 'cubic-bezier(.5, 0, .3, 1)' },
      { offset: 1, transform: base(g) }
    ], { duration: 6500 });
    try { await a.finished; } catch (e) {}
    ocupado = false;
  }

  /* ---------- Lluvia de fotos: una cascada que cruza la pantalla ---------- */
  let ultimaLluvia = Date.now();
  async function lluvia() {
    if (ocupado || !muroActivo() || fotos.length < 4) return;
    ocupado = true;
    ultimaLluvia = Date.now();
    const cant = Math.min(18, Math.max(10, fotos.length));
    const elegidas = Array.from({ length: cant }, () => alAzar(fotos));
    await Promise.all(elegidas.map(f => precargar(f.url)));
    const alto = collage.getBoundingClientRect().height + innerHeight * .5;
    const caidas = elegidas.map((f, i) => {
      const el = crearPolaroid(f);
      el.classList.add('gota');
      el.style.left = (4 + (i * 37) % 92 + azar(-3, 3)) + '%';
      el.style.top = '0';
      el.dataset.giro = 0;
      collage.appendChild(el);
      const g0 = azar(-30, 30), g1 = g0 + azar(-220, 220), esc = azar(.6, .9);
      const a = el.animate([
        { transform: `translate(-50%, -100%) rotate(${g0}deg) scale(${esc})` },
        { transform: `translate(-50%, ${alto}px) rotate(${g1}deg) scale(${esc})` }
      ], { duration: azar(4200, 6200), delay: i * 320, easing: 'cubic-bezier(.45, .05, .7, .95)', fill: 'both' });
      return a.finished.catch(() => {}).then(() => el.remove());
    });
    await Promise.all(caidas);
    ocupado = false;
  }

  /* ---------- Mensajes para Silvia ---------- */
  let idxMensaje = 0;
  async function cargarMensajes() { try { mensajes = await Datos.mensajesPantalla() || []; } catch (e) {} }
  function mostrarMensaje() {
    if (!mensajes.length || !muroActivo() || ocupado) return;
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
    if (pantalla.muro_pausado || manual) $('#mensaje').classList.add('oculto');
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
      if (primera && fotos.length) llenarInicial();
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
    let preguntaId = null, offset = 0, reloj = null, pollResp = null, pollJug = null, mostroResultado = null, mostroFestejo = null;
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
        const act = async () => {
          try {
            // si la base todavía no tiene trivia_apodos (falta el SQL), el contador sigue andando igual
            const [n, apodos] = await Promise.all([Datos.trivia.cantidadJugadores(), Datos.trivia.apodos().catch(() => [])]);
            $('#tCantJug').textContent = n;
            burbujas(apodos || []);
          } catch (e) {}
        };
        act(); pollJug = setInterval(act, 2500);
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
      const ops = $('#tOpciones');
      ops.className = 't-opciones' + (p.tipo === 'vf' ? ' t-vf' : '');
      ops.innerHTML = p.tipo === 'vf'
        ? cartaVF(0) + cartaVF(1)
        : p.opciones.map((o, i) => `<div class="t-op op op${i}"><span class="forma"></span><span>${esc(o)}</span></div>`).join('');
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
      const yaMostrada = mostroFestejo === p.id;
      ver('tResultado');
      $('#trNum').textContent = `Pregunta ${p.num} de ${p.total}`;
      $('#trTexto').textContent = p.texto;
      const dato = p.dato || r.dato || '';
      const vf = p.tipo === 'vf';
      // En V/F con respuesta FALSO el dato va en el dorso de la tarjeta; si no, en una cinta debajo de la pregunta
      const datoEnCinta = dato && !(vf && r.correcta === 1);
      $('#trDato').classList.toggle('oculto', !datoEnCinta);
      $('#trDato').textContent = datoEnCinta ? '💡 ' + dato : '';
      const zona = $('#barras');
      if (vf) {
        zona.className = 'vf-res';
        zona.style.gridTemplateColumns = '';
        zona.innerHTML = [0, 1].map(i => `
          <div class="vf-carta-res ${i ? 'vf-f' : 'vf-v'}" data-i="${i}">
            <div class="vf-cara vf-frente"><span class="vf-icono">${i ? '❌' : '✅'}</span><b class="vf-palabra">${i ? 'FALSO' : 'VERDADERO'}</b><small>${r.conteos[i]} ${r.conteos[i] === 1 ? 'voto' : 'votos'}</small></div>
            ${i ? `<div class="vf-cara vf-dorso"><b>¡FALSO! ❌</b><p>${esc(dato || '¡Era FALSO! 😜')}</p></div>` : ''}
          </div>`).join('');
        const gana = zona.querySelector(`[data-i="${r.correcta}"]`), pierde = zona.querySelector(`[data-i="${1 - r.correcta}"]`);
        const animar = () => {
          gana.classList.add('gana'); pierde.classList.add('pierde');
          gana.querySelector('.vf-palabra').textContent = r.correcta ? '¡FALSO!' : '¡VERDADERO!';
          if (r.correcta === 1) setTimeout(() => gana.classList.add('girada'), 1500);
        };
        if (yaMostrada) { animar(); gana.classList.add('sin-anim'); pierde.classList.add('sin-anim'); }
        else requestAnimationFrame(() => setTimeout(animar, 350));
      } else {
        zona.className = 'barras';
        zona.style.gridTemplateColumns = `repeat(${p.opciones.length}, 1fr)`;
        const max = Math.max(1, ...r.conteos);
        zona.innerHTML = p.opciones.map((o, i) => `
          <div class="barra-col op op${i} ${i === r.correcta ? 'correcta' : ''}">
            <span class="barra-cant">${r.conteos[i]}</span>
            <div class="barra-alta" style="height:${Math.max(2, r.conteos[i] / max * 62)}%"></div>
            <div class="barra-etq"><span class="forma"></span><span>${esc(o)}</span></div>
          </div>`).join('');
      }
      $('#top5').innerHTML = top.map(j => `<li><span>${esc(j.apodo)}</span><b>${j.puntos}</b></li>`).join('') || '<li><span>Nadie sumó puntos todavía</span></li>';
      // Festejo en cada respuesta revelada (una sola vez por pregunta)
      if (!yaMostrada) {
        mostroFestejo = p.id;
        setTimeout(() => { S60.fiesta(2600, 2.4); S60.destellos(4500); }, vf ? 700 : 300);
      }
    }

    // Tarjetas grandes de Verdadero o Falso (pregunta en curso)
    function cartaVF(i) {
      return `<div class="vf-carta ${i ? 'vf-f' : 'vf-v'}"><span class="vf-icono">${i ? '❌' : '✅'}</span><b>${i ? 'FALSO' : 'VERDADERO'}</b></div>`;
    }

    // Burbujas con los apodos que se van sumando (las nuevas entran con un "pop")
    const enBurbuja = new Set();
    let partidaBurbujas = null;
    function burbujas(apodos) {
      const caja = $('#burbujas');
      if (partidaBurbujas !== trivia.partida) {
        partidaBurbujas = trivia.partida; enBurbuja.clear();
        caja.querySelectorAll('.burbuja').forEach(b => b.remove());
      }
      $('#burbujasVacio').classList.toggle('oculto', apodos.length > 0);
      let k = 0;
      apodos.forEach(a => {
        if (enBurbuja.has(a)) return;
        enBurbuja.add(a);
        const b = document.createElement('span');
        b.className = 'burbuja op op' + (enBurbuja.size % 4);
        b.textContent = a;
        b.style.setProperty('--d', (k++ * .12) + 's');
        b.style.setProperty('--f', (3 + Math.random() * 3).toFixed(1) + 's');
        caja.appendChild(b);
      });
      // como mucho 60 en pantalla: se van las más viejas
      const todas = caja.querySelectorAll('.burbuja');
      for (let i = 0; i < todas.length - 60; i++) todas[i].remove();
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

    setInterval(() => { if (muroActivo() && !ocupado) rotarUno(); }, SEG_ROTAR);
    setInterval(fotoNueva, 1000);
    setInterval(() => { if (Math.random() < .7) zoomAlAzar(); }, SEG_ZOOM);
    setInterval(() => { if (Date.now() - ultimaLluvia > SEG_LLUVIA) lluvia(); }, 15000);
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

  window.__pantalla = {
    estado: () => ({ fotos: fotos.length, cola: colaNuevas.length, ocupado, enPantalla: collage.querySelectorAll('.pol').length, pantalla, trivia }),
    lluvia, zoom: zoomAlAzar
  };
})();
