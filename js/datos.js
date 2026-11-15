/* Silvia 60 · capa de datos
   - Con Supabase configurado en config.js: usa la base real.
   - Sin Supabase: MODO DEMO, guarda todo en este navegador (localStorage + IndexedDB)
     y avisa a las otras pestañas con BroadcastChannel. Sirve para probar. */
(function () {
  const C = window.CONFIG;
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  // Lógica compartida
  function puntosPorRespuesta(correcta, ms, duracionSeg) {
    if (!correcta) return 0;
    const f = Math.min(1, Math.max(0, ms / (duracionSeg * 1000)));
    return Math.round(500 + 500 * (1 - f));
  }
  // Un momento del itinerario, tal como se guarda (la hora de inicio no se guarda: se calcula en cadena)
  function filaItem(it) {
    const txt = (s, max) => { const t = String(s == null ? '' : s).trim().slice(0, max); return t || null; };
    return {
      orden: it.orden || 1, emoji: txt(it.emoji, 16) || '⭐', titulo: txt(it.titulo, 80) || 'Momento',
      duracion: Math.max(0, Math.min(600, parseInt(it.duracion, 10) || 0)), hora_fija: it.hora_fija || null,
      responsable: txt(it.responsable, 80), notas: txt(it.notas, 300), boton: it.boton || null, hecho: !!it.hecho
    };
  }
  const CONFIG_ITINERARIO = { id: 1, duracion_horas: 7, fotografa_desde: 30, fotografa_horas: 3 };
  // Mismo itinerario que supabase/actualizacion-5.sql (para el modo demo)
  const ITINERARIO_INICIAL = [
    ['🚪', 'Apertura de puertas', 30, null, 'Música instrumental', null],
    ['✨', 'Llega Silvia', 5, null, '▶ Animación «Entrada de Silvia»; el tema de entrada lo pone el DJ', 'entrada'],
    ['💐', 'Ramo', 5, null, 'Hijos, nietos y Raúl le entregan el ramo', null],
    ['💃', 'Vals', 15, null, '«Tiempo de vals» (Chayanne) lo pone el DJ · ▶ video «Vals» en pantalla (en bucle) · bailan varios', 'video:vals'],
    ['📸', 'Fotos mesa a mesa', 20, null, 'Con la fotógrafa', null],
    ['🥂', 'Brindis, velas y «Feliz cumpleaños»', 15, null, null, null],
    ['🍽️', 'Cena', 30, null, 'Música electro pop baja', null],
    ['🎬', 'Video homenaje', 20, null, '▶ Video homenaje; el DJ pone la música en 0', 'video:homenaje'],
    ['🏆', 'Trivia', 15, null, null, 'trivia'],
    ['🍽️', 'Cierre de la cena', 10, null, 'Sin postre', null],
    ['🌹', 'Tango', 15, null, '2 tangos (Silvia baila: prever su cambio de ropa)', null],
    ['🪕', 'Folklore', 15, null, null, null],
    ['🚨', '¡BOOM! Arranca la fiesta', 5, null, '▶ Animación «¡Arranca la fiesta!»; en el BOOM el DJ larga «Mi chica sexy» (Banda XXI); abre la barra 🍸', 'fiesta'],
    ['🎁', 'Entrega de cotillón', 10, null, 'Después de «Mi chica sexy»; sigue cuarteto', null],
    ['🦸', 'Show Marvel', 60, '01:30', 'Cabezones Daddy Yankee, La Mona y Messi; la música la coordina la animación con el DJ', null],
    ['🔥', 'Post show', 15, null, null, null],
    ['🪅', 'Piñata de Silvidólares', 15, null, '▶ Video «Piñata»; el DJ pone Bzrp Music Sessions #53 (Shakira); papel picado y silbatos', 'video:pinata'],
    ['🎂', 'Torta y mesa dulce', 60, '03:00', 'Sigue el baile', null],
    ['🥪', 'Sándwiches y salado', 55, '04:00', null, null],
    ['👋', 'Cierre y despedida', 5, null, null, null]
  ];
  const VIDEOS_FIJOS = [
    { id: 'homenaje', emoji: '🎬', titulo: 'Video homenaje', youtube: null, fijo: true, orden: 1, bucle: false, bucle_desde: 0, mudo: false },
    { id: 'vals', emoji: '💃', titulo: 'Vals', youtube: null, fijo: true, orden: 2, bucle: true, bucle_desde: 0, mudo: true },
    { id: 'pinata', emoji: '🪅', titulo: 'Piñata de Silvidólares', youtube: null, fijo: true, orden: 3, bucle: true, bucle_desde: 12, mudo: true }
  ];
  function filaVideo(v) {
    return { id: v.id, emoji: v.emoji || '🎬', titulo: v.titulo, youtube: v.youtube || null, fijo: !!v.fijo, orden: v.orden || 1, bucle: !!v.bucle, bucle_desde: Math.max(0, +v.bucle_desde || 0), mudo: !!v.mudo };
  }
  // Si falta correr el SQL nuevo, un aviso claro en vez de un error técnico
  function errorSql4(e) {
    const m = (e && e.message) || String(e);
    const err = new Error(/does not exist|schema cache|could not find/i.test(m) ? 'Falta correr supabase/actualizacion-4.sql y actualizacion-5.sql en Supabase' : m);
    err.faltaSql = /actualizacion-4/.test(err.message);
    return err;
  }
  function errorSql6(e) {
    const m = (e && e.message) || String(e);
    const err = new Error(/does not exist|schema cache|could not find|rsvp_por_admin|recordatorio|enviada_en/i.test(m) && !/No autorizado|máximo|Elegí|Familia/.test(m)
      ? 'Falta correr supabase/actualizacion-6.sql en Supabase (SQL Editor → Run)' : m.replace(/^.*?: /, ''));
    err.faltaSql = /actualizacion-6/.test(err.message);
    return err;
  }

  /* ======================= SUPABASE ======================= */
  function backendSupabase() {
    let sb = null;
    const listo = (async () => {
      if (!window.supabase) await cargarScript(SUPABASE_JS);
      sb = window.supabase.createClient(C.supabase.url, C.supabase.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 10 } }
      });
    })();
    const db = async () => { await listo; return sb; };

    async function rpc(nombre, params) {
      const s = await db();
      const { data, error } = await s.rpc(nombre, params || {});
      if (error) throw traducirError(error);
      return data;
    }
    function traducirError(e) {
      const m = (e && (e.message || e.error_description)) || String(e);
      const err = new Error(m.replace(/^.*?: /, ''));
      err.original = e;
      return err;
    }
    const urlPublica = ruta => `${C.supabase.url}/storage/v1/object/public/fotos/${ruta.split('/').map(encodeURIComponent).join('/')}`;

    function escucharTabla(tabla, cb, alEstado) {
      let canal = null, cerrado = false;
      db().then(s => {
        if (cerrado) return;
        canal = s.channel('rt-' + tabla + '-' + Math.random().toString(36).slice(2))
          .on('postgres_changes', { event: '*', schema: 'public', table: tabla }, p => cb({ tipo: p.eventType, fila: p.new && Object.keys(p.new).length ? p.new : p.old }))
          .subscribe(estado => alEstado && alEstado(estado === 'SUBSCRIBED'));
      });
      return () => { cerrado = true; if (canal) sb.removeChannel(canal); };
    }

    function subirArchivo(bucket, ruta, blob, alProgreso) {
      return db().then(s => s.auth.getSession()).then(({ data }) => new Promise((ok, mal) => {
        const token = (data && data.session && data.session.access_token) || C.supabase.anonKey;
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${C.supabase.url}/storage/v1/object/${bucket}/${ruta}`);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.setRequestHeader('apikey', C.supabase.anonKey);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.setRequestHeader('cache-control', 'max-age=31536000');
        xhr.setRequestHeader('Content-Type', blob.type || 'image/jpeg');
        xhr.timeout = 120000;
        xhr.upload.onprogress = e => { if (e.lengthComputable && alProgreso) alProgreso(e.loaded / e.total); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? ok() : mal(new Error('Error al subir (' + xhr.status + ')'));
        xhr.onerror = () => mal(new Error('Sin conexión'));
        xhr.ontimeout = () => mal(new Error('La conexión está muy lenta'));
        xhr.send(blob);
      }));
    }

    const fotoPublica = f => ({ id: f.id, url: urlPublica(f.ruta), autor: f.autor, leyenda: f.leyenda, creado: f.creado, estado: f.estado });

    return {
      modoDemo: false,
      urlPublica,
      obtenerGrupo: slug => rpc('obtener_grupo', { p_slug: slug }),
      obtenerRsvp: ({ slug, token }) => rpc('obtener_rsvp', { p_slug: slug || null, p_token: token || null }),
      guardarRsvp: (slug, token, datos) => rpc('guardar_rsvp', { p: Object.assign({}, datos, { slug: slug || null, token: token || null }) }),
      permiteOriginal: () => rpc('permite_original'),
      subirArchivo,
      registrarFoto: datos => rpc('registrar_foto', { p: datos }),
      adjuntarOriginal: (id, ruta, bytes, dispositivo) => rpc('adjuntar_original', { p_id: id, p_ruta: ruta, p_bytes: bytes, p_dispositivo: dispositivo }),
      async fotosPublicas() {
        const s = await db();
        const { data, error } = await s.from('fotos').select('id,ruta,autor,leyenda,creado,estado').eq('estado', 'publicada').order('creado', { ascending: true }).limit(1000);
        if (error) throw traducirError(error);
        return data.map(fotoPublica);
      },
      escucharFotos: (cb, alEstado) => escucharTabla('fotos', ev => cb({ tipo: ev.tipo, foto: ev.fila && ev.fila.ruta ? fotoPublica(ev.fila) : ev.fila }), alEstado),
      mensajesPantalla: () => rpc('mensajes_pantalla'),
      // Fecha, hora, puntualidad y límite para confirmar (se editan en el panel → Evento)
      async evento() {
        const s = await db();
        const { data, error } = await s.from('evento_config').select('*').eq('id', 1).maybeSingle();
        if (error) throw traducirError(error);
        return data;
      },
      async pantalla() {
        const s = await db();
        const { data, error } = await s.from('pantalla_estado').select('*').eq('id', 1).single();
        if (error) throw traducirError(error);
        return data;
      },
      escucharPantalla: (cb, alEstado) => escucharTabla('pantalla_estado', ev => cb(ev.fila), alEstado),
      // Videos que la notebook del salón tiene que tener cargados (los archivos quedan en la notebook, no acá)
      async videos() {
        const s = await db();
        const { data, error } = await s.from('videos').select('*').order('orden').order('creado');
        if (error) throw errorSql4(error);
        return data;
      },
      // La pantalla (sin login) avisa qué videos tiene y qué está reproduciendo
      informarPantalla: p => rpc('pantalla_informar', { p }),
      trivia: {
        async estado() {
          const s = await db();
          const { data, error } = await s.from('trivia_estado').select('*').eq('id', 1).single();
          if (error) throw traducirError(error);
          return data;
        },
        escuchar: (cb, alEstado) => escucharTabla('trivia_estado', ev => cb(ev.fila), alEstado),
        preguntaActual: () => rpc('trivia_pregunta_actual'),
        unirse: apodo => rpc('trivia_unirse', { p_apodo: apodo }),
        responder: (token, preguntaId, opcion) => rpc('trivia_responder', { p_token: token, p_pregunta: preguntaId, p_opcion: opcion }),
        resultados: () => rpc('trivia_resultados'),
        ranking: n => rpc('trivia_ranking', { p_n: n || 5 }),
        miEstado: token => rpc('trivia_mi_estado', { p_token: token }),
        cantidadJugadores: () => rpc('trivia_cantidad'),
        apodos: () => rpc('trivia_apodos')
      },
      admin: {
        async login(email, clave) {
          const s = await db();
          const { error } = await s.auth.signInWithPassword({ email, password: clave });
          if (error) throw new Error('Email o contraseña incorrectos');
          if (!(await rpc('es_admin'))) { await s.auth.signOut(); throw new Error('Este usuario no es administrador'); }
        },
        async logout() { const s = await db(); await s.auth.signOut(); },
        async sesion() {
          const s = await db();
          const { data } = await s.auth.getSession();
          if (!data.session) return null;
          try { return (await rpc('es_admin')) ? { email: data.session.user.email } : null; } catch (e) { return null; }
        },
        async grupos() {
          const s = await db();
          const { data, error } = await s.from('grupos').select('*').order('nombres');
          if (error) throw traducirError(error);
          return data;
        },
        async guardarGrupo(g) {
          const s = await db();
          const fila = { slug: g.slug, nombres: g.nombres, cupo: g.cupo, telefono: g.telefono || null, integrantes: g.integrantes || null };
          const q = g.id ? s.from('grupos').update(fila).eq('id', g.id) : s.from('grupos').insert(fila);
          const { error } = await q;
          if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Ese link (slug) ya existe' : error.message);
        },
        async borrarGrupo(id) {
          const s = await db();
          const { error } = await s.from('grupos').delete().eq('id', id);
          if (error) throw traducirError(error);
        },
        async rsvps() {
          const s = await db();
          const { data, error } = await s.from('rsvps').select('*, grupo:grupos(id,slug,nombres,cupo,integrantes,telefono)').order('actualizado', { ascending: false });
          if (error) throw traducirError(error);
          return data;
        },
        // "Confirmar por ellos": la misma confirmación de la familia (si ya respondieron, se modifica)
        async confirmarPorEllos(p) {
          const s = await db();
          const { data, error } = await s.rpc('rsvp_por_admin', { p });
          if (error) throw errorSql6(error);
          return data;
        },
        async marcarRecordatorio(grupoId) {
          const s = await db();
          const ahora = new Date().toISOString();
          const { error } = await s.from('grupos').update({ recordatorio: ahora }).eq('id', grupoId);
          if (error) throw errorSql6(error);
          return ahora;
        },
        // Invitación enviada: uno o varios grupos (solo los que todavía no estaban marcados)
        async marcarEnviadas(ids) {
          const s = await db();
          const ahora = new Date().toISOString();
          const { error } = await s.from('grupos').update({ enviada_en: ahora }).in('id', ids).is('enviada_en', null);
          if (error) throw errorSql6(error);
          return ahora;
        },
        async fotos() {
          const s = await db();
          const { data, error } = await s.from('fotos').select('*').order('creado', { ascending: false }).limit(5000);
          if (error) throw traducirError(error);
          const rev = data.filter(f => f.ruta.startsWith('rev/'));
          let firmadas = {};
          if (rev.length) {
            const r = await s.storage.from('revision').createSignedUrls(rev.map(f => f.ruta), 3600 * 6);
            (r.data || []).forEach(x => { if (x.signedUrl) firmadas[x.path] = x.signedUrl; });
          }
          return data.map(f => Object.assign({}, f, {
            url: f.ruta.startsWith('rev/') ? firmadas[f.ruta] : urlPublica(f.ruta),
            urlOriginal: f.ruta_original ? urlPublica(f.ruta_original) : null
          }));
        },
        async actualizarFoto(id, cambios) {
          const s = await db();
          // Pasar de revisión a publicada mueve el archivo al bucket público
          if (cambios.estado === 'publicada') {
            const { data: f } = await s.from('fotos').select('*').eq('id', id).single();
            if (f && f.ruta.startsWith('rev/')) {
              const blob = (await s.storage.from('revision').download(f.ruta)).data;
              const nueva = 'pub/' + f.ruta.split('/').pop();
              const up = await s.storage.from('fotos').upload(nueva, blob, { contentType: 'image/jpeg', upsert: true });
              if (up.error) throw traducirError(up.error);
              cambios = Object.assign({}, cambios, { ruta: nueva });
            }
          }
          const { error } = await s.from('fotos').update(cambios).eq('id', id);
          if (error) throw traducirError(error);
        },
        /* ---- Fotos en revisión, por lote (solo admin: lo cuida la RLS de fotos y del almacenamiento) ---- */
        async contarRevision() {
          const s = await db();
          const { count, error } = await s.from('fotos').select('id', { count: 'exact', head: true }).eq('estado', 'revision');
          if (error) throw traducirError(error);
          return count || 0;
        },
        // Primero copia los archivos al bucket público y recién después publica de a una, de la más vieja a la más nueva:
        // así entran en orden a la cola del muro. Una foto que falla sigue en revisión y no frena a las demás.
        async publicarLote(ids, alProgreso) {
          const s = await db();
          const filas = [];
          for (let i = 0; i < ids.length; i += 100) {
            const { data, error } = await s.from('fotos').select('id,ruta,creado').eq('estado', 'revision').in('id', ids.slice(i, i + 100));
            if (error) throw traducirError(error);
            filas.push(...data);
          }
          filas.sort((a, b) => a.creado.localeCompare(b.creado));
          const listas = new Map();
          let n = 0, hechas = [];
          await Promise.all([0, 1, 2, 3].map(async () => {
            while (n < filas.length) {
              const f = filas[n++];
              try {
                if (!f.ruta.startsWith('rev/')) { listas.set(f.id, { ruta: f.ruta }); continue; }
                const baja = await s.storage.from('revision').download(f.ruta);
                if (baja.error) throw baja.error;
                const nueva = 'pub/' + f.ruta.split('/').pop();
                const up = await s.storage.from('fotos').upload(nueva, baja.data, { contentType: 'image/jpeg', upsert: true });
                if (up.error) throw up.error;
                listas.set(f.id, { ruta: nueva, copia: nueva });
              } catch (e) { console.warn('No se pudo copiar', f.id, e); }
              alProgreso && alProgreso(listas.size, filas.length);
            }
          }));
          for (const f of filas) {
            const l = listas.get(f.id);
            if (!l) continue;
            const { error } = await s.from('fotos').update({ estado: 'publicada', ruta: l.ruta }).eq('id', f.id).eq('estado', 'revision');
            if (error) console.warn('No se pudo publicar', f.id, error);
            else hechas.push({ id: f.id, ruta: f.ruta, copia: l.copia || null });
          }
          return { hechas, fallaron: ids.length - hechas.length };
        },
        // Descartar = oculta: el archivo no se toca y se puede recuperar desde el filtro "Ocultas"
        async descartarLote(ids) {
          const s = await db();
          const hechas = [];
          for (let i = 0; i < ids.length; i += 100) {
            const { data, error } = await s.from('fotos').update({ estado: 'oculta' }).eq('estado', 'revision').in('id', ids.slice(i, i + 100)).select('id,ruta');
            if (error) throw traducirError(error);
            data.forEach(f => hechas.push({ id: f.id, ruta: f.ruta, copia: null }));
          }
          return { hechas, fallaron: ids.length - hechas.length };
        },
        // Vuelve a revisión lo que hizo un lote. Pasa primero por "oculta": la pantalla no puede leer las filas en revisión
        // (y por eso no se enteraría del cambio), en cambio "oculta" sí le llega y saca la foto del muro al instante.
        async deshacerLote(hechas) {
          const s = await db();
          for (let i = 0; i < hechas.length; i += 100) {
            const { error } = await s.from('fotos').update({ estado: 'oculta' }).in('id', hechas.slice(i, i + 100).map(h => h.id));
            if (error) throw traducirError(error);
          }
          for (const h of hechas) {
            const { error } = await s.from('fotos').update({ estado: 'revision', ruta: h.ruta }).eq('id', h.id);
            if (error) throw traducirError(error);
          }
          const copias = hechas.map(h => h.copia).filter(Boolean);
          if (copias.length) { const r = await s.storage.from('fotos').remove(copias); if (r.error) console.warn('Quedó una copia pública', r.error); }
        },
        async actualizarPantalla(cambios) {
          const s = await db();
          const { error } = await s.from('pantalla_estado').update(cambios).eq('id', 1);
          if (error) throw /reproduccion|volumen|efectos|sonido_ts|informe/.test(error.message) ? errorSql4({ message: 'does not exist' }) : traducirError(error);
        },
        /* ---- Itinerario (solo admin) ---- */
        async itinerario() {
          const s = await db();
          const [a, b] = await Promise.all([
            s.from('itinerario').select('*').order('orden').order('creado'),
            s.from('itinerario_config').select('*').eq('id', 1).maybeSingle()
          ]);
          if (a.error || b.error) throw errorSql4(a.error || b.error);
          return { items: a.data, config: b.data || Object.assign({}, CONFIG_ITINERARIO) };
        },
        async guardarItem(it) {
          const s = await db();
          const fila = filaItem(it);
          const { data, error } = it.id ? await s.from('itinerario').update(fila).eq('id', it.id).select().single() : await s.from('itinerario').insert(fila).select().single();
          if (error) throw errorSql4(error);
          return data;
        },
        async borrarItem(id) {
          const s = await db();
          const { error } = await s.from('itinerario').delete().eq('id', id);
          if (error) throw errorSql4(error);
        },
        async guardarItinerarioConfig(c) {
          const s = await db();
          const { error } = await s.from('itinerario_config').upsert(Object.assign({ id: 1 }, c));
          if (error) throw errorSql4(error);
        },
        /* ---- Videos de la pantalla ---- */
        async guardarVideo(v) {
          const s = await db();
          const { error } = await s.from('videos').upsert(filaVideo(v));
          if (error) throw errorSql4(error);
        },
        async borrarVideo(id) {
          const s = await db();
          const { error } = await s.from('videos').delete().eq('id', id).eq('fijo', false);
          if (error) throw errorSql4(error);
        },
        async guardarEvento(cambios) {
          const s = await db();
          const { error } = await s.from('evento_config').update(Object.assign({}, cambios, { actualizado: new Date().toISOString() })).eq('id', 1);
          if (error) throw new Error(/evento_config/.test(error.message) ? 'Falta correr supabase/actualizacion-3.sql en Supabase' : error.message);
        },
        // Borra archivos de fotos (pub/, orig/, rev/) y después confirmaciones, filas de fotos y trivia.
        // No toca invitados ni preguntas de la trivia (ni sus imágenes en trivia/).
        async borrarDatosPrueba(alProgreso) {
          const s = await db();
          let borrados = 0;
          for (const [bucket, carpeta] of [['fotos', 'pub'], ['fotos', 'orig'], ['revision', 'rev']]) {
            for (;;) {
              const { data, error } = await s.storage.from(bucket).list(carpeta, { limit: 100 });
              if (error) throw traducirError(error);
              const rutas = (data || []).filter(o => o.id).map(o => carpeta + '/' + o.name);
              if (!rutas.length) break;
              const r = await s.storage.from(bucket).remove(rutas);
              if (r.error) throw traducirError(r.error);
              borrados += rutas.length;
              alProgreso && alProgreso(`Borrando archivos… ${borrados}`);
            }
          }
          const res = await rpc('borrar_datos_prueba');
          return Object.assign({ archivos: borrados }, res);
        },
        async preguntas() {
          const s = await db();
          const { data, error } = await s.from('trivia_preguntas').select('*').order('orden').order('creado');
          if (error) throw traducirError(error);
          return data;
        },
        async guardarPregunta(p) {
          const s = await db();
          const fila = { orden: p.orden, tipo: p.tipo || 'multiple', texto: p.texto, opciones: p.opciones, correcta: p.correcta, dato: p.dato || null, imagen: p.imagen || null, activa: p.activa !== false };
          const { error } = p.id ? await s.from('trivia_preguntas').update(fila).eq('id', p.id) : await s.from('trivia_preguntas').insert(fila);
          if (error) throw traducirError(error);
        },
        async borrarPregunta(id) {
          const s = await db();
          const { error } = await s.from('trivia_preguntas').delete().eq('id', id);
          if (error) throw traducirError(error);
        },
        controlTrivia: accion => rpc('trivia_control', { p_accion: accion }),
        async subirImagenTrivia(blob) {
          const ruta = 'trivia/' + crypto.randomUUID() + '.jpg';
          await subirArchivo('fotos', ruta, blob);
          return urlPublica(ruta);
        }
      }
    };
  }

  /* ======================= DEMO (local) ======================= */
  function backendDemo() {
    const CLAVE = 's60_demo_db';
    const canal = 'BroadcastChannel' in window ? new BroadcastChannel('s60demo') : null;
    const oyentes = new Set();
    function emitir(ev) { oyentes.forEach(f => f(ev)); }
    if (canal) canal.onmessage = e => emitir(e.data);
    function avisar(ev) { emitir(ev); if (canal) canal.postMessage(ev); }

    function semilla() {
      const ahora = new Date().toISOString();
      const p = (orden, texto, opciones, correcta, dato) => ({ id: crypto.randomUUID(), orden, tipo: 'multiple', texto, opciones, correcta, dato: dato || null, imagen: null, activa: true, creado: ahora });
      const vf = (orden, texto, verdadero, dato) => Object.assign(p(orden, texto, ['Verdadero', 'Falso'], verdadero ? 0 : 1, dato), { tipo: 'vf' });
      return {
        grupos: [
          { id: crypto.randomUUID(), slug: 'familia-gomez', nombres: 'Familia Gómez', cupo: 4, telefono: '2645123456', integrantes: 'Marta, Carlos, Sofi, Juan', creado: ahora },
          { id: crypto.randomUUID(), slug: 'tia-marta', nombres: 'Tía Marta y Tío Carlos', cupo: 2, telefono: '', creado: ahora }
        ],
        rsvps: [], fotos: [],
        pantalla: { id: 1, muro_pausado: false, modo: 'fotos', mensaje_manual: '', mensaje_ts: null, modo_prueba: false },
        evento: { id: 1, fecha_evento: C.fechaEvento, texto_puntual: C.textoPuntual, fecha_limite_rsvp: C.fechaLimiteRsvp },
        trivia_preguntas: [
          // las mismas 13 de supabase/actualizacion-3.sql
          p(1, '🎂 ¿En qué año nació Silvia?', ['1964', '1966', '1967', '1969'], 1),
          p(2, '🎬 ¿Cuál es su película favorita?', ['Esperando la carroza', 'La propuesta', 'La boda de mi mejor amigo', 'Diario de una pasión'], 1),
          p(3, '👩‍🏫 Si no hubiera sido docente, ¿qué le habría gustado ser?', ['Psicóloga 🧠', 'Abogada ⚖️', 'Astronauta 🚀', 'Contadora 📊'], 1),
          vf(4, '🚌 A los 5 años la atropelló un colectivo… ¡y salió ilesa!', true, '¡Así de fuerte es Silvia! 💪'),
          vf(5, '🎤 En la secundaria fue la cantante de la banda de sus compañeros de la ECLGS.', false),
          p(6, '🎸 ¿Cuál fue el primer recital al que fue?', ['Pedro y Pablo (1982)', 'Charly García (1984)', 'Miguel Mateos/Zas (1985)', 'Shakira (2025) 😂'], 0),
          p(7, '📻 El día que nació Silvia, ¿qué canción era la n.º 1 en las radios argentinas?', ['Strangers in the Night – Frank Sinatra', 'Yellow Submarine – The Beatles 🟡', 'Satisfaction – The Rolling Stones', 'Despacito – Luis Fonsi 😂'], 1),
          p(8, '🌍 Si pudiera festejar su cumpleaños en cualquier lugar del mundo, ¿dónde sería?', ['En París 🗼', 'En el Caribe 🏝️', 'En Nueva York 🗽', 'En San Juan, con su familia y amigos ❤️'], 3),
          vf(9, '🐱 Olivia, la reina de la casa, es una gata.', false, '¡Olivia es una caniche! 🐩'),
          p(10, '📺 ¿Cuál era el dibujito "sagrado" de su infancia, el que no se perdía por nada?', ['Heidi 🏔️', 'Tom y Jerry 🐱🐭', 'El Pájaro Loco 🐦', 'El Correcaminos 💨'], 1),
          p(11, '🤫 ¿Cuántos años cumple Silvia?', ['29 (otra vez) 😉', '39 y pico 🤭', '60 y divina ✨', 'Una dama no dice su edad 🤐'], 2),
          p(12, '⏳ ¿Cuántos días de vida lleva Silvia, más o menos?', ['Unos 8.500', 'Unos 15.000', 'Unos 21.900', 'Unos 30.000'], 2, '¡Más de 21.900 días! Y todos llenos de amor 💛'),
          vf(13, '❤️ Esta noche Silvia está rodeada de la gente que más quiere.', true, '¡Gracias por estar! 💛🥂')
        ],
        trivia_estado: { id: 1, partida: null, fase: 'apagada', pregunta_id: null, pregunta_num: 0, total: 0, inicio: null, duracion: C.trivia.segundos },
        trivia_jugadores: [], trivia_respuestas: []
      };
    }
    // Lo nuevo de la actualización 4 (itinerario, videos, control de la pantalla), también para demos ya guardados
    function completar(d) {
      if (!d.itinerario) {
        const ahora = new Date().toISOString();
        d.itinerario = ITINERARIO_INICIAL.map(([emoji, titulo, duracion, hora_fija, notas, boton], i) =>
          Object.assign({ id: crypto.randomUUID(), creado: ahora }, filaItem({ orden: i + 1, emoji, titulo, duracion, hora_fija, notas, boton })));
      }
      if (!d.itinerario_config) d.itinerario_config = Object.assign({}, CONFIG_ITINERARIO);
      if (!d.videos) d.videos = [];
      VIDEOS_FIJOS.forEach(v => { if (!d.videos.some(x => x.id === v.id)) d.videos.push(Object.assign({ creado: new Date().toISOString() }, v)); });
      d.pantalla = Object.assign({ reproduccion: null, volumen: 100, efectos: true, sonido_ts: null, informe: null }, d.pantalla);
      return d;
    }
    function leer() {
      try { const d = JSON.parse(localStorage.getItem(CLAVE)); if (d && d.grupos) return completar(d); } catch (e) {}
      const d = completar(semilla()); guardar(d); return d;
    }
    function guardar(d) { localStorage.setItem(CLAVE, JSON.stringify(d)); }
    function cambiar(fn) { const d = leer(); const r = fn(d); guardar(d); return r; }

    // Archivos en IndexedDB
    let idb = null;
    function abrirIdb() {
      if (idb) return idb;
      idb = new Promise((ok, mal) => {
        const r = indexedDB.open('s60demo', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('archivos');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => mal(r.error);
      });
      return idb;
    }
    async function idbPut(clave, blob) {
      const d = await abrirIdb();
      return new Promise((ok, mal) => { const t = d.transaction('archivos', 'readwrite'); t.objectStore('archivos').put(blob, clave); t.oncomplete = ok; t.onerror = () => mal(t.error); });
    }
    async function idbGet(clave) {
      const d = await abrirIdb();
      return new Promise((ok, mal) => { const r = d.transaction('archivos').objectStore('archivos').get(clave); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
    }
    const cacheUrls = new Map();
    async function urlDe(bucket, ruta) {
      const k = bucket + '/' + ruta;
      if (cacheUrls.has(k)) return cacheUrls.get(k);
      const blob = await idbGet(k);
      const u = blob ? URL.createObjectURL(blob) : '';
      if (u) cacheUrls.set(k, u);
      return u;
    }

    const espera = (ms = 120) => new Promise(r => setTimeout(r, ms));
    const err = m => { throw new Error(m); };
    const limpiar = (s, max) => String(s == null ? '' : s).trim().slice(0, max);

    function oyente(tabla, cb) {
      const f = ev => { if (ev.tabla === tabla) cb(ev); };
      oyentes.add(f);
      return () => oyentes.delete(f);
    }

    function sesionAdmin() { return S60.local.leer('demo_admin'); }
    function exigirAdmin() { if (!sesionAdmin()) err('No autorizado'); }

    function rsvpPublico(r) {
      if (!r) return null;
      const { grupo_id, id, ...resto } = r;
      return resto;
    }

    // como en la base real: el archivo vive donde dice su ruta (una descartada sigue en el bucket privado aunque esté "oculta")
    const bucketDe = f => f.ruta.startsWith('rev/') ? 'revision' : 'fotos';
    async function fotoPublica(f) {
      return { id: f.id, url: await urlDe(bucketDe(f), f.ruta), autor: f.autor, leyenda: f.leyenda, creado: f.creado, estado: f.estado };
    }

    function preguntasActivas(d) { return d.trivia_preguntas.filter(p => p.activa).sort((a, b) => a.orden - b.orden || a.creado.localeCompare(b.creado)); }
    function tiempoTerminado(e) { return e.inicio && Date.now() > new Date(e.inicio).getTime() + e.duracion * 1000; }
    function ranking(d, n) {
      return d.trivia_jugadores.filter(j => j.partida === d.trivia_estado.partida).sort((a, b) => b.puntos - a.puntos || a.creado.localeCompare(b.creado)).slice(0, n).map(j => ({ apodo: j.apodo, puntos: j.puntos }));
    }

    return {
      modoDemo: true,
      urlPublica: ruta => ruta,
      async obtenerGrupo(slug) {
        await espera();
        const g = leer().grupos.find(x => x.slug === String(slug || '').toLowerCase());
        return g ? { slug: g.slug, nombres: g.nombres, cupo: g.cupo, integrantes: String(g.integrantes || '').split(',').map(s => s.trim()).filter(Boolean) } : null;
      },
      async obtenerRsvp({ slug, token }) {
        await espera();
        const d = leer();
        const g = slug && d.grupos.find(x => x.slug === slug);
        const r = g ? d.rsvps.find(x => x.grupo_id === g.id) : (token ? d.rsvps.find(x => x.token === token) : null);
        return rsvpPublico(r);
      },
      async guardarRsvp(slug, token, datos) {
        await espera(300);
        if (!S60.rsvpAbierto()) err('La fecha para confirmar ya pasó. Comunicate directamente con la familia.');
        return cambiar(d => {
          const g = slug ? d.grupos.find(x => x.slug === slug) : null;
          if (slug && !g) err('Invitación no encontrada');
          const cupo = g ? g.cupo : 10;
          const asiste = ['si', 'no', 'nose'].includes(datos.asiste) ? datos.asiste : err('Elegí si vienen o no');
          const cantidad = asiste === 'si' ? Math.max(1, Math.min(cupo, parseInt(datos.cantidad, 10) || 1)) : 0;
          if (asiste === 'si' && parseInt(datos.cantidad, 10) > cupo) err(`El máximo para esta invitación es ${cupo}`);
          if (!g && !limpiar(datos.nombre_contacto, 120)) err('Contanos tu nombre');
          if ((datos.canciones || []).length > 2) err('Podés sumar hasta 2 canciones');
          const fila = {
            asiste, cantidad,
            nombre_contacto: limpiar(datos.nombre_contacto, 120),
            nombres_asistentes: limpiar(datos.nombres_asistentes, 400),
            menu: ['ninguno', 'vegetariano', 'celiaco', 'otro'].includes(datos.menu) ? datos.menu : 'ninguno',
            menu_detalle: limpiar(datos.menu_detalle, 200),
            canciones: (datos.canciones || []).slice(0, 2).map(c => ({ tema: limpiar(c.tema, 100), artista: limpiar(c.artista, 100) })).filter(c => c.tema),
            mensaje: limpiar(datos.mensaje, 600),
            mostrar_mensaje: datos.mostrar_mensaje !== false,
            origen: 'invitado',
            actualizado: new Date().toISOString()
          };
          let r = g ? d.rsvps.find(x => x.grupo_id === g.id) : (token ? d.rsvps.find(x => x.token === token && !x.grupo_id) : null);
          if (r) Object.assign(r, fila);
          else { r = Object.assign({ id: crypto.randomUUID(), token: crypto.randomUUID(), grupo_id: g ? g.id : null, creado: fila.actualizado }, fila); d.rsvps.push(r); }
          return { token: r.token };
        });
      },
      async permiteOriginal() {
        const total = leer().fotos.reduce((a, f) => a + (f.bytes || 0), 0);
        return total < C.fotos.espacioOriginalesMB * 1048576;
      },
      async subirArchivo(bucket, ruta, blob, alProgreso) {
        for (let i = 1; i <= 5; i++) { await espera(80); alProgreso && alProgreso(i / 5); }
        if (S60.local.leer('demo_falla_red')) { S60.local.borrar('demo_falla_red'); err('Sin conexión'); }
        await idbPut(bucket + '/' + ruta, blob);
      },
      async registrarFoto(p) {
        await espera();
        const r = cambiar(d => {
          const haceUnaHora = Date.now() - 3600e3;
          const recientes = d.fotos.filter(f => f.dispositivo === p.dispositivo && new Date(f.creado).getTime() > haceUnaHora).length;
          if (recientes >= C.fotos.limitePorHora) err('Llegaste al límite de fotos por hora. ¡Probá en un ratito!');
          if (d.fotos.some(f => f.id === p.id)) err('Esa foto ya estaba subida');
          const f = {
            id: p.id || crypto.randomUUID(), ruta: p.ruta, ruta_original: p.ruta_original || null, bytes: p.bytes || 0,
            autor: limpiar(p.autor, 40) || 'Invitado', leyenda: limpiar(p.leyenda, C.fotos.leyendaMax) || null,
            estado: p.bloqueada ? 'revision' : 'publicada', favorita: false, dispositivo: p.dispositivo, puntajes: p.puntajes || null,
            creado: new Date().toISOString()
          };
          d.fotos.push(f);
          return f;
        });
        avisar({ tabla: 'fotos', tipo: 'INSERT', fila: r });   // la pantalla ignora las que no están publicadas; el panel las cuenta
        return { id: r.id, estado: r.estado };
      },
      async adjuntarOriginal(id, ruta, bytes, dispositivo) {
        cambiar(d => {
          const f = d.fotos.find(x => x.id === id && x.dispositivo === dispositivo && !x.ruta_original);
          if (f) { f.ruta_original = ruta; f.bytes += bytes; }
        });
      },
      async fotosPublicas() {
        const fs = leer().fotos.filter(f => f.estado === 'publicada');
        return Promise.all(fs.map(fotoPublica));
      },
      escucharFotos(cb, alEstado) {
        setTimeout(() => alEstado && alEstado(true), 50);
        return oyente('fotos', async ev => cb({ tipo: ev.tipo, foto: await fotoPublica(ev.fila) }));
      },
      async mensajesPantalla() {
        const d = leer();
        return d.rsvps.filter(r => r.mostrar_mensaje && r.mensaje).map(r => {
          const g = d.grupos.find(x => x.id === r.grupo_id);
          return { texto: r.mensaje, autor: r.nombre_contacto || (g ? g.nombres : '') };
        });
      },
      async pantalla() { return leer().pantalla; },
      async evento() { return leer().evento || null; },
      escucharPantalla(cb, alEstado) { setTimeout(() => alEstado && alEstado(true), 50); return oyente('pantalla_estado', ev => cb(ev.fila)); },
      async videos() { return leer().videos.slice().sort((a, b) => a.orden - b.orden || a.creado.localeCompare(b.creado)); },
      async informarPantalla(p) {
        const fila = cambiar(d => Object.assign(d.pantalla, { informe: { videos: p.videos || [], reproduciendo: p.reproduciendo || null, audio: p.audio || null, ts: new Date().toISOString() } }));
        avisar({ tabla: 'pantalla_estado', tipo: 'UPDATE', fila });
      },
      trivia: {
        async estado() { return leer().trivia_estado; },
        escuchar(cb, alEstado) { setTimeout(() => alEstado && alEstado(true), 50); return oyente('trivia_estado', ev => cb(ev.fila)); },
        async preguntaActual() {
          const d = leer(), e = d.trivia_estado;
          const p = d.trivia_preguntas.find(x => x.id === e.pregunta_id);
          if (!p || !['pregunta', 'resultado', 'ranking'].includes(e.fase)) return { fase: e.fase, partida: e.partida, total: e.total, ahora: new Date().toISOString() };
          const terminado = e.fase !== 'pregunta' || tiempoTerminado(e);
          return {
            fase: e.fase, partida: e.partida, id: p.id, num: e.pregunta_num, total: e.total, tipo: p.tipo || 'multiple', texto: p.texto, opciones: p.opciones, imagen: p.imagen,
            duracion: e.duracion, inicio: e.inicio, ahora: new Date().toISOString(), correcta: terminado ? p.correcta : null, dato: terminado ? (p.dato || null) : null
          };
        },
        async unirse(apodo) {
          await espera();
          return cambiar(d => {
            const e = d.trivia_estado;
            if (!e.partida || e.fase === 'apagada') err('La trivia todavía no empezó');
            let a = limpiar(apodo, 20) || err('Elegí un apodo');
            if (S60.tieneMalasPalabras(a)) err('Elegí otro apodo, porfa 🙂');
            const usados = d.trivia_jugadores.filter(j => j.partida === e.partida).map(j => j.apodo.toLowerCase());
            let final = a, n = 2;
            while (usados.includes(final.toLowerCase())) final = a + ' ' + n++;
            const j = { id: crypto.randomUUID(), partida: e.partida, token: crypto.randomUUID(), apodo: final, puntos: 0, creado: new Date().toISOString() };
            d.trivia_jugadores.push(j);
            setTimeout(() => avisar({ tabla: 'trivia_jugadores', tipo: 'INSERT', fila: {} }), 0);
            return { token: j.token, apodo: j.apodo, partida: j.partida };
          });
        },
        async responder(token, preguntaId, opcion) {
          await espera(150);
          return cambiar(d => {
            const e = d.trivia_estado;
            const j = d.trivia_jugadores.find(x => x.token === token && x.partida === e.partida) || err('Tenés que volver a entrar con tu apodo');
            if (e.fase !== 'pregunta' || e.pregunta_id !== preguntaId) err('Esa pregunta ya cerró');
            const ms = Date.now() - new Date(e.inicio).getTime();
            if (ms > e.duracion * 1000 + 1000) err('¡Se terminó el tiempo!');
            if (d.trivia_respuestas.some(r => r.jugador_id === j.id && r.pregunta_id === preguntaId)) err('Ya respondiste esta pregunta');
            const p = d.trivia_preguntas.find(x => x.id === preguntaId);
            if (!(opcion >= 0 && opcion < p.opciones.length)) err('Opción inválida');
            const correcta = p.correcta === opcion;
            const puntos = puntosPorRespuesta(correcta, ms, e.duracion);
            d.trivia_respuestas.push({ jugador_id: j.id, pregunta_id: preguntaId, partida: e.partida, opcion, correcta, puntos, ms });
            j.puntos += puntos;
            setTimeout(() => avisar({ tabla: 'trivia_respuestas', tipo: 'INSERT', fila: {} }), 0);
            return { ok: true };
          });
        },
        async resultados() {
          const d = leer(), e = d.trivia_estado;
          const p = d.trivia_preguntas.find(x => x.id === e.pregunta_id);
          const rs = d.trivia_respuestas.filter(r => r.pregunta_id === e.pregunta_id && r.partida === e.partida);
          if (!p) return null;
          if (e.fase === 'pregunta' && !tiempoTerminado(e)) return { respondieron: rs.length, correcta: null };
          const conteos = [0, 0, 0, 0];
          rs.forEach(r => conteos[r.opcion]++);
          return { correcta: p.correcta, conteos, respondieron: rs.length, tipo: p.tipo || 'multiple', dato: p.dato || null };
        },
        async ranking(n) { return ranking(leer(), n || 5); },
        async miEstado(token) {
          const d = leer(), e = d.trivia_estado;
          const j = d.trivia_jugadores.find(x => x.token === token);
          if (!j || j.partida !== e.partida) return null;
          const todos = d.trivia_jugadores.filter(x => x.partida === e.partida).sort((a, b) => b.puntos - a.puntos || a.creado.localeCompare(b.creado));
          const ult = d.trivia_respuestas.find(r => r.jugador_id === j.id && r.pregunta_id === e.pregunta_id);
          return { apodo: j.apodo, puntos: j.puntos, posicion: todos.indexOf(j) + 1, jugadores: todos.length, ultima: ult ? { correcta: ult.correcta, puntos: ult.puntos, opcion: ult.opcion } : null };
        },
        async cantidadJugadores() { const d = leer(); return d.trivia_jugadores.filter(j => j.partida === d.trivia_estado.partida).length; },
        async apodos() { const d = leer(); return d.trivia_jugadores.filter(j => j.partida === d.trivia_estado.partida).slice(-60).map(j => j.apodo); }
      },
      admin: {
        async login(email, clave) { await espera(300); if (clave !== 'demo') err('En modo demo la contraseña es: demo'); S60.local.guardar('demo_admin', { email }); },
        async logout() { S60.local.borrar('demo_admin'); },
        async sesion() { return sesionAdmin(); },
        async grupos() { exigirAdmin(); return leer().grupos.slice().sort((a, b) => a.nombres.localeCompare(b.nombres)); },
        async guardarGrupo(g) {
          exigirAdmin();
          cambiar(d => {
            if (!/^[a-z0-9-]{3,60}$/.test(g.slug)) err('El link solo puede tener minúsculas, números y guiones');
            if (d.grupos.some(x => x.slug === g.slug && x.id !== g.id)) err('Ese link (slug) ya existe');
            if (g.id) Object.assign(d.grupos.find(x => x.id === g.id), { slug: g.slug, nombres: g.nombres, cupo: g.cupo, telefono: g.telefono || '', integrantes: g.integrantes || '' });
            else d.grupos.push({ id: crypto.randomUUID(), slug: g.slug, nombres: g.nombres, cupo: g.cupo, telefono: g.telefono || '', integrantes: g.integrantes || '', creado: new Date().toISOString() });
          });
        },
        async borrarGrupo(id) { exigirAdmin(); cambiar(d => { d.grupos = d.grupos.filter(g => g.id !== id); d.rsvps = d.rsvps.filter(r => r.grupo_id !== id); }); },
        // Igual que supabase rsvp_por_admin (actualizacion-6.sql)
        async confirmarPorEllos(p) {
          exigirAdmin();
          await espera(200);
          return cambiar(d => {
            const g = d.grupos.find(x => x.id === p.grupo_id) || err('Familia no encontrada');
            const asiste = ['si', 'no', 'nose'].includes(p.asiste) ? p.asiste : err('Elegí si vienen o no');
            const cantidad = asiste === 'si' ? Math.max(1, parseInt(p.cantidad, 10) || 1) : 0;
            if (cantidad > g.cupo) err(`El máximo para esta familia es ${g.cupo}`);
            const ahora = new Date().toISOString();
            const fila = { asiste, cantidad, nombres_asistentes: asiste === 'si' ? limpiar(p.nombres_asistentes, 400) : null,
              canciones: (p.canciones || []).slice(0, 2).map(c => ({ tema: limpiar(c.tema, 100), artista: limpiar(c.artista, 100) })).filter(c => c.tema),
              nota_interna: limpiar(p.nota_interna, 500) || null, origen: 'panel', cargado_por: limpiar(p.por, 40) || 'el panel', cargado_en: ahora, actualizado: ahora };
            let r = d.rsvps.find(x => x.grupo_id === g.id);
            if (r) Object.assign(r, fila);
            else { r = Object.assign({ id: crypto.randomUUID(), token: crypto.randomUUID(), grupo_id: g.id, nombre_contacto: null, menu: 'ninguno', mensaje: null, mostrar_mensaje: true, creado: ahora }, fila); d.rsvps.push(r); }
            return { id: r.id, token: r.token };
          });
        },
        async marcarRecordatorio(grupoId) {
          exigirAdmin();
          const ahora = new Date().toISOString();
          cambiar(d => { const g = d.grupos.find(x => x.id === grupoId); if (g) g.recordatorio = ahora; });
          return ahora;
        },
        async marcarEnviadas(ids) {
          exigirAdmin();
          const ahora = new Date().toISOString();
          cambiar(d => d.grupos.forEach(g => { if (ids.includes(g.id) && !g.enviada_en) g.enviada_en = ahora; }));
          return ahora;
        },
        async rsvps() {
          exigirAdmin();
          const d = leer();
          return d.rsvps.map(r => Object.assign({ origen: 'invitado' }, r, { grupo: (g => g ? { id: g.id, slug: g.slug, nombres: g.nombres, cupo: g.cupo, integrantes: g.integrantes || '', telefono: g.telefono || '' } : null)(d.grupos.find(g => g.id === r.grupo_id)) }))
            .sort((a, b) => b.actualizado.localeCompare(a.actualizado));
        },
        async fotos() {
          exigirAdmin();
          const fs = leer().fotos.slice().reverse();
          return Promise.all(fs.map(async f => Object.assign({}, f, {
            url: await urlDe(bucketDe(f), f.ruta),
            urlOriginal: f.ruta_original ? await urlDe('fotos', f.ruta_original) : null
          })));
        },
        async actualizarFoto(id, cambios) {
          exigirAdmin();
          if (cambios.estado === 'publicada') {
            const f = leer().fotos.find(x => x.id === id);
            if (f && f.ruta.startsWith('rev/')) {
              const blob = await idbGet('revision/' + f.ruta);
              const nueva = 'pub/' + f.ruta.split('/').pop();
              await idbPut('fotos/' + nueva, blob);
              cambios = Object.assign({}, cambios, { ruta: nueva });
            }
          }
          const f = cambiar(d => { const f = d.fotos.find(x => x.id === id); Object.assign(f, cambios); return f; });
          avisar({ tabla: 'fotos', tipo: 'UPDATE', fila: f });
        },
        async contarRevision() { exigirAdmin(); return leer().fotos.filter(f => f.estado === 'revision').length; },
        async publicarLote(ids, alProgreso) {
          exigirAdmin();
          const filas = leer().fotos.filter(f => ids.includes(f.id) && f.estado === 'revision').sort((a, b) => a.creado.localeCompare(b.creado));
          const hechas = [];
          for (const f of filas) {
            await espera(60);
            const r = f.ruta;
            if (S60.local.leer('demo_falla_lote') === f.id) { S60.local.borrar('demo_falla_lote'); continue; }
            await this.actualizarFoto(f.id, { estado: 'publicada' });
            hechas.push({ id: f.id, ruta: r, copia: 'pub/' + r.split('/').pop() });
            alProgreso && alProgreso(hechas.length, filas.length);
          }
          return { hechas, fallaron: ids.length - hechas.length };
        },
        async descartarLote(ids) {
          exigirAdmin();
          const filas = leer().fotos.filter(f => ids.includes(f.id) && f.estado === 'revision');
          for (const f of filas) await this.actualizarFoto(f.id, { estado: 'oculta' });
          return { hechas: filas.map(f => ({ id: f.id, ruta: f.ruta, copia: null })), fallaron: ids.length - filas.length };
        },
        async deshacerLote(hechas) {
          exigirAdmin();
          // igual que en la base real: la pantalla se entera por el paso a "oculta"
          for (const h of hechas) await this.actualizarFoto(h.id, { estado: 'oculta' });
          cambiar(d => { hechas.forEach(h => Object.assign(d.fotos.find(x => x.id === h.id), { estado: 'revision', ruta: h.ruta })); });
        },
        async actualizarPantalla(cambios) {
          exigirAdmin();
          const p = cambiar(d => Object.assign(d.pantalla, cambios));
          avisar({ tabla: 'pantalla_estado', tipo: 'UPDATE', fila: p });
        },
        async guardarEvento(cambios) {
          exigirAdmin();
          cambiar(d => { d.evento = Object.assign(d.evento || {}, cambios); });
        },
        async itinerario() {
          exigirAdmin();
          const d = leer();
          return { items: d.itinerario.slice().sort((a, b) => a.orden - b.orden || a.creado.localeCompare(b.creado)), config: Object.assign({}, d.itinerario_config) };
        },
        async guardarItem(it) {
          exigirAdmin();
          return cambiar(d => {
            const fila = filaItem(it);
            if (it.id) return Object.assign(d.itinerario.find(x => x.id === it.id), fila);
            const nuevo = Object.assign({ id: crypto.randomUUID(), creado: new Date().toISOString() }, fila);
            d.itinerario.push(nuevo);
            return nuevo;
          });
        },
        async borrarItem(id) { exigirAdmin(); cambiar(d => { d.itinerario = d.itinerario.filter(x => x.id !== id); }); },
        async guardarItinerarioConfig(c) { exigirAdmin(); cambiar(d => { Object.assign(d.itinerario_config, c); }); },
        async guardarVideo(v) {
          exigirAdmin();
          cambiar(d => {
            const fila = filaVideo(v);
            const e = d.videos.find(x => x.id === v.id);
            if (e) Object.assign(e, fila); else d.videos.push(Object.assign({ creado: new Date().toISOString() }, fila));
          });
        },
        async borrarVideo(id) { exigirAdmin(); cambiar(d => { d.videos = d.videos.filter(x => x.id !== id || x.fijo); }); },
        async borrarDatosPrueba() {
          exigirAdmin();
          const r = cambiar(d => {
            const res = { rsvps: d.rsvps.length, fotos: d.fotos.length, jugadores: d.trivia_jugadores.length, archivos: d.fotos.length };
            d.rsvps = []; d.fotos = []; d.trivia_jugadores = []; d.trivia_respuestas = [];
            Object.assign(d.trivia_estado, { partida: null, fase: 'apagada', pregunta_id: null, pregunta_num: 0, total: 0, inicio: null });
            Object.assign(d.pantalla, { muro_pausado: false, modo: 'fotos', mensaje_manual: '' });
            return res;
          });
          avisar({ tabla: 'pantalla_estado', tipo: 'UPDATE', fila: leer().pantalla });
          avisar({ tabla: 'trivia_estado', tipo: 'UPDATE', fila: leer().trivia_estado });
          return r;
        },
        async preguntas() { exigirAdmin(); return leer().trivia_preguntas.slice().sort((a, b) => a.orden - b.orden || a.creado.localeCompare(b.creado)); },
        async guardarPregunta(p) {
          exigirAdmin();
          cambiar(d => {
            const fila = { orden: p.orden, tipo: p.tipo || 'multiple', texto: p.texto, opciones: p.opciones, correcta: p.correcta, dato: p.dato || null, imagen: p.imagen || null, activa: p.activa !== false };
            if (p.id) Object.assign(d.trivia_preguntas.find(x => x.id === p.id), fila);
            else d.trivia_preguntas.push(Object.assign({ id: crypto.randomUUID(), creado: new Date().toISOString() }, fila));
          });
        },
        async borrarPregunta(id) { exigirAdmin(); cambiar(d => { d.trivia_preguntas = d.trivia_preguntas.filter(p => p.id !== id); }); },
        async controlTrivia(accion) {
          exigirAdmin();
          let pantallaCambio = null;
          const e = cambiar(d => {
            const e = d.trivia_estado;
            const ps = preguntasActivas(d);
            if (accion === 'abrir') {
              Object.assign(e, { partida: crypto.randomUUID(), fase: 'lobby', pregunta_id: null, pregunta_num: 0, total: ps.length, inicio: null, duracion: C.trivia.segundos });
              d.pantalla.modo = 'trivia'; pantallaCambio = d.pantalla;
            } else if (accion === 'siguiente') {
              if (!e.partida) err('Primero abrí la trivia');
              if (e.pregunta_num >= ps.length) Object.assign(e, { fase: 'podio' });
              else { const p = ps[e.pregunta_num]; Object.assign(e, { fase: 'pregunta', pregunta_id: p.id, pregunta_num: e.pregunta_num + 1, total: ps.length, inicio: new Date().toISOString() }); }
            } else if (accion === 'revelar') e.fase = 'resultado';
            else if (accion === 'ranking') e.fase = 'ranking';
            else if (accion === 'terminar') e.fase = 'podio';
            else if (accion === 'cerrar') { e.fase = 'apagada'; d.pantalla.modo = 'fotos'; pantallaCambio = d.pantalla; }
            else err('Acción desconocida');
            // Podio sin jugadores = trivia apagada y muro de fotos (igual que en la base real)
            if (e.fase === 'podio' && !d.trivia_jugadores.some(j => j.partida === e.partida)) {
              e.fase = 'apagada'; d.pantalla.modo = 'fotos'; pantallaCambio = d.pantalla;
            }
            e.actualizado = new Date().toISOString();
            return e;
          });
          avisar({ tabla: 'trivia_estado', tipo: 'UPDATE', fila: e });
          if (pantallaCambio) avisar({ tabla: 'pantalla_estado', tipo: 'UPDATE', fila: pantallaCambio });
          return e;
        },
        async subirImagenTrivia(blob) {
          const ruta = 'trivia/' + crypto.randomUUID() + '.jpg';
          await idbPut('fotos/' + ruta, blob);
          return 'idb:' + ruta;
        }
      },
      // Solo demo: resolver imágenes de trivia guardadas en IndexedDB
      resolverImagen: async src => (src && src.startsWith('idb:')) ? urlDe('fotos', src.slice(4)) : src,
      reiniciarDemo() { localStorage.removeItem(CLAVE); }
    };
  }

  const Datos = C.modoDemo ? backendDemo() : backendSupabase();
  if (!Datos.resolverImagen) Datos.resolverImagen = async src => src;
  Datos.puntosPorRespuesta = puntosPorRespuesta;
  window.Datos = Datos;
})();
