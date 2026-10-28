/* Panel de administración */
(function () {
  const C = window.CONFIG;
  const { $, $$, esc, toast } = S60;
  const A = Datos.admin;
  const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  let grupos = [], rsvps = [], fotos = [], preguntas = [];
  let filtroFotos = 'todas';
  let pantallaEstado = {}, triviaEstado = {};

  S60.bannerDemo();
  if (C.modoDemo) $('#loginAyuda').textContent = 'Modo demo: cualquier email y la contraseña «demo».';

  /* ---------- Utilidades ---------- */
  function csv(filas, columnas) {
    const celda = v => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lineas = [columnas.map(c => celda(c.titulo)).join(';')].concat(filas.map(f => columnas.map(c => celda(c.valor(f))).join(';')));
    return new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });   // con BOM y ; para que Excel lo abra bien
  }
  const hoy = () => new Date().toISOString().slice(0, 10);
  const linkGrupo = g => S60.url('?i=' + encodeURIComponent(g.slug));
  const textoAsiste = { si: 'Sí', no: 'No', nose: 'Todavía no sabe' };
  const listaIntegrantes = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  async function conBoton(btn, fn) {
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message || 'Algo salió mal', 'error', 5000); } finally { btn.disabled = false; }
  }

  /* ---------- Sesión ---------- */
  $('#formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    $('#loginError').textContent = '';
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try { await A.login($('#loginEmail').value.trim(), $('#loginClave').value); entrar(); }
    catch (ex) { $('#loginError').textContent = ex.message; }
    finally { btn.disabled = false; }
  });
  $('#btnSalir').addEventListener('click', async () => { await A.logout(); location.reload(); });

  function entrar() {
    $('#login').classList.add('oculto');
    $('#panel').classList.remove('oculto');
    abrirTab(location.hash.slice(1) || 'invitados');
    cargarTodo();
    Datos.escucharFotos(() => { if (tabActual === 'fotos') cargarFotos(); });
    Datos.trivia.escuchar(e => { triviaEstado = Object.assign(triviaEstado, e); pintarEstadoTrivia(); pintarEnVivo(); });
    Datos.escucharPantalla(p => { pantallaEstado = Object.assign(pantallaEstado, p); pintarPantalla(); pintarEnVivo(); alCambiarPantalla(); });
    setInterval(pintarEstadoTrivia, 4000);
    contarFotos(); medirDesfase();
    setInterval(pintarEnVivo, 4000);
    setInterval(contarFotos, 20000);
    setInterval(medirDesfase, 10 * 60000);
    setInterval(() => { if (tabActual === 'videos') pintarProgreso(); }, 1000);
    setInterval(() => { if (tabActual === 'itinerario' && !document.querySelector('#tab-itinerario input:focus') && $('#modalMomento').classList.contains('oculto')) pintarItinerario(); }, 20000);
  }

  /* ---------- Qué se ve ahora en la pantalla del salón (mismas reglas que /pantalla) ---------- */
  let fotosEnMuro = null, desfase = 0;
  async function contarFotos() { try { fotosEnMuro = (await Datos.fotosPublicas()).length; pintarEnVivo(); } catch (e) {} }
  async function medirDesfase() {
    try { const p = await Datos.trivia.preguntaActual(); if (p && p.ahora) desfase = new Date(p.ahora).getTime() - Date.now(); } catch (e) {}
  }
  async function pintarEnVivo() {
    const p = pantallaEstado || {}, e = triviaEstado || {};
    const triviaAbierta = p.modo === 'trivia' && e.fase && e.fase !== 'apagada';
    let jug = null;
    if (triviaAbierta && (e.fase === 'podio' || e.fase === 'lobby')) { try { jug = await Datos.trivia.cantidadJugadores(); } catch (x) {} }
    const edad = e.actualizado ? Date.now() - (new Date(e.actualizado).getTime() - desfase) : 0;
    // en el lobby, mientras haya gente sumándose la pantalla espera: acá solo se aplica el límite si nadie entró
    const vencida = triviaAbierta && !(e.fase === 'lobby' && jug > 0) && S60.triviaAlMuro(e.fase, edad, jug);
    const enTrivia = triviaAbierta && !vencida;
    const manual = (p.mensaje_manual || '').trim();
    const r = p.reproduccion;
    let txt;
    // un video o una animación tapan todo lo demás
    if (repActiva(r)) txt = r.tipo === 'video' ? `🎬 ${tituloVideo(r.id)} · ${r.estado === 'pausa' ? '⏸ en pausa' : '▶ reproduciendo'}` : `Animación ${ANIMS[r.id] ? ANIMS[r.id].titulo : ''}`;
    else if (manual) txt = `Mensaje «${manual.slice(0, 40)}${manual.length > 40 ? '…' : ''}»`;
    else if (enTrivia) txt = { lobby: `Trivia: esperando jugadores${jug != null ? ' · ' + jug + ' adentro' : ''}`, pregunta: `Trivia: pregunta ${e.pregunta_num}/${e.total}`, resultado: `Trivia: respuesta de la ${e.pregunta_num}/${e.total}`, ranking: 'Trivia: ranking', podio: 'Podio 🏆' }[e.fase] || 'Trivia';
    else if (p.muro_pausado) txt = 'Pausada ⏸';
    else txt = fotosEnMuro == null ? 'Muro de fotos' : fotosEnMuro === 0 ? 'Muro de fotos · todavía sin fotos (QR grande)' : `Muro de fotos · ${fotosEnMuro} ${fotosEnMuro === 1 ? 'foto' : 'fotos'}`;
    if (vencida) txt += ' (la trivia quedó abierta: la pantalla volvió sola)';
    $$('.en-vivo').forEach(el => { el.classList.toggle('trivia', enTrivia); el.querySelector('.en-vivo-txt').textContent = txt; });
  }

  // Botón de emergencia: apaga la trivia y deja la pantalla en el muro de fotos, en un toque
  $$('.btn-volver-muro').forEach(b => b.addEventListener('click', e => {
    if (!confirm('¿Volver al muro de fotos?\n\nSe cierra la trivia y se corta el video o la animación (si había).')) return;
    conBoton(e.currentTarget, async () => {
      if (pantallaEstado.reproduccion) { try { await A.actualizarPantalla({ reproduccion: null }); pantallaEstado.reproduccion = null; pintarVideos(); } catch (x) {} }
      const r = await A.controlTrivia('cerrar');
      if (r) triviaEstado = Object.assign(triviaEstado, r);
      pantallaEstado.modo = 'fotos';
      pintarEstadoTrivia(); pintarPantalla(); pintarEnVivo();
      toast('Listo: la pantalla muestra el muro de fotos 🖼');
    });
  }));

  /* ---------- Pestañas ---------- */
  let tabActual = 'invitados';
  const TITULOS = { invitados: 'Invitados', confirmaciones: 'Confirmados', itinerario: 'Itinerario', fotos: 'Fotos', pantalla: 'Pantalla', videos: 'Videos', trivia: 'Trivia', evento: 'Evento' };
  function abrirTab(t) {
    if (t === 'playlist' || t === 'mensajes') t = 'confirmaciones';   // links viejos
    if (!$('#tab-' + t)) t = 'invitados';
    tabActual = t;
    $$('#pestanas button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('.tab').forEach(s => s.classList.toggle('oculto', s.id !== 'tab-' + t));
    $('#tituloSeccion').textContent = TITULOS[t];
    history.replaceState(null, '', '#' + t);
    scrollTo(0, 0);
    if (t === 'fotos') cargarFotos();
    if (t === 'confirmaciones') cargarRsvps();
    if (t === 'evento') pintarEvento();
    if (t === 'itinerario') cargarItinerario();
    if (t === 'videos') cargarVideos();
  }
  $('#pestanas').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) abrirTab(b.dataset.tab); });
  // Fotos y Evento se usan poco: quedan en el menú ☰
  $('#menuLista').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) { menu(false); abrirTab(b.dataset.tab); } });

  /* ---------- Menú del encabezado ---------- */
  function menu(abrir) {
    $('#menuLista').classList.toggle('oculto', !abrir);
    $('#btnMenu').setAttribute('aria-expanded', String(abrir));
  }
  $('#btnMenu').addEventListener('click', e => { e.stopPropagation(); menu($('#menuLista').classList.contains('oculto')); });
  document.addEventListener('click', e => { if (!e.target.closest('.menu-sup')) menu(false); });

  async function cargarTodo() {
    await Promise.all([cargarGrupos(), cargarRsvps(), cargarPreguntas(), cargarEstados(), cargarVideos()]);
  }

  /* ====================== INVITADOS ====================== */
  async function cargarGrupos() {
    try { grupos = await A.grupos(); } catch (e) { toast(e.message, 'error'); }
    pintarGrupos();
  }
  function rsvpDe(g) { return rsvps.find(r => r.grupo && r.grupo.slug === g.slug); }
  function pintarGrupos() {
    const cupoTotal = grupos.reduce((a, g) => a + g.cupo, 0);
    $('#resumenInvitados').textContent = `${grupos.length} ${grupos.length === 1 ? 'familia' : 'familias'} · ${cupoTotal} lugares`;
    if (!grupos.length) { $('#listaGrupos').innerHTML = '<p class="vacio-tabla">Todavía no hay familias. Tocá «+ Nueva familia» o importá un CSV.</p>'; return; }
    // Una tarjeta por familia: nombres, integrantes, cupo, estado y botones grandes
    $('#listaGrupos').innerHTML = grupos.map(g => {
      const r = rsvpDe(g);
      const estado = r ? `<span class="pill ${r.asiste}">${textoAsiste[r.asiste]}${r.asiste === 'si' ? ' · ' + r.cantidad : ''}</span>` : '<span class="pill sin">Sin respuesta</span>';
      const integ = listaIntegrantes(g.integrantes);
      return `<article class="familia" data-id="${g.id}">
        <div class="familia-cab"><h4>${esc(g.nombres)}</h4>${estado}</div>
        ${integ.length ? `<p class="integ">👥 ${esc(integ.join(', '))}</p>` : ''}
        <p class="meta">Cupo ${g.cupo}${g.telefono ? ' · 📞 ' + esc(g.telefono) : ''}<br><code>?i=${esc(g.slug)}</code></p>
        <div class="familia-botones">
          <a class="btn btn-oro btn-wa" target="_blank" rel="noopener" href="${esc(S60.urlWhatsApp(C.mensajeWhatsApp.replace('{nombres}', g.nombres).replace('{link}', linkGrupo(g)), g.telefono))}">💬 Enviar por WhatsApp</a>
          <button class="btn" data-accion="copiar" type="button">🔗 Copiar link</button>
          <button class="btn" data-accion="editar" type="button">✏️ Editar</button>
          <button class="btn btn-peligro" data-accion="borrar" type="button" aria-label="Borrar ${esc(g.nombres)}">🗑 Borrar</button>
        </div></article>`;
    }).join('');
  }
  $('#listaGrupos').addEventListener('click', async e => {
    const b = e.target.closest('button[data-accion]');
    if (!b) return;
    const g = grupos.find(x => x.id === b.closest('.familia').dataset.id);
    if (b.dataset.accion === 'copiar') {
      try { await navigator.clipboard.writeText(linkGrupo(g)); toast('Link copiado ✔'); } catch (ex) { prompt('Copiá el link:', linkGrupo(g)); }
    } else if (b.dataset.accion === 'editar') {
      const f = $('#formGrupo');
      f.id.value = g.id; f.nombres.value = g.nombres; f.cupo.value = g.cupo; f.telefono.value = g.telefono || ''; f.slug.value = g.slug;
      f.integrantes.value = listaIntegrantes(g.integrantes).join(', ');
      cupoManual = listaIntegrantes(g.integrantes).length !== g.cupo;
      mostrarFormGrupo('Editar familia', 'Guardar cambios');
    } else if (b.dataset.accion === 'borrar') {
      if (!confirm(`¿Borrar a «${g.nombres}»? También se borra su confirmación.`)) return;
      await conBoton(b, async () => { await A.borrarGrupo(g.id); toast('Familia borrada'); await cargarGrupos(); });
    }
  });
  function mostrarFormGrupo(titulo, boton) {
    const f = $('#formGrupo');
    $('#tituloFormGrupo').textContent = titulo;
    $('#btnGuardarGrupo').textContent = boton;
    f.classList.remove('oculto');
    $('#btnNuevaFamilia').classList.add('oculto');
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => f.nombres.focus(), 300);
  }
  function limpiarFormGrupo() {
    const f = $('#formGrupo'); f.reset(); f.id.value = ''; slugManual = false; cupoManual = false;
    f.classList.add('oculto');
    $('#btnNuevaFamilia').classList.remove('oculto');
  }
  $('#btnNuevaFamilia').addEventListener('click', () => { limpiarFormGrupo(); mostrarFormGrupo('Nueva familia', 'Guardar familia'); });
  $('#btnCancelarGrupo').addEventListener('click', limpiarFormGrupo);
  let slugManual = false, cupoManual = false;
  $('#formGrupo').slug.addEventListener('input', () => { slugManual = true; });
  // El cupo se calcula solo con la cantidad de integrantes (salvo que lo hayan cambiado a mano)
  $('#formGrupo').cupo.addEventListener('input', () => { cupoManual = true; });
  $('#formGrupo').integrantes.addEventListener('input', e => {
    const n = listaIntegrantes(e.target.value).length;
    if (n && !cupoManual) $('#formGrupo').cupo.value = Math.min(30, n);
  });
  $('#formGrupo').nombres.addEventListener('input', e => {
    const f = $('#formGrupo');
    if (!f.id.value && !slugManual) f.slug.value = nuevoSlug(e.target.value);
  });
  // slug legible + 4 caracteres al azar, para que nadie adivine el link de otra familia
  function nuevoSlug(nombres) {
    const base = S60.slugificar(nombres) || 'invitado';
    let s;
    do { s = base.slice(0, 50) + '-' + S60.sufijoAleatorio(4); } while (grupos.some(g => g.slug === s));
    return s;
  }
  $('#formGrupo').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const integ = listaIntegrantes(f.integrantes.value);
    const g = { id: f.id.value || null, nombres: f.nombres.value.trim(), cupo: parseInt(f.cupo.value, 10), telefono: f.telefono.value.trim(),
      integrantes: integ.join(', '), slug: (f.slug.value.trim() || nuevoSlug(f.nombres.value)).toLowerCase() };
    if (!g.nombres) return;
    if (!(g.cupo >= 1 && g.cupo <= 30)) { toast('El cupo tiene que ser entre 1 y 30', 'error'); return; }
    if (integ.length > g.cupo) { toast(`Hay ${integ.length} integrantes y el cupo es ${g.cupo}: subí el cupo o sacá nombres`, 'error', 6000); return; }
    await conBoton($('#btnGuardarGrupo'), async () => {
      await A.guardarGrupo(g);
      toast(g.id ? 'Cambios guardados ✔' : 'Familia agregada ✔');
      limpiarFormGrupo();
      await cargarGrupos();
    });
  });

  // Importar CSV. Formato de "07 Invitados/invitados.csv": slug;nombres_a_mostrar;integrantes;cupo;telefono;notas
  // (integrantes separados por coma: "Marta, Carlos, Sofi"; si el cupo viene vacío se cuenta solo).
  // También acepta el formato corto nombres;cupo;telefono. Slug vacío → se genera con 4 letras al azar.
  const SLUGS_IGNORADOS = ['familia-ejemplo'];
  function leerCsvInvitados(texto) {
    const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lineas.length) return [];
    const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';
    const partir = l => { const r = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r.map(x => x.trim()); };
    const filas = lineas.map(partir);
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let col = { slug: -1, nombres: 0, cupo: 1, telefono: 2 };
    if (filas[0].some(c => /nombre/.test(norm(c)))) {
      const enc = filas.shift().map(norm);
      col = { slug: enc.findIndex(c => c === 'slug'), nombres: enc.findIndex(c => /nombre/.test(c)), cupo: enc.findIndex(c => /cupo/.test(c)),
        telefono: enc.findIndex(c => /tel/.test(c)), integrantes: enc.findIndex(c => /integrante/.test(c)) };
    }
    const dato = (f, i) => (i >= 0 && f[i] != null ? f[i] : '').trim();
    return filas.map(f => {
      const integ = listaIntegrantes(dato(f, col.integrantes));
      const cupoCsv = parseInt(dato(f, col.cupo), 10);
      return {
        slug: S60.slugificar(dato(f, col.slug)).replace(/^-|-$/g, ''),
        nombres: dato(f, col.nombres),
        integrantes: integ.join(', '),
        cupo: Math.max(1, Math.min(30, Math.max(cupoCsv || 0, integ.length) || 1)),
        telefono: dato(f, col.telefono)
      };
    }).filter(g => g.nombres && !SLUGS_IGNORADOS.includes(g.slug));
  }
  $('#inputCsv').addEventListener('change', async e => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    const nuevos = leerCsvInvitados(await archivo.text());
    if (!nuevos.length) { toast('No encontré invitados para importar (la fila «familia-ejemplo» se ignora)', 'error', 6000); return; }
    // Ya cargado = mismo slug, o (sin slug) mismo nombre: así importar dos veces el mismo archivo no duplica
    const mismoNombre = (a, b) => S60.slugificar(a) === S60.slugificar(b);
    const repetidos = nuevos.filter(g => g.slug ? grupos.some(x => x.slug === g.slug) : grupos.some(x => mismoNombre(x.nombres, g.nombres)));
    const aCargar = nuevos.filter(g => !repetidos.includes(g));
    if (!aCargar.length) { toast(`Todos los grupos del archivo ya estaban cargados (${repetidos.length})`, '', 6000); return; }
    if (!confirm(`Se van a agregar ${aCargar.length} ${aCargar.length === 1 ? 'grupo' : 'grupos'} (${aCargar.reduce((a, g) => a + g.cupo, 0)} lugares).` +
      (repetidos.length ? `\n${repetidos.length} ya ${repetidos.length === 1 ? 'estaba cargado y se saltea' : 'estaban cargados y se saltean'}.` : '') + '\n¿Seguimos?')) return;
    let ok = 0, mal = 0;
    for (const g of nuevos) {
      if (repetidos.includes(g)) continue;
      try {
        if (!g.slug || g.slug.length < 3) g.slug = nuevoSlug(g.nombres);
        await A.guardarGrupo(g);
        grupos.push(Object.assign({ id: 'tmp' }, g)); ok++;
      } catch (ex) { mal++; }
    }
    toast(`Importados: ${ok}${repetidos.length ? ' · ya estaban: ' + repetidos.length : ''}${mal ? ' · con error: ' + mal : ''}`, mal ? 'error' : '', 6000);
    await cargarGrupos();
  });

  /* ====================== CONFIRMACIONES ====================== */
  async function cargarRsvps() {
    try { rsvps = await A.rsvps(); } catch (e) { toast(e.message, 'error'); }
    pintarRsvps(); pintarPlaylist(); pintarMensajes(); pintarGrupos();
  }
  function pintarRsvps() {
    const si = rsvps.filter(r => r.asiste === 'si'), no = rsvps.filter(r => r.asiste === 'no'), nose = rsvps.filter(r => r.asiste === 'nose');
    const sinResp = grupos.filter(g => !rsvpDe(g)).length;
    const personas = si.reduce((a, r) => a + r.cantidad, 0);
    const lugares = grupos.reduce((a, g) => a + g.cupo, 0);
    const n = (num, txt) => `<div class="num"><b>${num}</b><span>${txt}</span></div>`;
    $('#numeros').innerHTML = n(personas, 'personas confirmadas') + n(si.length, 'grupos que vienen') + n(no.length, 'no van') + n(nose.length, 'todavía no saben') + n(sinResp, 'grupos sin respuesta') + n(lugares, 'lugares reservados');
    if (!rsvps.length) { $('#listaRsvp').innerHTML = '<p class="vacio-tabla">Todavía no hay respuestas.</p>'; return; }
    $('#listaRsvp').innerHTML = rsvps.map(r => `<article class="familia respuesta">
        <div class="familia-cab"><h4>${esc(nombreRsvp(r))}${r.grupo ? '' : ' <small class="suave">(link general)</small>'}</h4>
          <span class="pill ${r.asiste}">${textoAsiste[r.asiste]}${r.asiste === 'si' ? ' · ' + r.cantidad : ''}</span></div>
        ${r.asiste === 'si' && r.nombres_asistentes ? `<p class="integ">👥 ${esc(r.nombres_asistentes)}</p>` : ''}
        <p class="meta">Actualizado ${S60.formatoFechaHora(r.actualizado)}</p></article>`).join('');
  }
  const nombreRsvp = r => r.grupo ? r.grupo.nombres : (r.nombre_contacto || 'Sin nombre');
  $('#btnExportarRsvp').addEventListener('click', () => {
    const filas = rsvps.map(r => r).concat(grupos.filter(g => !rsvpDe(g)).map(g => ({ grupo: g, asiste: null })));
    S60.descargarArchivo(csv(filas, [
      { titulo: 'Grupo / nombre', valor: r => nombreRsvp(r) },
      { titulo: 'Cupo', valor: r => r.grupo ? r.grupo.cupo : '' },
      { titulo: '¿Viene?', valor: r => r.asiste ? textoAsiste[r.asiste] : 'Sin respuesta' },
      { titulo: 'Cantidad', valor: r => r.asiste === 'si' ? r.cantidad : 0 },
      { titulo: 'Quiénes vienen', valor: r => r.asiste === 'si' ? (r.nombres_asistentes || '') : '' },
      { titulo: 'Integrantes del grupo', valor: r => r.grupo ? listaIntegrantes(r.grupo.integrantes).join(', ') : '' },
      { titulo: 'Link', valor: r => r.grupo ? linkGrupo(r.grupo) : '' },
      { titulo: 'Actualizado', valor: r => r.actualizado ? S60.formatoFechaHora(r.actualizado) : '' }
    ]), `confirmaciones-silvia60-${hoy()}.csv`);
  });

  /* ====================== PLAYLIST ====================== */
  function playlist() {
    const mapa = new Map();
    rsvps.forEach(r => (r.canciones || []).forEach(c => {
      const clave = (c.tema + '|' + (c.artista || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9|]/g, '');
      const e = mapa.get(clave) || { tema: c.tema, artista: c.artista || '', veces: 0, quienes: [] };
      e.veces++; e.quienes.push(nombreRsvp(r));
      mapa.set(clave, e);
    }));
    return Array.from(mapa.values()).sort((a, b) => b.veces - a.veces || a.tema.localeCompare(b.tema));
  }
  function pintarPlaylist() {
    const p = playlist();
    $('#listaPlaylist').innerHTML = p.length ? p.map(c => `<div class="cancion"><p><b>🎵 ${esc(c.tema)}</b>${c.artista ? ' · ' + esc(c.artista) : ''}${c.veces > 1 ? ` <span class="pill si">×${c.veces}</span>` : ''}</p>
        <small class="suave">${esc(c.quienes.join(', '))}</small></div>`).join('')
      : '<p class="vacio-tabla">Todavía no pidieron canciones.</p>';
  }
  $('#btnExportarPlaylist').addEventListener('click', () => S60.descargarArchivo(csv(playlist(), [
    { titulo: 'Tema', valor: c => c.tema }, { titulo: 'Artista', valor: c => c.artista }, { titulo: 'Pedidos', valor: c => c.veces }, { titulo: 'Quién la pidió', valor: c => c.quienes.join(', ') }
  ]), `playlist-silvia60-${hoy()}.csv`));

  /* ====================== MENSAJES ====================== */
  function pintarMensajes() {
    const m = rsvps.filter(r => r.mensaje);
    $('#listaMensajes').innerHTML = m.length ? m.map(r => `<div class="mensaje-card"><p>“${esc(r.mensaje)}”</p><small>— ${esc(nombreRsvp(r))}</small>${r.mostrar_mensaje ? '' : ' <small class="suave">(no se muestra en pantalla)</small>'}</div>`).join('')
      : '<p class="suave">Todavía no hay mensajes.</p>';
  }
  $('#btnExportarMensajes').addEventListener('click', () => S60.descargarArchivo(csv(rsvps.filter(r => r.mensaje), [
    { titulo: 'De', valor: nombreRsvp }, { titulo: 'Mensaje', valor: r => r.mensaje }, { titulo: '¿En pantalla?', valor: r => r.mostrar_mensaje ? 'Sí' : 'No' }
  ]), `mensajes-silvia60-${hoy()}.csv`));

  /* ====================== FOTOS ====================== */
  let cargandoFotos = null;
  async function cargarFotos() {
    if (cargandoFotos) return cargandoFotos;
    cargandoFotos = (async () => {
      try { fotos = await A.fotos(); } catch (e) { toast(e.message, 'error'); }
      pintarFotos();
    })();
    try { await cargandoFotos; } finally { cargandoFotos = null; }
  }
  function pintarFotos() {
    const bytes = fotos.reduce((a, f) => a + (f.bytes || 0), 0);
    const pct = Math.min(100, bytes / (1024 * 1048576) * 100);
    const cuenta = e => fotos.filter(f => f.estado === e).length;
    $('#uso').innerHTML = `${fotos.length} fotos · ${cuenta('publicada')} publicadas · ${cuenta('oculta')} ocultas · ${cuenta('revision')} en revisión · ${fotos.filter(f => f.favorita).length} ⭐<br>
      Espacio usado: ${(bytes / 1048576).toFixed(1)} MB de 1024 MB (plan gratis)<div class="medidor"><i style="width:${pct}%"></i></div>`;
    const lista = fotos.filter(f => filtroFotos === 'todas' || (filtroFotos === 'favorita' ? f.favorita : f.estado === filtroFotos));
    if (!lista.length) { $('#galeria').innerHTML = '<p class="suave">No hay fotos acá.</p>'; return; }
    const etq = { publicada: '<span class="pill si">Publicada</span>', oculta: '<span class="pill sin">Oculta</span>', revision: '<span class="pill no">En revisión</span>' };
    $('#galeria').innerHTML = lista.map(f => {
      const p = f.puntajes && f.estado === 'revision' ? Object.entries(f.puntajes).filter(([k]) => /porn|hentai|sexy|error|prueba/i.test(k)).map(([k, v]) => `${k}: ${typeof v === 'number' ? Math.round(v * 100) + '%' : v}`).join(' · ') : '';
      return `<div class="foto-card ${f.estado}" data-id="${f.id}">
        <div class="foto-img"><img loading="lazy" src="${esc(f.url || '')}" alt="Foto de ${esc(f.autor)}"><span class="etq">${etq[f.estado]}</span>${f.favorita ? '<span class="estrella">⭐</span>' : ''}</div>
        <div class="foto-info"><p><b>📸 ${esc(f.autor)}</b> <small class="suave">${S60.formatoHora(f.creado)}</small></p>${f.leyenda ? `<p><i>“${esc(f.leyenda)}”</i></p>` : ''}${p ? `<p class="chico" style="color:var(--error)">${esc(p)}</p>` : ''}</div>
        <div class="foto-botones">
          ${f.estado === 'publicada' ? '<button class="btn" data-a="ocultar">Ocultar</button>' : f.estado === 'oculta' ? '<button class="btn" data-a="mostrar">Mostrar</button>' : '<button class="btn" data-a="aprobar">Aprobar</button>'}
          <button class="btn" data-a="favorita" aria-label="Favorita">${f.favorita ? '★' : '☆'}</button>
          <button class="btn" data-a="bajar" aria-label="Descargar">⬇</button>
        </div></div>`;
    }).join('');
  }
  $('#filtrosFotos').addEventListener('click', e => {
    const b = e.target.closest('button[data-f]'); if (!b) return;
    filtroFotos = b.dataset.f;
    $$('#filtrosFotos button').forEach(x => x.classList.toggle('activo', x === b));
    pintarFotos();
  });
  $('#galeria').addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const f = fotos.find(x => x.id === b.closest('.foto-card').dataset.id);
    const a = b.dataset.a;
    await conBoton(b, async () => {
      if (a === 'ocultar') { await A.actualizarFoto(f.id, { estado: 'oculta' }); f.estado = 'oculta'; toast('Foto oculta: ya no se ve en la pantalla'); }
      else if (a === 'mostrar') { await A.actualizarFoto(f.id, { estado: 'publicada' }); f.estado = 'publicada'; }
      else if (a === 'aprobar') { if (!confirm('¿Seguro que esta foto se puede mostrar en la pantalla?')) return; await A.actualizarFoto(f.id, { estado: 'publicada' }); await cargarFotos(); return; }
      else if (a === 'favorita') { await A.actualizarFoto(f.id, { favorita: !f.favorita }); f.favorita = !f.favorita; }
      else if (a === 'bajar') { const r = await fetch(f.urlOriginal || f.url); S60.descargarArchivo(await r.blob(), nombreArchivo(f, fotos.indexOf(f))); return; }
      pintarFotos();
    });
  });
  function nombreArchivo(f, i) {
    const ext = ((f.urlOriginal ? f.ruta_original : f.ruta) || '.jpg').split('.').pop().split('?')[0] || 'jpg';
    const n = String(fotos.length - i).padStart(3, '0');
    return `${n}_${S60.slugificar(f.autor) || 'invitado'}.${ext}`;
  }
  async function descargarZip(lista, nombre, btn) {
    if (!lista.length) { toast('No hay fotos para descargar'); return; }
    await conBoton(btn, async () => {
      if (!window.JSZip) await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = JSZIP; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
      // Partimos en ZIPs de ~400 MB para que el navegador no se quede sin memoria
      const LIMITE = 400 * 1048576;
      const partes = [[]]; let acum = 0;
      lista.forEach(f => { const b = f.bytes || 500000; if (acum + b > LIMITE && partes[partes.length - 1].length) { partes.push([]); acum = 0; } partes[partes.length - 1].push(f); acum += b; });
      let hechas = 0;
      for (let p = 0; p < partes.length; p++) {
        const zip = new JSZip();
        for (const f of partes[p]) {
          $('#zipProgreso').textContent = `Preparando ZIP… ${++hechas} de ${lista.length} fotos${partes.length > 1 ? ` (parte ${p + 1} de ${partes.length})` : ''}`;
          try {
            let r = await fetch(f.urlOriginal || f.url);
            if (!r.ok && f.urlOriginal) r = await fetch(f.url);
            zip.file(nombreArchivo(f, fotos.indexOf(f)), await r.blob());
          } catch (e) { console.warn('No se pudo bajar', f.id, e); }
        }
        $('#zipProgreso').textContent = 'Armando el archivo…';
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        S60.descargarArchivo(blob, `${nombre}-${hoy()}${partes.length > 1 ? '-parte' + (p + 1) : ''}.zip`);
      }
      $('#zipProgreso').textContent = `Listo: ${hechas} ${hechas === 1 ? 'foto descargada' : 'fotos descargadas'} ✔`;
    });
  }
  $('#btnZipTodas').addEventListener('click', async e => { const b = e.currentTarget; await cargarFotos(); descargarZip(fotos.filter(f => f.estado !== 'revision'), 'fotos-silvia60', b); });
  $('#btnZipFavoritas').addEventListener('click', async e => { const b = e.currentTarget; await cargarFotos(); descargarZip(fotos.filter(f => f.favorita), 'favoritas-silvia60', b); });

  /* ====================== TRIVIA ====================== */
  async function cargarPreguntas() {
    try { preguntas = await A.preguntas(); } catch (e) { toast(e.message, 'error'); }
    const imgs = await Promise.all(preguntas.map(p => Datos.resolverImagen(p.imagen)));
    $('#listaPreguntas').innerHTML = preguntas.length ? preguntas.map((p, i) => `
      <div class="pregunta-card ${p.activa ? '' : 'inactiva'}" data-id="${p.id}">
        <span class="num-p">${i + 1}</span>
        <div class="cuerpo"><span class="tipo-chip">${p.tipo === 'vf' ? '✅❌ Verdadero o Falso' : '🔢 Opción múltiple'}</span>
          <p>${esc(p.texto)}${p.activa ? '' : ' <small class="suave">(no se juega)</small>'}</p>
          ${p.tipo === 'vf'
            ? `<ul><li class="ok">${p.correcta ? '❌ FALSO' : '✅ VERDADERO'} ✔</li></ul>`
            : `<ul>${p.opciones.map((o, j) => `<li class="${j === p.correcta ? 'ok' : ''}">${esc(o)}${j === p.correcta ? ' ✔' : ''}</li>`).join('')}</ul>`}
          ${p.dato ? `<p class="dato-p">💡 ${esc(p.dato)}</p>` : ''}</div>
        ${imgs[i] ? `<img src="${esc(imgs[i])}" alt="">` : ''}
        <div class="acciones-p">
          <button class="btn" data-a="subir" type="button" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn" data-a="bajar" type="button" aria-label="Bajar" ${i === preguntas.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="btn btn-editar" data-a="editar" type="button">✏️ Editar</button>
          <button class="btn btn-peligro" data-a="borrar" type="button" aria-label="Borrar pregunta">🗑</button>
        </div>
      </div>`).join('') : '<p class="suave">No hay preguntas. Agregá entre 10 y 15.</p>';
    pintarEstadoTrivia();
  }
  let imagenPregunta = null;
  function abrirPregunta(p) {
    const f = $('#formPregunta');
    f.reset();
    f.id.value = p ? p.id : '';
    f.texto.value = p ? p.texto : '';
    const vf = p && p.tipo === 'vf';
    f.querySelector(`[name=tipo][value="${vf ? 'vf' : 'multiple'}"]`).checked = true;
    [0, 1, 2, 3].forEach(i => { f['op' + i].value = p && !vf ? p.opciones[i] || '' : ''; });
    if (p && !vf) f.querySelector(`[name=correcta][value="${p.correcta}"]`).checked = true;
    if (vf) f.querySelector(`[name=vf][value="${p.correcta}"]`).checked = true;
    f.dato.value = p ? p.dato || '' : '';
    mostrarTipo();
    $('#tituloPregunta').textContent = p ? 'Editar pregunta' : 'Nueva pregunta';
    f.orden.value = p ? p.orden : (preguntas.reduce((m, x) => Math.max(m, x.orden), 0) + 1);
    f.activa.checked = p ? p.activa : true;
    imagenPregunta = p ? p.imagen : null;
    mostrarImagenPregunta();
    $('#errorPregunta').textContent = '';
    $('#modalPregunta').classList.remove('oculto');
    f.texto.focus();
  }
  async function mostrarImagenPregunta() {
    $('#imagenActual').classList.toggle('oculto', !imagenPregunta);
    if (imagenPregunta) $('#imagenActual img').src = await Datos.resolverImagen(imagenPregunta);
  }
  $('#btnQuitarImagen').addEventListener('click', () => { imagenPregunta = null; mostrarImagenPregunta(); });
  $('#btnNuevaPregunta').addEventListener('click', () => abrirPregunta(null));
  $('#btnCancelarPregunta').addEventListener('click', () => $('#modalPregunta').classList.add('oculto'));
  $('#listaPreguntas').addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const p = preguntas.find(x => x.id === b.closest('.pregunta-card').dataset.id);
    if (b.dataset.a === 'editar') abrirPregunta(p);
    else if (b.dataset.a === 'subir' || b.dataset.a === 'bajar') await conBoton(b, () => moverPregunta(p, b.dataset.a === 'subir' ? -1 : 1));
    else if (confirm(`¿Borrar esta pregunta?\n\n«${p.texto}»\n\nNo se puede deshacer.`)) await conBoton(b, async () => { await A.borrarPregunta(p.id); toast('Pregunta borrada'); await cargarPreguntas(); });
  });
  // ▲ ▼: intercambia con la de al lado y renumera 1, 2, 3… (solo guarda las que cambiaron)
  async function moverPregunta(p, paso) {
    const lista = preguntas.slice();
    const i = lista.indexOf(p), j = i + paso;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    const cambios = lista.map((q, k) => ({ q, orden: k + 1 })).filter(x => x.q.orden !== x.orden);
    for (const { q, orden } of cambios) await A.guardarPregunta(Object.assign({}, q, { orden }));
    await cargarPreguntas();
    const card = $(`#listaPreguntas [data-id="${p.id}"]`);
    if (card) { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); card.classList.add('recien'); setTimeout(() => card.classList.remove('recien'), 1200); }
  }
  // Muestra las opciones o los botones Verdadero / Falso según el tipo
  function mostrarTipo() {
    const vf = $('#formPregunta').querySelector('[name=tipo]:checked').value === 'vf';
    $('#bloqueMultiple').classList.toggle('oculto', vf);
    $('#bloqueVF').classList.toggle('oculto', !vf);
  }
  $('#formPregunta').addEventListener('change', e => { if (e.target.name === 'tipo') { mostrarTipo(); $('#errorPregunta').textContent = ''; } });
  $('#formPregunta').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const tipo = f.querySelector('[name=tipo]:checked').value;
    let opciones, correctaIdx;
    if (tipo === 'vf') {
      const r = f.querySelector('[name=vf]:checked');
      if (!r) { $('#errorPregunta').textContent = 'Marcá si es VERDADERO o FALSO'; return; }
      opciones = ['Verdadero', 'Falso']; correctaIdx = +r.value;
    } else {
      // Se usan las opciones escritas (2 a 4), en orden; la marcada tiene que estar escrita
      const escritas = [0, 1, 2, 3].map(i => ({ i, t: f['op' + i].value.trim() })).filter(o => o.t);
      if (escritas.length < 2) { $('#errorPregunta').textContent = 'Escribí al menos 2 opciones'; return; }
      const r = f.querySelector('[name=correcta]:checked');
      const pos = r ? escritas.findIndex(o => o.i === +r.value) : -1;
      if (pos < 0) { $('#errorPregunta').textContent = r ? 'La opción marcada como correcta está vacía' : 'Marcá cuál es la opción correcta'; return; }
      opciones = escritas.map(o => o.t); correctaIdx = pos;
    }
    const btn = f.querySelector('[type=submit]');
    await conBoton(btn, async () => {
      if (f.imagen.files[0]) {
        const bm = await S60.cargarImagen(f.imagen.files[0]);
        const { blob } = await S60.comprimir(bm, 1200, .82);
        imagenPregunta = await A.subirImagenTrivia(blob);
      }
      await A.guardarPregunta({
        id: f.id.value || null, tipo, texto: f.texto.value.trim(), opciones, correcta: correctaIdx, dato: f.dato.value.trim() || null,
        orden: parseInt(f.orden.value, 10) || 1, imagen: imagenPregunta, activa: f.activa.checked
      });
      $('#modalPregunta').classList.add('oculto');
      toast('Pregunta guardada ✔');
      await cargarPreguntas();
    });
  });

  async function cargarEstados() {
    try { triviaEstado = await Datos.trivia.estado(); } catch (e) {}
    try { pantallaEstado = await Datos.pantalla(); } catch (e) {}
    pintarEstadoTrivia(); pintarPantalla(); pintarVideos(); pintarEnVivo();
    const r = pantallaEstado.reproduccion;
    if (r && r.tipo === 'anim' && r.id === 'fiesta') cuentaBoom(r);   // si el panel se abre justo durante la alerta
  }
  async function pintarEstadoTrivia() {
    const e = triviaEstado;
    const fases = { apagada: 'Trivia apagada', lobby: 'Esperando jugadores (QR en pantalla)', pregunta: `Pregunta ${e.pregunta_num} de ${e.total} en curso`, resultado: `Mostrando respuesta de la pregunta ${e.pregunta_num}`, ranking: 'Mostrando ranking', podio: 'Juego terminado: podio en pantalla' };
    let txt = fases[e.fase] || '';
    if (e.fase === 'pregunta' && e.inicio && Date.now() > new Date(e.inicio).getTime() + e.duracion * 1000) txt = `Pregunta ${e.pregunta_num} de ${e.total}: tiempo terminado, mostrando respuesta`;
    if (e.fase && e.fase !== 'apagada') { try { txt += ` · ${await Datos.trivia.cantidadJugadores()} jugadores`; } catch (x) {} }
    $('#estadoTrivia').textContent = txt;
    const sig = $('[data-accion=siguiente]');
    if (sig) sig.textContent = e.fase === 'lobby' ? '⏭ Primera pregunta' : (e.pregunta_num >= e.total && e.fase !== 'apagada' ? '🏆 Ir al podio' : '⏭ Siguiente pregunta');
  }
  $('#tab-trivia').addEventListener('click', async e => {
    const b = e.target.closest('button[data-accion]'); if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'abrir' && triviaEstado.fase && triviaEstado.fase !== 'apagada' && !confirm('Ya hay una trivia abierta. ¿Empezar una nueva desde cero?')) return;
    if (accion === 'abrir' && !preguntas.some(p => p.activa)) { toast('Primero cargá al menos una pregunta', 'error'); return; }
    await conBoton(b, async () => {
      const e2 = await A.controlTrivia(accion);
      if (e2) triviaEstado = Object.assign(triviaEstado, e2);
      pintarEstadoTrivia();
    });
  });

  /* ====================== PANTALLA ====================== */
  function pintarPantalla() {
    const p = pantallaEstado;
    const prueba = !!p.modo_prueba;
    $('#btnModoPrueba').textContent = prueba ? '🧪 Apagar modo prueba' : '🧪 Prender modo prueba';
    $('#btnModoPrueba').classList.toggle('activo', prueba);
    $('#estadoPrueba').textContent = prueba ? '🧪 MODO PRUEBA PRENDIDO: /fotos está habilitado' : 'Modo prueba apagado';
    $('.tarjeta-prueba').classList.toggle('activo', prueba);
    let banner = $('#bannerPrueba');
    if (prueba && !banner) { banner = document.createElement('div'); banner.id = 'bannerPrueba'; banner.className = 'banner-prueba'; banner.textContent = '🧪 Modo prueba prendido · acordate de apagarlo y de borrar los datos de prueba antes de mandar las invitaciones'; $('.barra-sup').after(banner); }
    if (!prueba && banner) banner.remove();
    $('#btnPausa').textContent = p.muro_pausado ? '▶ Reanudar muro' : '⏸ Pausar muro';
    // lo que se ve en el salón lo dice la línea "En el salón ahora" (pintarEnVivo); acá solo avisos extra
    $('#estadoPantalla').textContent = p.muro_pausado && p.modo !== 'trivia' ? '⏸ El muro está en pausa' : '';
  }
  $('#btnPausa').addEventListener('click', e => conBoton(e.currentTarget, async () => {
    await A.actualizarPantalla({ muro_pausado: !pantallaEstado.muro_pausado });
    pantallaEstado.muro_pausado = !pantallaEstado.muro_pausado; pintarPantalla();
  }));
  $('#btnIrTrivia').addEventListener('click', () => abrirTab('trivia'));
  // Control remoto: sacar de la pantalla la última foto publicada (sin borrarla)
  $('#btnOcultarUltima').addEventListener('click', e => conBoton(e.currentTarget, async () => {
    await cargarFotos();
    const ultima = fotos.filter(f => f.estado === 'publicada').sort((a, b) => new Date(b.creado) - new Date(a.creado))[0];
    if (!ultima) { toast('No hay fotos publicadas'); return; }
    $('#ultimaFotoInfo').innerHTML = `<img src="${esc(ultima.url || '')}" alt=""><span>📸 ${esc(ultima.autor)} · ${S60.formatoHora(ultima.creado)} h${ultima.leyenda ? '<br><i>“' + esc(ultima.leyenda) + '”</i>' : ''}</span>`;
    if (!confirm(`¿Ocultar la última foto (de ${ultima.autor})? No se borra: la podés volver a mostrar desde Fotos.`)) return;
    await A.actualizarFoto(ultima.id, { estado: 'oculta' });
    ultima.estado = 'oculta';
    $('#ultimaFotoInfo').insertAdjacentHTML('beforeend', '<b class="ok-txt">Oculta ✔</b>');
    toast('Foto oculta de la pantalla ✔');
  }));
  $('#btnModoPrueba').addEventListener('click', e => conBoton(e.currentTarget, async () => {
    const nuevo = !pantallaEstado.modo_prueba;
    await A.actualizarPantalla({ modo_prueba: nuevo });
    pantallaEstado.modo_prueba = nuevo; pintarPantalla();
    toast(nuevo ? 'Modo prueba prendido: /fotos habilitado' : 'Modo prueba apagado');
  }));
  // Doble confirmación: un aviso y después escribir BORRAR
  $('#btnBorrarPrueba').addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!confirm('¿Borrar TODAS las confirmaciones, TODAS las fotos y los jugadores de la trivia?\n\nLa lista de invitados y las preguntas NO se tocan. Esto no se puede deshacer.')) return;
    const r = prompt('Para confirmar, escribí BORRAR (en mayúsculas):');
    if (r !== 'BORRAR') { toast('No se borró nada'); return; }
    conBoton(btn, async () => {
      $('#borrarProgreso').textContent = 'Borrando…';
      const res = await A.borrarDatosPrueba(t => { $('#borrarProgreso').textContent = t; });
      $('#borrarProgreso').textContent = `Listo ✔ Se borraron ${res.rsvps} confirmaciones, ${res.fotos} fotos (${res.archivos} archivos) y ${res.jugadores} jugadores de la trivia.`;
      toast('Datos de prueba borrados ✔');
      await Promise.all([cargarRsvps(), cargarEstados()]);
      fotos = [];
    });
  });
  $('#btnMostrarMensaje').addEventListener('click', e => conBoton(e.currentTarget, async () => {
    const m = $('#mensajeManual').value.trim();
    if (!m) { toast('Escribí el mensaje'); return; }
    await A.actualizarPantalla({ mensaje_manual: m, mensaje_ts: new Date().toISOString() });
    pantallaEstado.mensaje_manual = m; pintarPantalla(); toast('Mensaje en pantalla ✔');
  }));
  $('#btnQuitarMensaje').addEventListener('click', e => conBoton(e.currentTarget, async () => {
    await A.actualizarPantalla({ mensaje_manual: '' });
    pantallaEstado.mensaje_manual = ''; pintarPantalla();
  }));

  /* ====================== EVENTO (fecha y hora) ====================== */
  // Partes de una fecha en hora de San Juan, para cargar los <input type=date/time>
  function partesSJ(iso) {
    const p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/San_Juan', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso)).forEach(x => { p[x.type] = x.value; });
    return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
  }
  function vistaEvento() {
    $('#vistaEvento').innerHTML = `<p class="chico suave">Así se ve en la invitación:</p>
      <p class="pill-vista"><span class="nw">${esc(C.fechaCorta)}</span> · <span class="nw">${esc(C.horaTexto)}</span> · <span class="nw">¡Sé puntual!</span></p>
      <p>📅 <span class="nw">${esc(C.fechaTexto)}</span> · <span class="nw">${esc(C.horaTexto)}</span><br>⏰ ${esc(C.textoPuntual)}<br>✉️ Confirmar hasta el ${esc(C.fechaLimiteTexto)}<br>📸 /fotos se habilita desde las ${S60.formatoHora(new Date(C.fotosDesde))} h</p>`;
  }
  async function pintarEvento() {
    await S60.cargarEvento();
    const f = $('#formEvento'), ev = partesSJ(C.fechaEvento);
    f.fecha.value = ev.fecha; f.hora.value = ev.hora;
    f.puntual.value = C.textoPuntual || '';
    f.limite.value = partesSJ(C.fechaLimiteRsvp).fecha;
    $('#errorEvento').textContent = '';
    vistaEvento();
  }
  $('#formEvento').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    $('#errorEvento').textContent = '';
    if (!f.fecha.value || !f.hora.value || !f.limite.value) { $('#errorEvento').textContent = 'Completá la fecha, la hora y el límite para confirmar'; return; }
    const cambios = {
      fecha_evento: `${f.fecha.value}T${f.hora.value}:00-03:00`,
      fecha_limite_rsvp: `${f.limite.value}T23:59:59-03:00`,
      texto_puntual: f.puntual.value.trim() || '¡Por favor, sé puntual!'
    };
    if (new Date(cambios.fecha_limite_rsvp) > new Date(cambios.fecha_evento)) { $('#errorEvento').textContent = 'El límite para confirmar tiene que ser antes de la fiesta'; return; }
    await conBoton($('#btnGuardarEvento'), async () => {
      await A.guardarEvento(cambios);
      S60.aplicarEvento(cambios);
      vistaEvento();
      toast('Fecha y hora guardadas ✔ Ya se ven en la invitación');
    });
  });

  /* ====================== ITINERARIO ====================== */
  // Cada momento guarda su duración: la hora de inicio se calcula en cadena desde la hora del evento.
  // Los de hora fija no se mueven y la cadena sigue desde ellos.
  const MIN = 60000;
  let iti = { items: [], config: null, error: null };
  const hhmm = ms => S60.formatoHora(ms);
  const durTexto = m => { m = Math.round(Math.abs(m)); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; };
  // "01:00" → la primera vez que el reloj marca esa hora desde el inicio (de madrugada = el día siguiente)
  function horaFijaMs(hora, inicio) {
    const [h, m] = hora.split(':').map(Number);
    const SJ = 3 * 3600e3;                                     // San Juan: UTC-3 todo el año
    let t = Math.floor((inicio - SJ) / 864e5) * 864e5 + SJ + (h * 60 + m) * MIN;
    if (t < inicio - 3 * 3600e3) t += 864e5;
    return t;
  }
  function calcularItinerario() {
    const inicio = new Date(C.fechaEvento).getTime();
    let t = inicio;
    const filas = iti.items.map((it, i) => {
      let ini = t, dif = null;
      if (it.hora_fija) { const f = horaFijaMs(it.hora_fija, inicio); if (i > 0) dif = Math.round((f - t) / MIN); ini = f; }
      const fin = ini + it.duracion * MIN;
      t = fin;
      return { it, ini, fin, dif };
    });
    const cfg = iti.config || {};
    const fIni = inicio + (cfg.fotografa_desde || 0) * MIN, fFin = fIni + (+cfg.fotografa_horas || 0) * 60 * MIN;
    return { inicio, fin: t, filas, fIni, fFin };
  }
  // Para probar el modo "Ahora / Próximo": panel/?simular=2026-12-05T22:10
  const simular = new URLSearchParams(location.search).get('simular');
  const desfaseSim = simular ? new Date(simular.length <= 16 ? simular + ':00-03:00' : simular).getTime() - Date.now() : 0;
  const ahoraIti = () => Date.now() + (desfaseSim || 0);

  async function cargarItinerario() {
    try {
      await S60.cargarEvento();
      iti = Object.assign(iti, await A.itinerario(), { error: null });
    } catch (e) { iti.error = e; }
    pintarItinerario();
  }
  const textoBoton = b => !b ? '' : b === 'entrada' ? '▶ Entrada de Silvia' : b === 'trivia' ? '🎯 Abrir trivia' : b === 'fiesta' ? '🚨 ▶ Alerta' : '▶ ' + tituloVideo(b.slice(6));

  function pintarItinerario() {
    const falta = iti.error;
    if (!falta && !iti.config) return;   // todavía cargando
    $('#itiAviso').classList.toggle('oculto', !falta);
    $('#itiCuerpo').classList.toggle('oculto', !!falta);
    $('#btnCopiarItinerario').disabled = !!falta;
    if (falta) { $('#itiAviso').innerHTML = `⚠️ ${esc(falta.faltaSql ? 'El itinerario todavía no está en la base: falta correr supabase/actualizacion-4.sql en Supabase (SQL Editor → Run).' : falta.message)}`; return; }
    const { inicio, fin, filas, fIni, fFin } = calcularItinerario();
    const cfg = iti.config;
    const total = Math.round((fin - inicio) / MIN), contratado = Math.round(cfg.duracion_horas * 60), dif = total - contratado;
    const finContratado = inicio + contratado * MIN;
    $('#itiHoras').innerHTML = `Inicio <b>${hhmm(inicio)}</b> · Fin <b>${hhmm(fin)}</b> · Total <b>${durTexto(total)}</b>`;
    const af = $('#itiAvisoFin');
    af.className = 'iti-aviso-fin ' + (dif === 0 ? 'ok' : dif > 0 ? 'mal' : 'sobra');
    af.textContent = dif === 0 ? `✔ Coincide con lo contratado (${durTexto(contratado)}, hasta las ${hhmm(finContratado)})`
      : dif > 0 ? `⚠️ Se pasa ${durTexto(dif)} de lo contratado: el salón es hasta las ${hhmm(finContratado)}`
      : `⏳ Sobran ${durTexto(-dif)} de lo contratado: el salón es hasta las ${hhmm(finContratado)}`;
    if (document.activeElement !== $('#itiContratada')) $('#itiContratada').value = +cfg.duracion_horas;
    if (document.activeElement !== $('#itiFotoDesde')) $('#itiFotoDesde').value = hhmm(fIni);
    if (document.activeElement !== $('#itiFotoHoras')) $('#itiFotoHoras').value = +cfg.fotografa_horas;

    // Fotógrafa: qué momentos cubre (franja dorada sobre la línea de tiempo)
    const cubre = f => f.fin > fIni && f.ini < fFin && fFin > fIni;
    const parcial = f => cubre(f) && (f.ini < fIni || f.fin > fFin);
    const cubiertos = filas.filter(f => cubre(f) && f.it.duracion > 0);
    const span = Math.max(1, fin - inicio), pct = t => Math.max(0, Math.min(100, (t - inicio) / span * 100));
    $('#itiBarra').innerHTML = filas.filter(f => f.it.duracion > 0).map((f, i) => `<i class="${i % 2 ? 'par' : ''}" style="left:${pct(f.ini)}%;width:${pct(f.fin) - pct(f.ini)}%" title="${esc(f.it.titulo)}">${esc(f.it.emoji)}</i>`).join('')
      + (fFin > fIni ? `<b class="franja" style="left:${pct(fIni)}%;width:${pct(fFin) - pct(fIni)}%"></b>` : '')
      + `<span class="iti-barra-ini">${hhmm(inicio)}</span><span class="iti-barra-fin">${hhmm(fin)}</span>`;
    $('#itiFotoCubre').innerHTML = fFin > fIni
      ? `De <b>${hhmm(fIni)}</b> a <b>${hhmm(fFin)}</b> · cubre: ${cubiertos.length ? cubiertos.map(f => esc(f.it.emoji + ' ' + f.it.titulo) + (parcial(f) ? ' <small>(en parte)</small>' : '')).join(', ') : 'ningún momento'}`
      : 'Sin fotógrafa cargada';

    // Día del evento: AHORA y PRÓXIMO
    const ahora = ahoraIti();
    const enRango = ahora >= inicio - 3 * 3600e3 && ahora <= fin + 3600e3;
    const actual = enRango ? filas.find(f => f.ini <= ahora && ahora < f.fin && f.it.duracion > 0) : null;
    const proximo = enRango ? filas.find(f => f.ini > ahora) : null;
    const caja = $('#itiAhora');
    caja.classList.toggle('oculto', !enRango);
    if (enRango) {
      const enMin = t => { const m = Math.max(1, Math.round((t - ahora) / MIN)); return m >= 60 ? durTexto(m) : m + ' min'; };
      caja.innerHTML = (simular ? '<span class="chip-sim">🧪 Simulando ' + hhmm(ahora) + '</span>' : '')
        + (ahora < inicio ? `<p>⏰ La fiesta empieza en <b>${enMin(inicio)}</b></p>` : '')
        + (actual ? `<p class="ya"><span class="chip-ahora">AHORA</span> ${esc(actual.it.emoji + ' ' + actual.it.titulo)} <small>hasta las ${hhmm(actual.fin)}</small></p>` : '')
        + (proximo ? `<p class="prox"><span class="chip-prox">PRÓXIMO</span> en <b>${enMin(proximo.ini)}</b>: ${esc(proximo.it.titulo + ' ' + proximo.it.emoji)}</p>` : (ahora >= fin ? '<p>🎉 ¡Terminó el itinerario!</p>' : ''));
    }

    $('#itiLista').innerHTML = filas.map((f, i) => {
      const it = f.it, foto = cubre(f) && it.duracion > 0;
      const aviso = f.dif == null || f.dif === 0 ? ''
        : f.dif > 0 ? `<p class="iti-hueco sobra">⏳ Sobran ${durTexto(f.dif)} antes de ${esc(it.titulo)}</p>`
        : `<p class="iti-hueco falta">⚠️ Faltan ${durTexto(-f.dif)}: acortá algo antes de ${esc(it.titulo)}</p>`;
      const clases = ['momento', it.hecho ? 'hecho' : '', actual === f ? 'ahora' : '', proximo === f ? 'proximo' : '', it.hora_fija ? 'fija' : ''].join(' ');
      return aviso + `<article class="${clases}" data-id="${it.id}">
        <div class="mom-cab">
          <div class="mom-hora"><b>${hhmm(f.ini)}</b><small>${hhmm(f.fin)}</small></div>
          <div class="mom-tit">
            <h4><span class="mom-emoji">${esc(it.emoji)}</span> <span class="mom-nombre">${esc(it.titulo)}</span></h4>
            <p class="mom-meta">${actual === f ? '<span class="chip-ahora">AHORA</span> ' : ''}${it.hora_fija ? '<span class="chip-fija">📌 fija ' + esc(it.hora_fija) + '</span> ' : ''}${foto ? '<span title="La fotógrafa está">📷</span>' : ''}</p>
          </div>
          <label class="mom-hecho" title="Hecho"><input type="checkbox" data-a="hecho" ${it.hecho ? 'checked' : ''} aria-label="Hecho: ${esc(it.titulo)}"><span>✔</span></label>
        </div>
        ${it.responsable || it.notas ? `<p class="mom-notas">${it.responsable ? '<b>👤 ' + esc(it.responsable) + '</b> ' : ''}${it.notas ? esc(it.notas) : ''}</p>` : ''}
        ${it.boton ? `<button class="btn btn-oro mom-rapido" data-a="rapido" type="button">${esc(textoBoton(it.boton))}</button>` : ''}
        <div class="mom-acciones">
          <div class="stepper"><button class="btn" data-a="menos" type="button" aria-label="5 minutos menos">−5</button><span>${it.duracion} min</span><button class="btn" data-a="mas" type="button" aria-label="5 minutos más">+5</button></div>
          <button class="btn" data-a="subir" type="button" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn" data-a="bajar" type="button" aria-label="Bajar" ${i === filas.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="btn" data-a="editar" type="button" aria-label="Editar">✏️</button>
        </div>
      </article>`;
    }).join('') || '<p class="vacio-tabla">Todavía no hay momentos. Tocá «+ Agregar momento».</p>';
  }

  // Guardado: lo de la pantalla cambia al instante; a la base va un ratito después (si tocan +5 varias veces, un solo guardado)
  // Los guardados van en fila, de a uno: si tocan ▲ varias veces seguidas, la base queda en el último orden
  let cola = Promise.resolve();
  const enCola = fn => (cola = cola.then(fn).catch(e => toast(e.message, 'error', 5000)));
  const pendientes = new Map();
  function guardarLuego(it, ms = 700) {
    clearTimeout(pendientes.get(it.id));
    pendientes.set(it.id, setTimeout(() => { pendientes.delete(it.id); enCola(() => A.guardarItem(it)); }, ms));
  }
  let tCfg = null;
  function guardarConfigLuego() {
    clearTimeout(tCfg);
    tCfg = setTimeout(async () => { try { await A.guardarItinerarioConfig(iti.config); } catch (e) { toast(e.message, 'error', 5000); } }, 700);
  }
  $('#itiContratada').addEventListener('input', e => { const v = parseFloat(e.target.value); if (v >= 1 && v <= 14) { iti.config.duracion_horas = v; pintarItinerario(); guardarConfigLuego(); } });
  $('#itiFotoHoras').addEventListener('input', e => { const v = parseFloat(e.target.value); if (v >= 0 && v <= 14) { iti.config.fotografa_horas = v; pintarItinerario(); guardarConfigLuego(); } });
  $('#itiFotoDesde').addEventListener('change', e => {
    if (!e.target.value) return;
    const inicio = new Date(C.fechaEvento).getTime();
    iti.config.fotografa_desde = Math.round((horaFijaMs(e.target.value, inicio) - inicio) / MIN);
    pintarItinerario(); guardarConfigLuego();
  });

  $('#itiLista').addEventListener('change', e => {
    if (e.target.dataset.a !== 'hecho') return;
    const it = iti.items.find(x => x.id === e.target.closest('.momento').dataset.id);
    it.hecho = e.target.checked;
    pintarItinerario(); guardarLuego(it, 0);
  });
  $('#itiLista').addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const it = iti.items.find(x => x.id === b.closest('.momento').dataset.id);
    const a = b.dataset.a;
    if (a === 'menos' || a === 'mas') {
      it.duracion = Math.max(0, Math.min(600, it.duracion + (a === 'mas' ? 5 : -5)));
      pintarItinerario(); guardarLuego(it);
    } else if (a === 'subir' || a === 'bajar') {
      const i = iti.items.indexOf(it), j = i + (a === 'subir' ? -1 : 1);
      if (j < 0 || j >= iti.items.length) return;
      [iti.items[i], iti.items[j]] = [iti.items[j], iti.items[i]];
      const cambiados = iti.items.filter((x, k) => x.orden !== k + 1);
      iti.items.forEach((x, k) => { x.orden = k + 1; });
      pintarItinerario();
      const card = $(`#itiLista [data-id="${it.id}"]`);
      if (card) { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); card.classList.add('recien'); setTimeout(() => card.classList.remove('recien'), 1200); }
      const copias = cambiados.map(x => Object.assign({}, x));
      enCola(async () => { for (const x of copias) await A.guardarItem(x); });
    } else if (a === 'editar') abrirMomento(it);
    else if (a === 'rapido') accionRapida(it.boton, b);
  });

  // Botones rápidos de las tarjetas (siempre con confirmación: un toque sin querer no dispara nada en el salón)
  async function accionRapida(boton, btn) {
    if (boton === 'trivia') {
      if (!confirm('¿Abrir la trivia? La pantalla muestra el QR para sumarse.')) return;
      if (triviaEstado.fase && triviaEstado.fase !== 'apagada') { abrirTab('trivia'); toast('La trivia ya está abierta'); return; }
      await conBoton(btn, async () => { const e2 = await A.controlTrivia('abrir'); if (e2) triviaEstado = Object.assign(triviaEstado, e2); pintarEstadoTrivia(); abrirTab('trivia'); });
    } else if (boton === 'entrada' || boton === 'fiesta') {
      if (!confirm(boton === 'entrada' ? '¿Lanzar la «Entrada de Silvia» en la pantalla?' : '¿Lanzar la ALERTA «¡Arranca la fiesta!»?\n\nEl BOOM es 8 s después de tocar: avisale al DJ.')) return;
      await conBoton(btn, () => reproducir('anim', boton));
    } else if (boton && boton.startsWith('video:')) {
      const id = boton.slice(6);
      if (!confirm(`¿Reproducir «${tituloVideo(id)}» en la pantalla?`)) return;
      await conBoton(btn, () => reproducirVideo(id));
    }
  }

  // Editor de un momento
  function opcionesBoton(actual) {
    const ops = [['', 'Ninguno'], ['entrada', '✨ Entrada de Silvia'], ['fiesta', '🚨 ¡Arranca la fiesta! (alerta)'], ['trivia', '🎯 Abrir trivia']]
      .concat(videos.map(v => ['video:' + v.id, '🎬 Video: ' + v.titulo]));
    if (actual && !ops.some(o => o[0] === actual)) ops.push([actual, actual]);
    return ops.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  }
  function abrirMomento(it) {
    const f = $('#formMomento');
    f.reset();
    f.id.value = it ? it.id : '';
    f.emoji.value = it ? it.emoji : '⭐';
    f.titulo.value = it ? it.titulo : '';
    f.duracion.value = it ? it.duracion : 10;
    f.responsable.value = it ? it.responsable || '' : '';
    f.notas.value = it ? it.notas || '' : '';
    f.fija.checked = !!(it && it.hora_fija);
    f.hora_fija.value = it && it.hora_fija ? it.hora_fija : '';
    f.boton.innerHTML = opcionesBoton(it && it.boton);
    f.boton.value = it && it.boton ? it.boton : '';
    $('#campoHoraFija').classList.toggle('oculto', !f.fija.checked);
    $('#btnBorrarMomento').classList.toggle('oculto', !it);
    $('#tituloMomento').textContent = it ? 'Editar momento' : 'Nuevo momento';
    $('#errorMomento').textContent = '';
    $('#modalMomento').classList.remove('oculto');
    if (!it) f.titulo.focus();
  }
  $('#btnNuevoMomento').addEventListener('click', () => abrirMomento(null));
  $('#btnCancelarMomento').addEventListener('click', () => $('#modalMomento').classList.add('oculto'));
  $('#formMomento').fija.addEventListener('change', e => {
    $('#campoHoraFija').classList.toggle('oculto', !e.target.checked);
    if (e.target.checked && !$('#formMomento').hora_fija.value) {
      const fila = calcularItinerario().filas.find(x => x.it.id === $('#formMomento').id.value);
      $('#formMomento').hora_fija.value = fila ? hhmm(fila.ini) : '01:00';
    }
  });
  $('#formMomento').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (f.fija.checked && !/^\d\d:\d\d$/.test(f.hora_fija.value)) { $('#errorMomento').textContent = 'Poné la hora fija (ej. 01:00)'; return; }
    const viejo = iti.items.find(x => x.id === f.id.value);
    const it = Object.assign({}, viejo || { orden: iti.items.reduce((m, x) => Math.max(m, x.orden), 0) + 1, hecho: false }, {
      emoji: f.emoji.value.trim() || '⭐', titulo: f.titulo.value.trim(), duracion: Math.max(0, Math.min(600, parseInt(f.duracion.value, 10) || 0)),
      responsable: f.responsable.value.trim(), notas: f.notas.value.trim(), hora_fija: f.fija.checked ? f.hora_fija.value : null, boton: f.boton.value || null
    });
    await conBoton(f.querySelector('[type=submit]'), async () => {
      const guardado = await A.guardarItem(it);
      if (viejo) Object.assign(viejo, it); else iti.items.push(Object.assign(it, guardado));
      $('#modalMomento').classList.add('oculto');
      pintarItinerario();
      toast(viejo ? 'Momento guardado ✔' : 'Momento agregado al final ✔ (subilo con ▲)');
    });
  });
  $('#btnBorrarMomento').addEventListener('click', e => {
    const it = iti.items.find(x => x.id === $('#formMomento').id.value);
    if (!it || !confirm(`¿Borrar «${it.titulo}» del itinerario?\n\nLos momentos de después se corren solos.`)) return;
    conBoton(e.currentTarget, async () => {
      await A.borrarItem(it.id);
      iti.items = iti.items.filter(x => x !== it);
      $('#modalMomento').classList.add('oculto');
      pintarItinerario(); toast('Momento borrado');
    });
  });

  // Copiar como texto (para WhatsApp)
  function textoItinerario() {
    const { fin, filas, fIni, fFin } = calcularItinerario();
    const l = [`🕒 *Itinerario · ${C.homenajeada} ${C.edad}*`, `${C.fechaTexto} · ${C.lugar.nombre}`, ''];
    filas.forEach(({ it, ini }) => l.push(`${hhmm(ini)} ${it.emoji} ${it.titulo} (${durTexto(it.duracion)})${it.hora_fija ? ' 📌' : ''}${it.responsable ? ' · 👤 ' + it.responsable : ''}${it.notas ? ' — ' + it.notas : ''}`));
    l.push(`${hhmm(fin)} 🏁 Fin`);
    if (fFin > fIni) l.push('', `📷 Fotógrafa: de ${hhmm(fIni)} a ${hhmm(fFin)}`);
    return l.join('\n');
  }
  $('#btnCopiarItinerario').addEventListener('click', async () => {
    const t = textoItinerario();
    try { await navigator.clipboard.writeText(t); toast('Itinerario copiado ✔ Pegalo en WhatsApp'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Itinerario copiado ✔'); } catch (x) { toast('No se pudo copiar', 'error'); }
      ta.remove();
    }
  });

  /* ====================== VIDEOS Y ANIMACIONES (control remoto de la pantalla) ====================== */
  // El panel escribe en pantalla_estado.reproduccion qué mostrar; la notebook avisa en pantalla_estado.informe qué tiene.
  let videos = [], videosError = null;
  const ANIMS = { entrada: { titulo: '✨ Entrada de Silvia' }, fiesta: { titulo: '🚨 ¡Arranca la fiesta!', dura: 20 } };
  const BOOM_SEG = 8;
  const ahoraSrv = () => Date.now() + desfase;
  const tituloVideo = id => (videos.find(v => v.id === id) || { titulo: id === 'homenaje' ? 'Video homenaje' : id }).titulo;
  const informe = () => pantallaEstado.informe || null;
  const mmss = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const mb = b => b >= 1e9 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' GB' : Math.round(b / 1048576) + ' MB';
  function posActual(r) { return r.estado === 'play' ? r.pos + Math.max(0, ahoraSrv() - Date.parse(r.inicio)) / 1000 : r.pos; }
  function infoRep(r) { const i = informe(); return i && i.reproduciendo && r && i.reproduciendo.n === r.n ? i.reproduciendo : null; }
  function repActiva(r) {
    if (!r) return false;
    if (r.tipo === 'anim') return !ANIMS[r.id] || !ANIMS[r.id].dura || ahoraSrv() - Date.parse(r.inicio) < (ANIMS[r.id].dura + 1) * 1000;
    const inf = infoRep(r);
    return !(inf && (inf.estado === 'fin' || inf.estado === 'sin-archivo'));
  }

  async function cargarVideos() {
    try { videos = await Datos.videos(); videosError = null; } catch (e) { videosError = e; }
    pintarVideos();
  }
  async function mandar(r) {
    await A.actualizarPantalla({ reproduccion: r });
    pantallaEstado.reproduccion = r;
    pintarVideos(); pintarEnVivo();
    if (r && r.tipo === 'anim' && r.id === 'fiesta') cuentaBoom(r);
  }
  const reproducir = (tipo, id) => mandar({ tipo, id, estado: 'play', inicio: new Date(ahoraSrv()).toISOString(), pos: 0, n: S60.sufijoAleatorio(8) });
  async function reproducirVideo(id) {
    const v = videos.find(x => x.id === id), inf = informe(), archivo = inf && (inf.videos || []).find(x => x.id === id && x.ok);
    if (!archivo && !(v && v.youtube) && !confirm(`⚠️ La notebook no avisó que tenga «${tituloVideo(id)}» cargado.\n\n¿Mandarlo igual?`)) return;
    await reproducir('video', id);
  }

  function estadoArchivo(v) {
    const inf = informe(), a = inf && (inf.videos || []).find(x => x.id === v.id);
    if (a && a.ok) return `<span class="ok-txt">✅ Cargado en la pantalla</span> <span class="suave">(${mb(a.bytes)} · ${mmss(a.dur)})</span>${v.youtube ? '<br><small class="suave">YouTube de respaldo</small>' : ''}`;
    if (a && !a.ok) return `<span class="mal-txt">⚠️ El archivo cargado («${esc(a.nombre)}») no se puede reproducir en esa notebook. Probá con MP4 (H.264).</span>`;
    if (v.youtube) return '▶ Se reproduce desde <b>YouTube</b> <span class="suave">(necesita buena conexión)</span><br><span class="mal-txt chico">⚠️ Falta cargar el archivo en la notebook</span>';
    return '<span class="mal-txt">⚠️ Falta cargar en la notebook</span>';
  }
  function pintarVideos() {
    const r = pantallaEstado.reproduccion, activa = repActiva(r);
    $('#vidAviso').classList.toggle('oculto', !videosError);
    if (videosError) $('#vidAviso').innerHTML = '⚠️ ' + esc(videosError.faltaSql ? 'Los videos todavía no están en la base: falta correr supabase/actualizacion-4.sql en Supabase (SQL Editor → Run).' : videosError.message);
    // ¿La notebook del salón está conectada?
    const inf = informe();
    const edad = inf && inf.ts ? ahoraSrv() - Date.parse(inf.ts) : null;
    $('#vidNotebook').innerHTML = !inf ? '📺 La pantalla todavía no avisó qué videos tiene: abrila en la notebook del salón.'
      : (edad < 150000 ? `<span class="ok-txt">🟢 Pantalla del salón conectada</span>` : `<span class="mal-txt">🔴 La pantalla no responde hace ${durTexto(edad / MIN)} (¿está abierta y con internet?)</span>`)
        + (inf.audio === 'bloqueado' ? '<br><span class="mal-txt">🔇 La notebook necesita <b>un toque en la pantalla</b> para tener sonido</span>' : '');
    $('#listaVideos').innerHTML = videos.map(v => {
      const suyo = activa && r.tipo === 'video' && r.id === v.id;
      return `<article class="vid-card ${suyo ? 'activo' : ''}" data-id="${esc(v.id)}">
        <div class="vid-cab"><h4>🎬 ${esc(v.titulo)}</h4>${suyo ? `<span class="pill si vid-estado">${r.estado === 'pausa' ? '⏸ En pausa' : '▶ En pantalla'}</span>` : ''}</div>
        <p class="chico vid-archivo">${estadoArchivo(v)}</p>
        ${suyo ? '<p class="vid-progreso"></p>' : ''}
        <div class="vid-botones">
          ${suyo
            ? (r.estado === 'pausa' ? '<button class="btn btn-oro" data-a="seguir" type="button">▶ Seguir</button>' : '<button class="btn btn-oro" data-a="pausa" type="button">⏸ Pausa</button>')
            : '<button class="btn btn-oro" data-a="play" type="button">▶ Reproducir</button>'}
          <button class="btn" data-a="parar" type="button" ${suyo ? '' : 'disabled'}>⏹ Volver al muro</button>
        </div>
        <div class="vid-edicion"><button class="link-boton" data-a="editar" type="button">✏️ Editar</button>${v.fijo ? '' : '<button class="link-boton peligro" data-a="quitar" type="button">🗑 Quitar</button>'}</div>
      </article>`;
    }).join('') || (videosError ? '' : '<p class="vacio-tabla">No hay videos.</p>');
    // Animaciones
    $$('.anim-card').forEach(c => {
      const suyo = activa && r.tipo === 'anim' && r.id === c.dataset.anim;
      c.classList.toggle('activo', suyo);
      const est = c.querySelector('.vid-estado');
      est.className = 'pill vid-estado ' + (suyo ? 'si' : 'sin');
      est.textContent = suyo ? '▶ En pantalla' : 'Lista';
      c.querySelector('[data-a=parar]').disabled = !suyo;
    });
    // Sonido
    const p = pantallaEstado;
    if (document.activeElement !== $('#vidVolumen') && volPendiente == null) $('#vidVolumen').value = p.volumen == null ? 100 : p.volumen;
    $('#vidVolumenTxt').textContent = $('#vidVolumen').value + '%';
    $('#vidEfectos').checked = p.efectos !== false;
    pintarProgreso();
    if (tabActual === 'itinerario' && iti.items.some(x => x.boton && x.boton.startsWith('video:'))) pintarItinerario();
  }
  function pintarProgreso() {
    const r = pantallaEstado.reproduccion, el = $('#listaVideos .vid-progreso');
    if (!el || !r) return;
    const inf = infoRep(r);
    const pos = inf && inf.estado === 'pausa' ? inf.pos : posActual(r), dur = inf && inf.dur;
    el.innerHTML = `<b>${mmss(dur ? Math.min(pos, dur) : pos)}</b>${dur ? ' / ' + mmss(dur) : ''}${dur ? `<span class="barra-prog"><i style="width:${Math.min(100, pos / dur * 100)}%"></i></span>` : ''}`
      + (inf && inf.estado === 'mudo' ? '<br><span class="mal-txt chico">🔇 Sin sonido: tocá una vez la pantalla de la notebook</span>' : '')
      + (inf && inf.estado === 'error' ? '<br><span class="mal-txt chico">⚠️ La notebook no pudo reproducirlo</span>' : '');
  }
  // Cuando la notebook avisa que el video terminó (o que no lo tiene), se limpia solo
  let avisoSinArchivo = null;
  function alCambiarPantalla() {
    const r = pantallaEstado.reproduccion, inf = infoRep(r);
    if (r && r.tipo === 'video' && inf && inf.estado === 'sin-archivo' && avisoSinArchivo !== r.n) {
      avisoSinArchivo = r.n;
      toast(`⚠️ La notebook no tiene «${tituloVideo(r.id)}» cargado: no se reproduce`, 'error', 7000);
    }
    if (r && r.tipo === 'video' && inf && (inf.estado === 'fin' || inf.estado === 'sin-archivo')) {
      A.actualizarPantalla({ reproduccion: null }).then(() => { if (pantallaEstado.reproduccion === r) pantallaEstado.reproduccion = null; pintarVideos(); pintarEnVivo(); }).catch(() => {});
    }
    if (r && r.tipo === 'anim' && r.id === 'fiesta') cuentaBoom(r);
    pintarVideos();
  }
  // Cuenta regresiva grande en el panel hasta el BOOM (para avisarle al DJ)
  let boomTimer = null, boomN = null;
  function cuentaBoom(r) {
    const boom = Date.parse(r.inicio) + BOOM_SEG * 1000;
    if (boomN === r.n || ahoraSrv() > boom + 1500) return;
    boomN = r.n;
    clearInterval(boomTimer);
    const el = $('#boomCuenta');
    const tic = () => {
      const s = Math.ceil((boom - ahoraSrv()) / 1000);
      if (s <= -2 || !pantallaEstado.reproduccion || pantallaEstado.reproduccion.n !== r.n) { el.classList.add('oculto'); clearInterval(boomTimer); return; }
      el.classList.remove('oculto');
      el.classList.toggle('ya', s <= 0);
      el.textContent = s > 0 ? `💥 BOOM en ${s}…` : '💥 ¡BOOM! ¡Dale, DJ! 🎶';
    };
    tic(); boomTimer = setInterval(tic, 200);
  }

  $('#listaVideos').addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const id = b.closest('.vid-card').dataset.id, r = pantallaEstado.reproduccion, a = b.dataset.a;
    if (a === 'play') {
      if (repActiva(r) && !confirm('Ya hay algo en la pantalla. ¿Cortarlo y reproducir este video?')) return;
      await conBoton(b, () => reproducirVideo(id));
    } else if (a === 'pausa') await conBoton(b, () => mandar(Object.assign({}, r, { estado: 'pausa', pos: posActual(r) })));
    else if (a === 'seguir') await conBoton(b, () => mandar(Object.assign({}, r, { estado: 'play', inicio: new Date(ahoraSrv()).toISOString() })));
    else if (a === 'parar') await conBoton(b, () => mandar(null));
    else if (a === 'editar') abrirFormVideo(videos.find(v => v.id === id));
    else if (a === 'quitar') {
      const v = videos.find(x => x.id === id);
      if (!confirm(`¿Quitar «${v.titulo}» de la lista?\n\n(El archivo en la notebook se borra desde /pantalla/?preparar=1)`)) return;
      await conBoton(b, async () => { await A.borrarVideo(id); await cargarVideos(); toast('Video quitado'); });
    }
  });
  $$('.anim-card').forEach(c => c.addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const id = c.dataset.anim, r = pantallaEstado.reproduccion;
    if (b.dataset.a === 'parar') return conBoton(b, () => mandar(null));
    if (repActiva(r) && !(r.tipo === 'anim' && r.id === id) && !confirm('Ya hay algo en la pantalla. ¿Cortarlo y lanzar la animación?')) return;
    conBoton(b, () => reproducir('anim', id));
  }));

  function abrirFormVideo(v) {
    const f = $('#formVideo');
    f.reset();
    f.id.value = v ? v.id : '';
    f.titulo.value = v ? v.titulo : '';
    f.youtube.value = v ? v.youtube || '' : '';
    $('#tituloFormVideo').textContent = v ? 'Editar video' : 'Nuevo video';
    f.classList.remove('oculto');
    $('#btnNuevoVideo').classList.add('oculto');
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function cerrarFormVideo() { $('#formVideo').classList.add('oculto'); $('#btnNuevoVideo').classList.remove('oculto'); }
  $('#btnNuevoVideo').addEventListener('click', () => abrirFormVideo(null));
  $('#btnCancelarVideo').addEventListener('click', cerrarFormVideo);
  $('#formVideo').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, viejo = videos.find(v => v.id === f.id.value);
    const titulo = f.titulo.value.trim(), youtube = f.youtube.value.trim();
    if (youtube && !/youtu\.?be/i.test(youtube)) { toast('Ese link no parece de YouTube', 'error'); return; }
    let id = viejo ? viejo.id : (S60.slugificar(titulo).slice(0, 34) || 'video');
    if (!viejo) { if (id.length < 2) id = 'video'; const base = id; let n = 2; while (videos.some(v => v.id === id)) id = base + '-' + n++; }
    await conBoton(f.querySelector('[type=submit]'), async () => {
      await A.guardarVideo({ id, titulo, youtube, fijo: viejo ? viejo.fijo : false, orden: viejo ? viejo.orden : videos.reduce((m, v) => Math.max(m, v.orden), 0) + 1 });
      cerrarFormVideo(); await cargarVideos();
      toast(viejo ? 'Video guardado ✔' : 'Video agregado ✔ Ahora cargá el archivo en la notebook (/pantalla/?preparar=1)', '', 6000);
    });
  });

  // Sonido: volumen, efectos y prueba
  let tVol = null, volPendiente = null;
  $('#vidVolumen').addEventListener('input', e => {
    volPendiente = +e.target.value;
    $('#vidVolumenTxt').textContent = volPendiente + '%';
    clearTimeout(tVol);
    tVol = setTimeout(async () => {
      const v = volPendiente;
      try { await A.actualizarPantalla({ volumen: v }); pantallaEstado.volumen = v; } catch (x) { toast(x.message, 'error'); }
      if (volPendiente === v) volPendiente = null;
    }, 300);
  });
  $('#vidEfectos').addEventListener('change', async e => {
    try { await A.actualizarPantalla({ efectos: e.target.checked }); pantallaEstado.efectos = e.target.checked; toast(e.target.checked ? 'Efectos de sonido prendidos 🔊' : 'Efectos de sonido apagados 🔇'); }
    catch (x) { e.target.checked = !e.target.checked; toast(x.message, 'error'); }
  });
  $('#btnProbarSonido').addEventListener('click', e => conBoton(e.currentTarget, async () => {
    await A.actualizarPantalla({ sonido_ts: new Date(ahoraSrv()).toISOString() });
    toast('🔔 Sonando en la pantalla del salón');
  }));

  /* ---------- Arranque ---------- */
  A.sesion().then(s => { if (s) entrar(); });
})();
