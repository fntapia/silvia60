/* /fotos: sacar o elegir fotos, filtrarlas, comprimirlas y subirlas */
(function () {
  const C = window.CONFIG;
  const { $, local, toast } = S60;
  const dispositivo = S60.idDispositivo();
  const pendientes = new Set();   // items esperando "Publicar"

  S60.bannerDemo();
  S60.brillos($('#brillos'), { cantidad: 22 });
  $('#btnCompartir').href = S60.urlWhatsApp(`📸 ¡Subí tus fotos del cumple de ${C.homenajeada}! Aparecen en vivo en la pantalla del salón: ${S60.url('fotos/')}`);

  /* ---------- Abierto / cerrado ---------- */
  async function revisarHorario() {
    const prueba = await S60.modoPruebaActivo();
    const abierto = S60.fotosHabilitadas(prueba);
    $('#abierto').classList.toggle('oculto', !abierto);
    $('#cerrado').classList.toggle('oculto', abierto);
    $('#avisoPrueba').classList.toggle('oculto', !(prueba && !S60.fotosHabilitadas(false)));
    if (!abierto) {
      const d = new Date(C.fotosDesde);
      $('#cerradoCuando').textContent = `Se habilita el ${d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/San_Juan' }).replace(',', '')} desde las ${S60.formatoHora(d)} h.`;
      setTimeout(revisarHorario, 30000);
    } else {
      pedirNombreSiFalta();
      Filtro.cargar().catch(() => {});   // precargar el modelo mientras eligen la foto
    }
  }

  /* ---------- Nombre ---------- */
  function nombre() { return local.leer('nombre_fotos', ''); }
  function mostrarFirma() { $('#firmaTexto').textContent = '📸 por ' + (nombre() || '…'); }
  function pedirNombre() {
    $('#inputNombre').value = nombre();
    $('#modalNombre').classList.remove('oculto');
    setTimeout(() => $('#inputNombre').focus(), 50);
  }
  function pedirNombreSiFalta() { mostrarFirma(); if (!nombre()) pedirNombre(); }
  $('#btnCambiarNombre').addEventListener('click', pedirNombre);
  $('#formNombre').addEventListener('submit', e => {
    e.preventDefault();
    const n = $('#inputNombre').value.trim().replace(/\s+/g, ' ');
    if (n.length < 2) { $('#errorNombre').textContent = 'Escribí tu nombre o apodo'; return; }
    if (S60.tieneMalasPalabras(n)) { $('#errorNombre').textContent = 'Elegí otro nombre, porfa 🙂'; return; }
    local.guardar('nombre_fotos', n);
    $('#errorNombre').textContent = '';
    $('#modalNombre').classList.add('oculto');
    mostrarFirma();
  });

  /* ---------- Límite antispam local ---------- */
  function puedeSubir() {
    const hace1h = Date.now() - 3600e3;
    const lista = (local.leer('subidas', []) || []).filter(t => t > hace1h);
    local.guardar('subidas', lista);
    return lista.length < C.fotos.limitePorHora;
  }
  function registrarSubida() { const l = local.leer('subidas', []) || []; l.push(Date.now()); local.guardar('subidas', l); }

  /* ---------- Elegir fotos ---------- */
  function alElegir(input) {
    const archivos = Array.from(input.files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    input.value = '';
    if (!nombre()) { pedirNombre(); }
    archivos.slice(0, 10).forEach(agregar);
    if (archivos.length > 10) toast('Podés elegir hasta 10 fotos por vez');
  }
  $('#inputCamara').addEventListener('change', e => alElegir(e.target));
  $('#inputGaleria').addEventListener('change', e => alElegir(e.target));

  function agregar(archivo) {
    const li = $('#tplItem').content.firstElementChild.cloneNode(true);
    const it = { li, archivo, imagen: null, revision: null, id: crypto.randomUUID(), paso: 'nuevo' };
    const prev = URL.createObjectURL(archivo);
    const img = li.querySelector('img');
    img.src = prev;
    img.onload = () => URL.revokeObjectURL(prev);
    img.onerror = () => { URL.revokeObjectURL(prev); img.removeAttribute('src'); };
    $('#cola').prepend(li);
    pendientes.add(it);
    actualizarPublicarTodas();

    // Empezar a revisar ya, mientras escriben la leyenda
    it.preparado = (async () => {
      it.imagen = await S60.cargarImagen(archivo);
      it.revision = await Filtro.revisar(it.imagen);
    })();
    it.preparado.catch(() => {});

    li.querySelector('.item-publicar').addEventListener('click', () => publicar(it));
    li.querySelector('.item-descartar').addEventListener('click', () => { pendientes.delete(it); li.remove(); actualizarPublicarTodas(); });
    li.querySelector('.item-reintentar').addEventListener('click', () => procesar(it));
    li.querySelector('.item-leyenda').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); publicar(it); } });
    // Emojis rápidos: se suman al final de la leyenda (respetando el máximo de caracteres)
    li.querySelector('.emojis-rapidos').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const inp = li.querySelector('.item-leyenda');
      const nuevo = (inp.value.trimEnd() + ' ' + b.textContent).trimStart();
      if (nuevo.length <= C.fotos.leyendaMax) inp.value = nuevo;
    });
  }

  function actualizarPublicarTodas() { $('#publicarTodas').classList.toggle('oculto', pendientes.size < 2); }
  $('#btnPublicarTodas').addEventListener('click', () => Array.from(pendientes).forEach(publicar));

  function estado(it, texto, clase, progreso) {
    const li = it.li;
    li.classList.remove('ok', 'bloqueada', 'error');
    if (clase) li.classList.add(clase);
    li.querySelector('.item-texto').textContent = texto;
    if (progreso != null) li.querySelector('.barra i').style.width = Math.round(progreso * 100) + '%';
    li.querySelector('.item-reintentar').classList.toggle('oculto', clase !== 'error');
  }

  function publicar(it) {
    if (!pendientes.has(it)) return;
    const leyenda = it.li.querySelector('.item-leyenda').value.trim();
    if (leyenda && S60.tieneMalasPalabras(leyenda)) { toast('La leyenda tiene palabras que no van 🙂 Cambiala, porfa.', 'error'); return; }
    if (!nombre()) { pedirNombre(); return; }
    if (!puedeSubir()) { toast('Llegaste al límite de fotos por hora. ¡Probá en un ratito!', 'error', 5000); return; }
    it.leyenda = leyenda;
    it.autor = nombre();
    pendientes.delete(it);
    actualizarPublicarTodas();
    it.li.querySelector('.item-editar').classList.add('oculto');
    it.li.querySelector('.item-estado').classList.remove('oculto');
    if (leyenda) { const p = document.createElement('p'); p.className = 'suave'; p.style.margin = '0 0 .3rem'; p.textContent = '“' + leyenda + '”'; it.li.querySelector('.item-estado').prepend(p); }
    procesar(it);
  }

  async function reintentando(fn, it, intentos = 3) {
    let ultimo;
    for (let i = 0; i < intentos; i++) {
      try { return await fn(); }
      catch (e) {
        ultimo = e;
        if (/límite|limite/i.test(e.message)) throw e;
        if (i < intentos - 1) { estado(it, `Conexión lenta, reintentando (${i + 2}/${intentos})…`); await new Promise(r => setTimeout(r, [2000, 5000, 10000][i])); }
      }
    }
    throw ultimo;
  }

  async function procesar(it) {
    try {
      if (it.paso === 'nuevo' || it.paso === 'revisando') {
        it.paso = 'revisando';
        estado(it, 'Revisando la foto…', null, .05);
        await it.preparado;
        if (!it.imagen) throw new Error('No se pudo leer la foto');
        estado(it, 'Preparando…', null, .1);
        it.comprimida = (await S60.comprimir(it.imagen, C.fotos.ladoMax, C.fotos.calidad)).blob;
        it.paso = 'subiendo';
      }
      const bloqueada = it.revision.bloqueada;
      const bucket = bloqueada ? 'revision' : 'fotos';
      const ruta = (bloqueada ? 'rev/' : 'pub/') + it.id + '.jpg';
      if (it.paso === 'subiendo') {
        estado(it, 'Subiendo…', null, .12);
        await reintentando(() => Datos.subirArchivo(bucket, ruta, it.comprimida, p => estado(it, 'Subiendo… ' + Math.round(p * 100) + '%', null, .12 + p * .8)), it);
        it.paso = 'registrando';
      }
      if (it.paso === 'registrando') {
        const r = await reintentando(() => Datos.registrarFoto({
          id: it.id, ruta, bytes: it.comprimida.size, autor: it.autor, leyenda: it.leyenda || null,
          dispositivo, bloqueada, puntajes: it.revision.puntajes
        }), it);
        registrarSubida();
        it.paso = 'original';
        if (r.estado === 'revision') {
          estado(it, it.revision.error ? 'Tu foto quedó para revisar y va a aparecer en un ratito.' : 'Esta foto no pasó el filtro automático.', 'bloqueada', 1);
          liberar(it);
          return;
        }
        estado(it, '¡Publicada! Ya está en la pantalla ✨', 'ok', 1);
      }
      if (it.paso === 'original') await subirOriginal(it);
      liberar(it);
    } catch (e) {
      console.warn(e);
      estado(it, e.message && e.message.length < 120 ? e.message : 'No se pudo subir. Revisá la conexión.', 'error');
    }
  }

  // Guardar el original (si pesa menos del límite y hay espacio) para descargar después en buena calidad
  async function subirOriginal(it) {
    const a = it.archivo;
    const tipoOk = /^image\/(jpeg|png|webp)$/.test(a.type);
    if (!tipoOk || a.size > C.fotos.originalMaxMB * 1048576 || a.size <= it.comprimida.size) return;
    try {
      if (!(await Datos.permiteOriginal())) return;
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[a.type];
      const ruta = 'orig/' + it.id + '.' + ext;
      await reintentando(() => Datos.subirArchivo('fotos', ruta, a), it, 2);
      await Datos.adjuntarOriginal(it.id, ruta, a.size, dispositivo);
    } catch (e) { console.warn('Original no guardado', e); }
    estado(it, '¡Publicada! Ya está en la pantalla ✨', 'ok', 1);
  }

  function liberar(it) {
    if (it.imagen && it.imagen.close) it.imagen.close();
    it.imagen = null; it.comprimida = null; it.archivo = null; it.paso = 'listo';
  }

  revisarHorario();
})();
