/* ==========================================================
   SILVIA 60 · LISTA DE CONFIRMADOS PARA SILVIA
   Dibuja la lista en un canvas (blanco y dorado) y la entrega como
   imágenes para el celular (1080 px de ancho, partidas en 1/2, 2/2…)
   o como PDF A4. No toca la base: recibe los datos ya armados.
   ========================================================== */
window.ListaSilvia = (() => {
  const ORO = '#B8902F', ORO_CLARO = '#E3C36A', ORO_OSC = '#8C6A1E', TINTA = '#2B2520', SUAVE = '#6F655A', LINEA = '#EADFC4';
  const SERIF = '"Playfair Display", Georgia, serif', SANS = 'Montserrat, Arial, sans-serif';
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const ZONA = { timeZone: 'America/Argentina/Buenos_Aires' };

  async function fuentes() {
    if (!document.fonts || !document.fonts.load) return;
    const lista = ['900 100px "Playfair Display"', 'italic 800 100px "Playfair Display"', 'italic 700 40px "Playfair Display"', '700 40px "Playfair Display"',
      '500 30px Montserrat', '600 30px Montserrat', '700 30px Montserrat', '800 30px Montserrat'];
    try { await Promise.race([Promise.all(lista.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* usa las de respaldo */ }
  }
  const espaciado = (ctx, px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; };

  // Parte un texto en líneas que entren en "ancho" (corta palabras larguísimas si hace falta)
  function partir(ctx, texto, ancho) {
    const lineas = []; let linea = '';
    String(texto || '').split(/\s+/).filter(Boolean).forEach(p => {
      while (ctx.measureText(p).width > ancho && p.length > 1) {   // palabra más ancha que la columna
        let i = p.length; while (i > 1 && ctx.measureText(p.slice(0, i)).width > ancho) i--;
        if (linea) { lineas.push(linea); linea = ''; }
        lineas.push(p.slice(0, i)); p = p.slice(i);
      }
      const prueba = linea ? linea + ' ' + p : p;
      if (ctx.measureText(prueba).width > ancho && linea) { lineas.push(linea); linea = p; } else linea = prueba;
    });
    if (linea) lineas.push(linea);
    return lineas.length ? lineas : [''];
  }

  function tilde(ctx, x, y, r) {   // ✓ dorado dibujado (no depende de que el celu tenga emojis)
    ctx.save();
    ctx.fillStyle = ORO; ctx.beginPath(); ctx.arc(x + r, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x + r * 0.5, y + r * 0.02); ctx.lineTo(x + r * 0.88, y + r * 0.4); ctx.lineTo(x + r * 1.55, y - r * 0.38); ctx.stroke();
    ctx.restore();
  }

  /* ---------- Bloques: cada uno sabe su alto y cómo dibujarse ---------- */
  function armarBloques(ctx, d, ancho, k) {
    const bs = [];
    const seccion = (texto, primera) => {
      const h = (primera ? 62 : 92) * k;
      bs.push({ h, juntoAlSiguiente: true, dibujar(c, x, y, w) {
        c.font = `800 ${25 * k}px ${SANS}`; c.fillStyle = ORO_OSC; espaciado(c, 4 * k); c.textBaseline = 'alphabetic';
        c.fillText(texto.toUpperCase(), x, y + h - 26 * k); espaciado(c, 0);
        c.fillStyle = ORO_CLARO; c.fillRect(x, y + h - 14 * k, Math.min(w, 90 * k), 3 * k);
      } });
    };
    // --- Vienen ---
    seccion(`Vienen · ${d.vienen.length} ${d.vienen.length === 1 ? 'familia' : 'familias'}`, true);
    if (!d.vienen.length) lineaSuelta('Todavía nadie confirmó.');
    d.vienen.forEach(v => {
      ctx.font = `700 ${38 * k}px ${SERIF}`;
      const nom = partir(ctx, v.nombre, ancho - 110 * k);
      ctx.font = `500 ${29 * k}px ${SANS}`;
      const quienes = partir(ctx, v.quienes || `${v.cantidad} ${v.cantidad === 1 ? 'persona' : 'personas'}`, ancho - 52 * k);
      const h = 18 * k + nom.length * 48 * k + 6 * k + quienes.length * 40 * k + 22 * k;
      bs.push({ h, dibujar(c, x, y, w) {
        c.textBaseline = 'alphabetic';
        c.font = `700 ${38 * k}px ${SERIF}`; c.fillStyle = TINTA;
        nom.forEach((l, i) => c.fillText(l, x, y + 18 * k + 38 * k + i * 48 * k));
        // cantidad a la derecha
        c.font = `800 ${30 * k}px ${SANS}`; c.fillStyle = ORO; c.textAlign = 'right';
        c.fillText(String(v.cantidad), x + w, y + 18 * k + 36 * k); c.textAlign = 'left';
        const y0 = y + 18 * k + nom.length * 48 * k + 6 * k;
        tilde(c, x, y0 + 18 * k, 14 * k);
        c.font = `500 ${29 * k}px ${SANS}`; c.fillStyle = SUAVE;
        quienes.forEach((l, i) => c.fillText(l, x + 44 * k, y0 + 29 * k + i * 40 * k));
        c.fillStyle = LINEA; c.fillRect(x, y + h - 2 * k, w, 2 * k);
      } });
    });
    // --- Listas cortas: no van / sin respuesta (una línea por bloque para poder cortar de página) ---
    function lineaSuelta(texto, color) {
      bs.push({ h: 42 * k, dibujar(c, x, y) { c.font = `500 ${28 * k}px ${SANS}`; c.fillStyle = color || SUAVE; c.textBaseline = 'alphabetic'; c.fillText(texto, x, y + 32 * k); } });
    }
    function lista(titulo, nombres) {
      if (!nombres.length) return;
      seccion(`${titulo} (${nombres.length})`);
      bs.push({ h: 10 * k, dibujar() {} });
      ctx.font = `500 ${28 * k}px ${SANS}`;
      partir(ctx, nombres.join('  ·  '), ancho).forEach(l => lineaSuelta(l));
    }
    lista('No pueden venir', d.noVan);
    lista('Sin respuesta', d.sinRespuesta);
    return bs;
  }

  /* ---------- Encabezados ---------- */
  function fechaAl(d) { return d.fecha.toLocaleDateString('es-AR', Object.assign({ day: 'numeric', month: 'long' }, ZONA)); }
  function encabezado(c, W, d, k) {   // devuelve dónde termina
    const cx = W / 2;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    // Emblema: "60" dorado + "Silvia" cruzado
    c.font = `900 ${250 * k}px ${SERIF}`;
    const g = c.createLinearGradient(0, 70 * k, 0, 305 * k);
    g.addColorStop(0, ORO_CLARO); g.addColorStop(0.55, ORO); g.addColorStop(1, ORO_OSC);
    c.fillStyle = g; c.fillText(String(d.edad), cx, 298 * k);
    c.save(); c.translate(cx + 10 * k, 392 * k); c.rotate(-6 * Math.PI / 180);
    c.font = `italic 800 ${104 * k}px ${SERIF}`; c.lineJoin = 'round';
    c.lineWidth = 16 * k; c.strokeStyle = '#fff'; c.strokeText(d.homenajeada, 0, 0);
    c.fillStyle = TINTA; c.fillText(d.homenajeada, 0, 0);
    c.restore();
    c.font = `700 ${27 * k}px ${SANS}`; c.fillStyle = SUAVE; espaciado(c, 7 * k);
    c.fillText(`CONFIRMADOS AL ${fechaAl(d).toUpperCase()}`, cx, 488 * k); espaciado(c, 0);
    c.font = `900 ${128 * k}px ${SERIF}`; c.fillStyle = ORO; c.fillText(String(d.personas), cx, 638 * k);
    c.font = `600 ${31 * k}px ${SANS}`; c.fillStyle = TINTA;
    c.fillText(`${d.personas === 1 ? 'persona confirmada' : 'personas confirmadas'} · ${d.vienen.length} ${d.vienen.length === 1 ? 'familia' : 'familias'}`, cx, 690 * k);
    adorno(c, cx, 743 * k, k);
    c.textAlign = 'left';
    return 768 * k;
  }
  function encabezadoChico(c, W, d, k, margen) {
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = `italic 700 ${44 * k}px ${SERIF}`; c.fillStyle = ORO;
    c.fillText(`${d.homenajeada} ${d.edad}`, margen, 120 * k);
    c.font = `700 ${22 * k}px ${SANS}`; c.fillStyle = SUAVE; espaciado(c, 5 * k); c.textAlign = 'right';
    c.fillText(`CONFIRMADOS AL ${fechaAl(d).toUpperCase()}`, W - margen, 116 * k); espaciado(c, 0); c.textAlign = 'left';
    c.fillStyle = ORO_CLARO; c.fillRect(margen, 145 * k, W - 2 * margen, 2 * k);
    return 160 * k;
  }
  function adorno(c, cx, y, k) {
    c.fillStyle = ORO_CLARO;
    c.fillRect(cx - 230 * k, y - 1 * k, 200 * k, 2 * k); c.fillRect(cx + 30 * k, y - 1 * k, 200 * k, 2 * k);
    c.save(); c.translate(cx, y); c.rotate(Math.PI / 4); c.fillStyle = ORO; c.fillRect(-9 * k, -9 * k, 18 * k, 18 * k); c.restore();
  }
  function marco(c, W, H, k) {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.strokeStyle = ORO; c.lineWidth = 3 * k; c.strokeRect(26 * k, 26 * k, W - 52 * k, H - 52 * k);
    c.strokeStyle = ORO_CLARO; c.lineWidth = 1.5 * k; c.strokeRect(38 * k, 38 * k, W - 76 * k, H - 76 * k);
  }

  /* ---------- Paginado en columnas ---------- */
  function paginar(bs, cfg, altoEnc, altoEncChico) {
    const paginas = []; let pag, col, y;
    const nueva = () => { pag = { arriba: paginas.length ? altoEncChico : altoEnc, piezas: [], fondo: 0 }; paginas.push(pag); col = 0; y = pag.arriba; };
    const abajo = () => cfg.H - cfg.pie;
    nueva();
    bs.forEach((b, i) => {
      const extra = b.juntoAlSiguiente && bs[i + 1] ? bs[i + 1].h : 0;   // el título no queda solo al pie
      if (y + b.h + extra > abajo() && y > pag.arriba) {
        col++; y = pag.arriba;
        if (col >= cfg.cols) nueva();
      }
      pag.piezas.push({ b, col, y });
      y += b.h; pag.fondo = Math.max(pag.fondo, y);
    });
    return paginas;
  }

  function dibujar(d, cfg) {
    const { W, k, cols, margen, gap, escala } = cfg;
    const medir = document.createElement('canvas').getContext('2d');
    const anchoCol = (W - 2 * margen - gap * (cols - 1)) / cols;
    const bs = armarBloques(medir, d, anchoCol, k);
    const paginas = paginar(bs, cfg, 768 * cfg.kEnc + 20 * k, 175 * k);
    return paginas.map((p, n) => {
      const H = cfg.recortar ? Math.max(cfg.minH, Math.min(cfg.H, Math.ceil(p.fondo + cfg.pie))) : cfg.H;
      const cv = document.createElement('canvas');
      cv.width = Math.round(W * escala); cv.height = Math.round(H * escala);
      const c = cv.getContext('2d'); c.scale(escala, escala);
      marco(c, W, H, k);
      if (n === 0) encabezado(c, W, d, cfg.kEnc); else encabezadoChico(c, W, d, k, margen);
      p.piezas.forEach(({ b, col, y }) => b.dibujar(c, margen + col * (anchoCol + gap), y, anchoCol));
      // pie: numeración
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.font = `600 ${22 * k}px ${SANS}`; c.fillStyle = SUAVE; espaciado(c, 3 * k);
      c.fillText(paginas.length > 1 ? `${n + 1}/${paginas.length}` : `${d.homenajeada.toUpperCase()} ${d.edad}`, W / 2, H - 62 * k);
      espaciado(c, 0); c.textAlign = 'left';
      return cv;
    });
  }

  const sufijoFecha = () => new Date().toISOString().slice(0, 10);
  const aBlob = (cv, tipo, calidad) => new Promise((ok, mal) => cv.toBlob(b => b ? ok(b) : mal(new Error('No se pudo armar la imagen')), tipo, calidad));

  /* ---------- Imágenes para el celu ---------- */
  async function imagenes(d) {
    await fuentes();
    const base = { W: 1080, H: 1920, minH: 1350, k: 1, kEnc: 1, cols: 1, margen: 90, gap: 50, pie: 120, escala: 1, recortar: true };
    let cvs = dibujar(d, base);
    if (cvs.length > 3) cvs = dibujar(d, Object.assign({}, base, { cols: 2, k: 0.82 }));   // lista muy larga: 2 columnas
    const total = cvs.length;
    return Promise.all(cvs.map(async (cv, i) => {
      const blob = await aBlob(cv, 'image/png');
      return { blob, url: URL.createObjectURL(blob), nombre: `confirmados-silvia60-${sufijoFecha()}${total > 1 ? `-${i + 1}de${total}` : ''}.png` };
    }));
  }
  const archivos = ims => ims.map(im => new File([im.blob], im.nombre, { type: 'image/png' }));
  function puedeCompartir(ims) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: archivos(ims) })); } catch (e) { return false; }
  }
  function compartir(ims, titulo) { return navigator.share({ files: archivos(ims), title: titulo }); }

  /* ---------- PDF A4 (1 o 2 hojas) ---------- */
  let jspdf = null;
  function cargarJsPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    if (!jspdf) jspdf = new Promise((ok, mal) => {
      const s = document.createElement('script'); s.src = JSPDF; s.async = true;
      s.onload = () => window.jspdf ? ok(window.jspdf) : mal(new Error('No cargó el generador de PDF'));
      s.onerror = () => { jspdf = null; mal(new Error('Sin conexión: no se pudo cargar el generador de PDF')); };
      document.head.appendChild(s);
    });
    return jspdf;
  }
  async function pdf(d) {
    const [lib] = await Promise.all([cargarJsPdf(), fuentes()]);
    const cvs = dibujar(d, { W: 1240, H: 1754, minH: 1754, k: 0.74, kEnc: 0.62, cols: 2, margen: 100, gap: 60, pie: 110, escala: 1.6, recortar: false });
    const doc = new lib.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    cvs.forEach((cv, i) => {
      if (i) doc.addPage();
      doc.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    });
    return { blob: doc.output('blob'), nombre: `confirmados-silvia60-${sufijoFecha()}.pdf`, hojas: cvs.length };
  }

  return { imagenes, puedeCompartir, compartir, pdf };
})();
