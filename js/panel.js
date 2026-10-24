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
    Datos.trivia.escuchar(e => { triviaEstado = Object.assign(triviaEstado, e); pintarEstadoTrivia(); });
    Datos.escucharPantalla(p => { pantallaEstado = Object.assign(pantallaEstado, p); pintarPantalla(); });
    setInterval(pintarEstadoTrivia, 4000);
  }

  /* ---------- Pestañas ---------- */
  let tabActual = 'invitados';
  function abrirTab(t) {
    if (!$('#tab-' + t)) t = 'invitados';
    tabActual = t;
    $$('#pestanas button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('.tab').forEach(s => s.classList.toggle('oculto', s.id !== 'tab-' + t));
    history.replaceState(null, '', '#' + t);
    if (t === 'fotos') cargarFotos();
    if (t === 'confirmaciones' || t === 'playlist' || t === 'mensajes') cargarRsvps();
  }
  $('#pestanas').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) abrirTab(b.dataset.tab); });

  async function cargarTodo() {
    await Promise.all([cargarGrupos(), cargarRsvps(), cargarPreguntas(), cargarEstados()]);
  }

  /* ====================== INVITADOS ====================== */
  async function cargarGrupos() {
    try { grupos = await A.grupos(); } catch (e) { toast(e.message, 'error'); }
    pintarGrupos();
  }
  function rsvpDe(g) { return rsvps.find(r => r.grupo && r.grupo.slug === g.slug); }
  function pintarGrupos() {
    const cupoTotal = grupos.reduce((a, g) => a + g.cupo, 0);
    $('#resumenInvitados').textContent = `${grupos.length} grupos · ${cupoTotal} lugares reservados`;
    if (!grupos.length) { $('#tablaGrupos').innerHTML = '<tr><td class="vacio-tabla">Todavía no hay grupos. Agregalos arriba o importá un CSV.</td></tr>'; return; }
    $('#tablaGrupos').innerHTML = `<thead><tr><th>Nombres</th><th>Cupo</th><th>Respuesta</th><th>Link</th><th></th></tr></thead><tbody>` +
      grupos.map(g => {
        const r = rsvpDe(g);
        const estado = r ? `<span class="pill ${r.asiste}">${textoAsiste[r.asiste]}${r.asiste === 'si' ? ' · ' + r.cantidad : ''}</span>` : '<span class="pill sin">Sin respuesta</span>';
        return `<tr data-id="${g.id}">
          <td><b>${esc(g.nombres)}</b>${listaIntegrantes(g.integrantes).length ? `<br><small>👥 ${esc(listaIntegrantes(g.integrantes).join(', '))}</small>` : ''}${g.telefono ? `<br><small class="suave">${esc(g.telefono)}</small>` : ''}</td>
          <td>${g.cupo}</td>
          <td>${estado}</td>
          <td><code>?i=${esc(g.slug)}</code></td>
          <td class="acciones">
            <a class="btn btn-oro" target="_blank" rel="noopener" href="${esc(S60.urlWhatsApp(C.mensajeWhatsApp.replace('{nombres}', g.nombres).replace('{link}', linkGrupo(g)), g.telefono))}">WhatsApp</a>
            <button class="btn" data-accion="copiar">Copiar link</button>
            <button class="btn" data-accion="editar">Editar</button>
            <button class="btn" data-accion="borrar" aria-label="Borrar ${esc(g.nombres)}">🗑</button>
          </td></tr>`;
      }).join('') + '</tbody>';
  }
  $('#tablaGrupos').addEventListener('click', async e => {
    const b = e.target.closest('button[data-accion]');
    if (!b) return;
    const g = grupos.find(x => x.id === b.closest('tr').dataset.id);
    if (b.dataset.accion === 'copiar') {
      try { await navigator.clipboard.writeText(linkGrupo(g)); toast('Link copiado ✔'); } catch (ex) { prompt('Copiá el link:', linkGrupo(g)); }
    } else if (b.dataset.accion === 'editar') {
      const f = $('#formGrupo');
      f.id.value = g.id; f.nombres.value = g.nombres; f.cupo.value = g.cupo; f.telefono.value = g.telefono || ''; f.slug.value = g.slug;
      f.integrantes.value = listaIntegrantes(g.integrantes).join(', ');
      cupoManual = listaIntegrantes(g.integrantes).length !== g.cupo;
      $('#btnGuardarGrupo').textContent = 'Guardar cambios';
      $('#btnCancelarGrupo').classList.remove('oculto');
      f.scrollIntoView({ behavior: 'smooth' }); f.nombres.focus();
    } else if (b.dataset.accion === 'borrar') {
      if (!confirm(`¿Borrar a «${g.nombres}»? También se borra su confirmación.`)) return;
      await conBoton(b, async () => { await A.borrarGrupo(g.id); toast('Grupo borrado'); await cargarGrupos(); });
    }
  });
  function limpiarFormGrupo() {
    const f = $('#formGrupo'); f.reset(); f.id.value = ''; slugManual = false; cupoManual = false;
    $('#btnGuardarGrupo').textContent = 'Agregar grupo';
    $('#btnCancelarGrupo').classList.add('oculto');
  }
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
      toast(g.id ? 'Cambios guardados ✔' : 'Grupo agregado ✔');
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
    if (!rsvps.length) { $('#tablaRsvp').innerHTML = '<tr><td class="vacio-tabla">Todavía no hay respuestas.</td></tr>'; return; }
    $('#tablaRsvp').innerHTML = `<thead><tr><th>Grupo / nombre</th><th>¿Viene?</th><th>Cant.</th><th>Quiénes vienen</th><th>Actualizado</th></tr></thead><tbody>` +
      rsvps.map(r => `<tr><td><b>${esc(nombreRsvp(r))}</b>${r.grupo ? '' : ' <small class="suave">(link general)</small>'}</td>
        <td><span class="pill ${r.asiste}">${textoAsiste[r.asiste]}</span></td><td>${r.cantidad || ''}</td>
        <td>${r.asiste === 'si' ? esc(r.nombres_asistentes || '') : ''}</td>
        <td><small>${S60.formatoFechaHora(r.actualizado)}</small></td></tr>`).join('') + '</tbody>';
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
    $('#tablaPlaylist').innerHTML = p.length ? `<thead><tr><th>Tema</th><th>Artista</th><th>Pedidos</th><th>Quién la pidió</th></tr></thead><tbody>` +
      p.map(c => `<tr><td><b>${esc(c.tema)}</b></td><td>${esc(c.artista)}</td><td>${c.veces}</td><td><small>${esc(c.quienes.join(', '))}</small></td></tr>`).join('') + '</tbody>'
      : '<tr><td class="vacio-tabla">Todavía no pidieron canciones.</td></tr>';
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
        <span class="num-p">${p.orden}</span>
        <div class="cuerpo"><p>${esc(p.texto)}${p.activa ? '' : ' <small class="suave">(no se juega)</small>'}</p>
          <ul>${p.opciones.map((o, j) => `<li class="${j === p.correcta ? 'ok' : ''}">${esc(o)}${j === p.correcta ? ' ✔' : ''}</li>`).join('')}</ul></div>
        ${imgs[i] ? `<img src="${esc(imgs[i])}" alt="">` : ''}
        <div class="fila-botones"><button class="btn btn-chico" data-a="editar">Editar</button><button class="btn btn-chico" data-a="borrar" aria-label="Borrar pregunta">🗑</button></div>
      </div>`).join('') : '<p class="suave">No hay preguntas. Agregá entre 10 y 15.</p>';
    pintarEstadoTrivia();
  }
  let imagenPregunta = null;
  function abrirPregunta(p) {
    const f = $('#formPregunta');
    f.reset();
    f.id.value = p ? p.id : '';
    f.texto.value = p ? p.texto : '';
    [0, 1, 2, 3].forEach(i => { f['op' + i].value = p ? p.opciones[i] || '' : ''; });
    if (p) f.querySelector(`[name=correcta][value="${p.correcta}"]`).checked = true;
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
    else if (confirm('¿Borrar esta pregunta?')) await conBoton(b, async () => { await A.borrarPregunta(p.id); await cargarPreguntas(); });
  });
  $('#formPregunta').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const correcta = f.querySelector('[name=correcta]:checked');
    if (!correcta) { $('#errorPregunta').textContent = 'Marcá cuál es la opción correcta'; return; }
    const btn = f.querySelector('[type=submit]');
    await conBoton(btn, async () => {
      if (f.imagen.files[0]) {
        const bm = await S60.cargarImagen(f.imagen.files[0]);
        const { blob } = await S60.comprimir(bm, 1200, .82);
        imagenPregunta = await A.subirImagenTrivia(blob);
      }
      await A.guardarPregunta({
        id: f.id.value || null, texto: f.texto.value.trim(), opciones: [0, 1, 2, 3].map(i => f['op' + i].value.trim()),
        correcta: +correcta.value, orden: parseInt(f.orden.value, 10) || 1, imagen: imagenPregunta, activa: f.activa.checked
      });
      $('#modalPregunta').classList.add('oculto');
      toast('Pregunta guardada ✔');
      await cargarPreguntas();
    });
  });

  async function cargarEstados() {
    try { triviaEstado = await Datos.trivia.estado(); } catch (e) {}
    try { pantallaEstado = await Datos.pantalla(); } catch (e) {}
    pintarEstadoTrivia(); pintarPantalla();
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
    $('#btnModoPrueba').textContent = prueba ? 'Apagar modo prueba' : 'Prender modo prueba';
    $('#estadoPrueba').textContent = prueba ? '🧪 MODO PRUEBA PRENDIDO: /fotos está habilitado' : 'Modo prueba apagado';
    $('.tarjeta-prueba').classList.toggle('activo', prueba);
    let banner = $('#bannerPrueba');
    if (prueba && !banner) { banner = document.createElement('div'); banner.id = 'bannerPrueba'; banner.className = 'banner-prueba'; banner.textContent = '🧪 Modo prueba prendido · acordate de apagarlo y de borrar los datos de prueba antes de mandar las invitaciones'; $('.barra-sup').after(banner); }
    if (!prueba && banner) banner.remove();
    $('#btnPausa').textContent = p.muro_pausado ? '▶ Reanudar muro' : '⏸ Pausar muro';
    $('#estadoPantalla').textContent = (p.modo === 'trivia' ? 'Mostrando: trivia' : 'Mostrando: muro de fotos') + (p.muro_pausado ? ' · MURO EN PAUSA' : '') + (p.mensaje_manual ? ' · con mensaje' : '');
  }
  $('#btnPausa').addEventListener('click', e => conBoton(e.currentTarget, async () => {
    await A.actualizarPantalla({ muro_pausado: !pantallaEstado.muro_pausado });
    pantallaEstado.muro_pausado = !pantallaEstado.muro_pausado; pintarPantalla();
  }));
  $('#btnIrTrivia').addEventListener('click', () => abrirTab('trivia'));
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

  /* ---------- Arranque ---------- */
  A.sesion().then(s => { if (s) entrar(); });
})();
