/* Invitación tipo historia + RSVP */
(function () {
  const C = window.CONFIG;
  const { $, $$, esc, local, toast } = S60;

  const params = new URLSearchParams(location.search);
  const slug = (params.get('i') || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  let grupo = null;          // {slug, nombres, cupo} si el link es válido
  let rsvpActual = null;

  if (C.modoDemo) { S60.bannerDemo(); document.body.classList.add('con-demo'); }

  /* ---------- Música opcional (arranca al abrir el sobre) ---------- */
  let audio = null;
  const btnMusica = $('#btnMusica');
  function marcarMusica() {
    const suena = audio && !audio.paused;
    btnMusica.setAttribute('aria-pressed', String(!!suena));
    btnMusica.setAttribute('aria-label', suena ? 'Pausar música' : 'Activar música');
  }
  if (C.musicaUrl) {
    audio = new Audio(C.musicaUrl);
    audio.loop = true; audio.volume = .5; audio.preload = 'none';
    btnMusica.classList.remove('oculto');
    btnMusica.addEventListener('click', () => {
      if (audio.paused) audio.play().then(marcarMusica).catch(() => toast('No se pudo reproducir la música', 'error'));
      else { audio.pause(); marcarMusica(); }
    });
  }
  S60.brillos($('#brillos'), { cantidad: innerWidth < 600 ? 28 : 44 });

  /* ---------- Textos desde config ---------- */
  // "Silvia" aparece letra por letra
  $('#nombreHomenajeada').innerHTML = Array.from(C.homenajeada).map((l, i) => `<span style="--i:${i}">${esc(l)}</span>`).join('');
  $('#nombreHomenajeada').setAttribute('aria-label', C.homenajeada);
  $('#fechaTexto').textContent = C.fechaTexto;
  $('#portadaFecha').textContent = C.fechaTexto;
  const zona = { timeZone: 'America/Argentina/San_Juan' };
  $('#calMes').textContent = S60.fechaEvento().toLocaleDateString('es-AR', Object.assign({ month: 'short' }, zona)).replace('.', '').slice(0, 3).toUpperCase();
  $('#calDia').textContent = S60.fechaEvento().toLocaleDateString('es-AR', Object.assign({ day: 'numeric' }, zona));
  $('#portadaHora').textContent = C.horaTexto;
  $('#horaTexto').textContent = C.horaTexto;
  $('#textoPuntual').textContent = C.textoPuntual;
  $('#lugarNombre').textContent = C.lugar.nombre;
  $('#lugarDireccion').textContent = C.lugar.direccion;
  $('#lugarLocalidad').textContent = C.lugar.localidad;
  $('#btnMaps').href = S60.urlMaps();
  $('#btnGoogleCal').href = S60.urlGoogleCalendar();
  $('#btnIcs').addEventListener('click', S60.descargarIcs);
  $('#dressTitulo').textContent = C.dressCode.titulo;
  $('#dressTexto').textContent = C.dressCode.texto;
  $('#muestras').innerHTML = C.dressCode.colores.map(c =>
    `<div class="muestra"><i class="${/dorado/i.test(c.nombre) ? 'dorado' : ''}" style="background:${esc(c.hex)}"></i>${esc(c.nombre)}</div>`).join('');
  $('#cierreTexto').textContent = C.cierre.texto;
  $('#cierreFirma').textContent = C.cierre.firma;
  $('#rsvpLimite').textContent = `Tenés tiempo hasta el ${C.fechaLimiteTexto}. Podés cambiar tu respuesta hasta esa fecha.`;
  // Fotos de Silvia (sin fondo) desde config.js
  $$('img[data-imagen]').forEach(img => {
    const im = C.imagenes[img.dataset.imagen];
    if (!im) return;
    img.onerror = () => { img.onerror = null; img.src = 'assets/silvia-placeholder.svg'; };
    img.src = im.src;
  });

  /* ---------- Elementos que flotan en cada pantalla ---------- */
  const tipos = ['', 'estrella', 'papel', '', 'estrella', 'blanco'];   // solo dorado y blanco: los puntos negros parecían manchas
  $$('.lamina, .apertura').forEach((l, n) => {
    const capa = document.createElement('div');
    capa.className = 'flotantes';
    capa.setAttribute('aria-hidden', 'true');
    let html = '';
    for (let k = 0; k < 7; k++) {
      // a los costados, para no tapar el contenido
      const lado = k % 2 ? 78 + Math.random() * 18 : 2 + Math.random() * 16;
      html += `<i class="${tipos[(k + n) % tipos.length]}" style="--x:${lado}%;--y:${8 + Math.random() * 84}%;--s:${6 + Math.random() * 9}px;--t:${3 + Math.random() * 3}s;--d:${-Math.random() * 3}s"></i>`;
    }
    capa.innerHTML = html;
    l.prepend(capa);
  });

  /* ---------- Emblema "60 · Silvia" como sello arriba de cada pantalla (portada y cierre lo tienen grande) ---------- */
  $$('.lamina:not(.portada):not(.cierre)').forEach(l => {
    const s = document.createElement('div');
    s.className = 'emblema emblema-sello';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<span class="emblema-60">${esc(String(C.edad))}</span><span class="emblema-nombre">${esc(C.homenajeada)}</span>`;
    l.prepend(s);
  });

  /* ---------- Emojis que saltan al entrar y al tocarlos ---------- */
  function saltar(el) { el.classList.remove('salta'); void el.offsetWidth; el.classList.add('salta'); }
  document.addEventListener('click', e => { const em = e.target.closest('.emoji-salto'); if (em) saltar(em); });

  /* ---------- APERTURA: sobre ---------- */
  const apertura = $('#apertura');
  let abierta = false;
  function abrir() {
    if (abierta) return;
    abierta = true;
    apertura.classList.add('abriendo');
    if (audio) audio.play().then(marcarMusica).catch(() => {});
    setTimeout(() => S60.confetiDorado({ x: .5, y: .5 }), 380);
    setTimeout(() => { apertura.classList.add('abierta'); document.body.classList.add('abierta'); }, 1150);
    setTimeout(() => apertura.remove(), 2000);
  }
  $('#sobre').addEventListener('click', abrir);
  apertura.addEventListener('click', e => { if (!e.target.closest('#sobre')) abrir(); });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) $('#sobre').addEventListener('click', () => { apertura.remove(); document.body.classList.add('abierta'); });

  /* ---------- Navegación tipo historia ---------- */
  const historia = $('#historia');
  const laminas = $$('.lamina');
  const barra = $('#progreso');
  barra.innerHTML = laminas.map(() => '<i></i>').join('');
  const marcas = $$('#progreso i');
  let actual = 0;

  const obs = new IntersectionObserver(entradas => {
    entradas.forEach(e => {
      if (e.isIntersecting) {
        const primeraVez = !e.target.classList.contains('visible');
        e.target.classList.add('visible');
        const em = e.target.querySelector('.contenido > .emoji-salto');
        if (em) setTimeout(() => saltar(em), 350);
        if (primeraVez && e.target.dataset.nombre === 'cierre') setTimeout(() => S60.destellos(3200), 400);
        actual = laminas.indexOf(e.target);
        marcas.forEach((m, i) => m.classList.toggle('hecho', i <= actual));
      }
    });
  }, { root: historia, threshold: .45 });
  laminas.forEach(l => obs.observe(l));

  function irA(i) {
    i = Math.max(0, Math.min(laminas.length - 1, i));
    laminas[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Toque en zonas vacías: derecha/centro avanza, borde izquierdo retrocede
  historia.addEventListener('click', e => {
    if (e.target.closest('a, button, input, select, textarea, label, form, .tarjeta, .celebracion')) return;
    if (getSelection && String(getSelection())) return;
    if (e.clientX < innerWidth * .22) irA(actual - 1); else irA(actual + 1);
  });
  addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); irA(actual + 1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); irA(actual - 1); }
  });
  $('#btnVolver').addEventListener('click', () => irA(0));

  /* ---------- Cuenta regresiva con números que giran ---------- */
  function poner(id, valor) {
    const el = $('#' + id);
    if (el.textContent === valor) return;
    if (el.textContent === '--') { el.textContent = valor; return; }
    el.classList.remove('gira'); void el.offsetWidth; el.classList.add('gira');
    setTimeout(() => { el.textContent = valor; }, 240);
  }
  function tic() {
    const r = S60.partesRestantes(S60.fechaEvento());
    const dos = n => String(n).padStart(2, '0');
    poner('cDias', String(r.dias)); poner('cHoras', dos(r.horas)); poner('cMin', dos(r.minutos)); poner('cSeg', dos(r.segundos));
    if (S60.fechaEvento() - Date.now() <= 0) $('#cuenta').innerHTML = '<p class="texto-grande">¡Llegó el gran día! 🥂</p>';
    else setTimeout(tic, 1000 - (Date.now() % 1000) + 20);
  }
  tic();

  /* ---------- Fotos ---------- */
  const linkFotos = S60.url('fotos/');
  $('#btnCompartirFotos').href = S60.urlWhatsApp(`📸 ¡Subí tus fotos del cumple de ${C.homenajeada}! Aparecen en vivo en la pantalla del salón: ${linkFotos}`);
  async function revisarFotos() {
    if (S60.fotosHabilitadas(await S60.modoPruebaActivo())) {
      $('#btnSubirFotos').classList.remove('oculto');
      $('#fotosTitulo').textContent = '¡Hoy el fotógrafo sos vos!';
    } else setTimeout(revisarFotos, 60000);
  }
  revisarFotos();

  /* ---------- Personalización ---------- */
  const integrantes = () => (grupo && Array.isArray(grupo.integrantes)) ? grupo.integrantes : [];
  const unirNombres = l => l.length <= 1 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1];
  function personalizar() {
    if (integrantes().length) {
      // Una casilla grande por integrante, todas tildadas
      $('#bloqueIntegrantes').classList.remove('oculto');
      $('#bloqueCantidad').classList.add('oculto');
      $('#listaIntegrantes').innerHTML = integrantes().map((n, i) =>
        `<label class="integrante"><input type="checkbox" name="integrante" value="${esc(n)}" checked><span class="tilde" aria-hidden="true">✓</span><span>${esc(n)}</span></label>`).join('');
      $('#listaIntegrantes').addEventListener('change', marcarIntegrantes);
      marcarIntegrantes();
    }
    if (grupo) {
      const plural = grupo.cupo > 1;
      $('#saludoNombres').textContent = 'Hola, ' + grupo.nombres;
      $('#saludoCupo').innerHTML = `<b class="cupo-num">${grupo.cupo}</b>` + (plural ? 'lugares reservados para ustedes' : 'lugar reservado para vos');
      $('#aperturaPara').textContent = 'Para ' + grupo.nombres;
      $('#campoNombre').classList.add('oculto');
      $('#legendAsiste').textContent = plural ? '¿Vienen?' : '¿Venís?';
      $('#rsvpTitulo').textContent = plural ? '¿Me acompañan?' : '¿Me acompañás?';
      $('#cupoInfo').textContent = plural ? `Máximo ${grupo.cupo} personas` : '';
      document.title = `${grupo.nombres}: ¡están invitados a los 60 de ${C.homenajeada}!`;
    } else {
      $('#legendAsiste').textContent = '¿Venís?';
      $('#cupoInfo').textContent = 'Contanos cuántas personas vienen con esta confirmación';
    }
  }

  /* ---------- RSVP ---------- */
  const form = $('#formRsvp');
  const cupoMax = () => grupo ? grupo.cupo : 10;
  let cantidad = 1;
  function setCantidad(n) {
    cantidad = Math.max(1, Math.min(cupoMax(), n));
    $('#cantidadVer').textContent = cantidad;
    form.cantidad.value = cantidad;
    $('#menos').disabled = cantidad <= 1;
    $('#mas').disabled = cantidad >= cupoMax();
  }
  $('#menos').addEventListener('click', () => setCantidad(cantidad - 1));
  $('#mas').addEventListener('click', () => setCantidad(cantidad + 1));

  function actualizarVisibles() {
    const asiste = (form.querySelector('[name=asiste]:checked') || {}).value;
    $('#bloqueSi').classList.toggle('oculto', asiste !== 'si');
  }
  const tildados = () => $$('#listaIntegrantes input:checked').map(i => i.value);
  function marcarIntegrantes() {
    $$('#listaIntegrantes .integrante').forEach(l => l.classList.toggle('no-viene', !l.querySelector('input').checked));
    const n = tildados().length;
    $('#integrantesInfo').textContent = n === 0 ? 'Si no viene nadie, se envía como «No podremos».' : `Vienen ${n} de ${integrantes().length}. Destildá a quien no pueda venir.`;
  }
  form.addEventListener('change', actualizarVisibles);
  // Hasta 2 canciones: al mostrar la segunda, el botón desaparece (no hay tercera)
  $('#btnOtraCancion').addEventListener('click', () => { $('#cancion2').classList.remove('oculto'); $('#btnOtraCancion').classList.add('oculto'); form.tema1.focus(); });

  function claveToken() { return 'rsvp_token_' + (grupo ? grupo.slug : 'general'); }

  function llenarForm(r) {
    if (!r) { setCantidad(grupo ? grupo.cupo : 1); return; }
    form.nombre_contacto.value = r.nombre_contacto || '';
    const a = form.querySelector(`[name=asiste][value="${r.asiste}"]`); if (a) a.checked = true;
    setCantidad(r.cantidad || (grupo ? grupo.cupo : 1));
    form.nombres_asistentes.value = r.nombres_asistentes || '';
    if (integrantes().length) {
      // tildar solo a quienes figuran como que vienen
      const vienen = r.asiste === 'si' ? String(r.nombres_asistentes || '').split(/\s*,\s*|\s+y\s+/).map(s => s.trim().toLowerCase()) : [];
      $$('#listaIntegrantes input').forEach(i => { i.checked = r.asiste !== 'si' || vienen.includes(i.value.toLowerCase()); });
      marcarIntegrantes();
    }
    (r.canciones || []).forEach((c, i) => { form['tema' + i].value = c.tema || ''; form['artista' + i].value = c.artista || ''; });
    if ((r.canciones || []).length > 1) { $('#cancion2').classList.remove('oculto'); $('#btnOtraCancion').classList.add('oculto'); }
    form.mensaje.value = r.mensaje || '';
    form.mostrar_mensaje.checked = r.mostrar_mensaje !== false;
    actualizarVisibles();
  }

  function textoGracias(r) {
    if (r.asiste === 'si') return esc(r.cantidad > 1 ? `¡Gracias! ${C.homenajeada} ya sabe que vienen 💛` : `¡Gracias! ${C.homenajeada} ya sabe que venís 💛`) +
      '<span class="celebracion-sub">Vení con la mejor onda, que la vamos a pasar súper divertido 💃🕺🎉</span>';
    if (r.asiste === 'no') return '¡Gracias por avisar! Te vamos a extrañar 💛';
    return esc(`¡Gracias! Acordate de confirmar antes del ${C.fechaLimiteTexto} 💛`);
  }

  function mostrarResumen(r) {
    $('#rsvpCargando').classList.add('oculto');
    form.classList.add('oculto');
    $('#rsvpResumen').classList.remove('oculto');
    const titulos = { si: r.cantidad > 1 ? `¡Confirmaron ${r.cantidad} personas!` : '¡Confirmaste tu asistencia!', no: 'Nos avisaste que no podrán venir', nose: 'Nos dijiste que todavía no sabés' };
    if (r.asiste === 'si' && integrantes().length && r.nombres_asistentes) titulos.si = `Vienen ${r.cantidad}: ${r.nombres_asistentes}`;
    $('#resumenTitulo').textContent = titulos[r.asiste];
    const partes = [];
    if (r.asiste === 'si' && r.nombres_asistentes && !integrantes().length) partes.push(r.nombres_asistentes);
    if (r.canciones && r.canciones.length) partes.push('🎶 ' + r.canciones.map(c => c.tema + (c.artista ? ' – ' + c.artista : '')).join(' · '));
    $('#resumenDetalle').textContent = partes.join('  ·  ');
    $('#btnModificar').classList.toggle('oculto', !S60.rsvpAbierto());
    if (!S60.rsvpAbierto()) $('#resumenDetalle').textContent += ' (el plazo para cambiar la respuesta ya terminó)';
  }
  function mostrarForm() {
    $('#rsvpCargando').classList.add('oculto');
    $('#rsvpResumen').classList.add('oculto');
    if (!S60.rsvpAbierto()) { $('#rsvpCerrado').classList.remove('oculto'); return; }
    form.classList.remove('oculto');
  }
  $('#btnModificar').addEventListener('click', () => { llenarForm(rsvpActual); mostrarForm(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#errorRsvp');
    err.textContent = '';
    let asiste = (form.querySelector('[name=asiste]:checked') || {}).value;
    if (!grupo && !form.nombre_contacto.value.trim()) { err.textContent = 'Contanos tu nombre, así sabemos quién confirma 🙂'; form.nombre_contacto.focus(); return; }
    if (!asiste) { err.textContent = 'Elegí si vienen, si no pueden o si todavía no saben.'; return; }
    const canciones = [0, 1].map(i => ({ tema: form['tema' + i].value.trim(), artista: form['artista' + i].value.trim() })).filter(c => c.tema).slice(0, 2);
    // Con integrantes: la cantidad son las casillas tildadas; si no queda nadie tildado, es "No podremos"
    let cant = cantidad, nombres = form.nombres_asistentes.value.trim();
    if (asiste === 'si' && integrantes().length) {
      const t = tildados();
      if (!t.length) asiste = 'no';
      cant = t.length; nombres = unirNombres(t);
    }
    const datos = {
      nombre_contacto: form.nombre_contacto.value.trim(),
      asiste,
      cantidad: asiste === 'si' ? cant : 0,
      nombres_asistentes: asiste === 'si' ? nombres : '',
      menu: 'ninguno',
      menu_detalle: '',
      canciones: asiste === 'si' ? canciones : [],
      mensaje: form.mensaje.value.trim(),
      mostrar_mensaje: form.mostrar_mensaje.checked
    };
    const btn = $('#btnEnviar');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await Datos.guardarRsvp(grupo ? grupo.slug : null, local.leer(claveToken()), datos);
      if (r && r.token) local.guardar(claveToken(), r.token);
      rsvpActual = Object.assign({}, datos, { token: r && r.token });
      $('#celebracionTexto').innerHTML = textoGracias(rsvpActual);
      $('#celebracionIcono').textContent = { si: '🥳', no: '💛', nose: '✨' }[asiste];
      $('#celebracion').classList.remove('oculto');
      $('#btnCerrarCelebracion').focus();
      // "Sí": fiesta grande · "No": corazones dorados que suben, tranquilo · "No sé": unos destellos
      if (asiste === 'si') S60.fiesta(2800);
      else if (asiste === 'no') S60.corazones(16);
      else S60.confetiDorado({ x: .5, y: .4 });
      mostrarResumen(rsvpActual);
    } catch (ex) {
      err.textContent = ex.message && ex.message.length < 160 ? ex.message : 'No pudimos guardar tu respuesta. Revisá la conexión y probá de nuevo.';
    } finally {
      btn.disabled = false; btn.textContent = 'Confirmar';
    }
  });
  $('#btnCerrarCelebracion').addEventListener('click', () => { $('#celebracion').classList.add('oculto'); irA(laminas.indexOf($('[data-nombre=fotos]'))); });

  /* ---------- Arranque ---------- */
  (async function iniciar() {
    try {
      if (slug) grupo = await Datos.obtenerGrupo(slug);
    } catch (e) { console.warn('No se pudo cargar el grupo', e); }
    personalizar();
    try {
      const token = local.leer(claveToken());
      rsvpActual = (grupo || token) ? await Datos.obtenerRsvp({ slug: grupo ? grupo.slug : null, token }) : null;
    } catch (e) { console.warn('No se pudo cargar la confirmación', e); }
    if (rsvpActual) mostrarResumen(rsvpActual);
    else { llenarForm(null); mostrarForm(); }
  })();
})();
