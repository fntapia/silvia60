/* Filtro automático de fotos con IA en el navegador (nsfwjs + TensorFlow.js).
   Se carga solo en /fotos. El modelo (2,6 MB) está alojado en assets/modelo-nsfw/. */
(function () {
  const C = window.CONFIG;
  const TFJS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js';
  const NSFWJS = 'https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/dist/nsfwjs.min.js';
  let modelo = null;

  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  // Algunas placas de video devuelven siempre lo mismo: probamos con dos imágenes muy distintas
  async function respondeBien(m) {
    const pinta = (fondo, figura) => {
      const c = document.createElement('canvas'); c.width = c.height = 224;
      const x = c.getContext('2d'); x.fillStyle = fondo; x.fillRect(0, 0, 224, 224);
      x.fillStyle = figura; x.beginPath(); x.arc(112, 112, 70, 0, 7); x.fill();
      return c;
    };
    const a = await m.classify(pinta('#ff0000', '#000000'), 5);
    const b = await m.classify(pinta('#f2f2f2', '#2a6cff'), 5);
    const pa = {}; a.forEach(x => { pa[x.className] = x.probability; });
    return b.some(x => Math.abs(x.probability - pa[x.className]) > 0.001);
  }

  function cargar() {
    if (!modelo) {
      modelo = (async () => {
        if (!window.tf) await cargarScript(TFJS);
        if (!window.nsfwjs) await cargarScript(NSFWJS);
        const ruta = C.base + 'assets/modelo-nsfw/';
        try {
          await tf.setBackend('webgl');
          const m = await nsfwjs.load(ruta, { size: 224 });
          if (await respondeBien(m)) return m;
          console.warn('WebGL da resultados inválidos en este equipo; se usa CPU');
          m.model && m.model.dispose && m.model.dispose();
        } catch (e) { console.warn('WebGL no disponible', e); }
        await tf.setBackend('cpu');
        return nsfwjs.load(ruta, { size: 224 });
      })();
      modelo.catch(() => { modelo = null; });   // permitir reintentar
    }
    return modelo;
  }

  // Devuelve { bloqueada, puntajes, error }
  async function revisar(imagen) {
    if (new URLSearchParams(location.search).has('probarFiltro')) {
      return { bloqueada: true, puntajes: { Porn: 0.99, prueba: true } };
    }
    try {
      const m = await cargar();
      // Reducimos a 299 px para que sea rápido en celulares
      const lado = 299, esc = Math.min(1, lado / Math.max(imagen.width, imagen.height));
      const c = document.createElement('canvas');
      c.width = Math.round(imagen.width * esc); c.height = Math.round(imagen.height * esc);
      c.getContext('2d').drawImage(imagen, 0, 0, c.width, c.height);
      const preds = await m.classify(c, 5);
      c.width = c.height = 0;
      const p = {};
      preds.forEach(x => { p[x.className] = Math.round(x.probability * 1000) / 1000; });
      const u = C.filtro;
      const bloqueada = (p.Porn || 0) > u.porn || (p.Hentai || 0) > u.hentai || (p.Sexy || 0) > u.sexy;
      return { bloqueada, puntajes: p };
    } catch (e) {
      console.warn('Filtro no disponible', e);
      // Si el filtro no carga, la foto queda en revisión (nunca se publica sin revisar)
      return { bloqueada: true, puntajes: { error: 'filtro-no-disponible' }, error: true };
    }
  }

  window.Filtro = { cargar, revisar };
})();
