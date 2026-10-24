# Silvia 60 · Guía paso a paso

Esta guía está pensada para alguien que no es programador. Seguí los pasos en orden. Tardás, en total, alrededor de **una hora**.

> Mientras no hagas los pasos 1 a 4, el sitio funciona en **MODO DEMO** (arriba aparece una franja que lo avisa): se puede mirar y probar todo, pero los datos quedan solo en tu navegador.

---

## Qué hay en esta carpeta

| Archivo / carpeta | Para qué sirve |
|---|---|
| `index.html` | La invitación (tipo historia de Instagram) |
| `fotos/` | Página para que los invitados saquen y suban fotos |
| `pantalla/` | Lo que se proyecta en el salón |
| `trivia/` | Donde los invitados juegan desde el celular |
| `panel/` | Tu panel de administración |
| `config.js` | **El único archivo con datos del evento** (fecha, lugar, textos, claves) |
| `assets/` | Imágenes: foto de Silvia, vista previa de WhatsApp, modelo del filtro |
| `supabase/esquema.sql` | La base de datos (se pega una sola vez en Supabase) |
| `herramientas/imagen-og.html` | Genera la imagen que aparece al mandar el link por WhatsApp |
| `invitados-ejemplo.csv` | Ejemplo para cargar invitados desde Excel |
| `.claude/` | Cosas de prueba mías. **No hace falta subirla.** |

---

## Paso 1 · Crear la base de datos en Supabase (gratis)

1. Entrá a **supabase.com** → **Start your project** → creá una cuenta (podés entrar con tu cuenta de GitHub o con tu email).
2. Tocá **New project**:
   - **Name:** `silvia60`
   - **Database password:** inventá una y guardala (no la vas a necesitar seguido).
   - **Region:** elegí **South America (São Paulo)**, que es la más cercana.
   - Plan: **Free**. Tocá **Create new project** y esperá 1–2 minutos.

## Paso 2 · Cargar la estructura de la base

1. Abrí el archivo `supabase/esquema.sql` con el Bloc de notas.
2. Buscá la línea que dice `TU-EMAIL@ejemplo.com` y poné **tu email** (el que vas a usar para entrar al panel). Guardá.
3. En Supabase, menú de la izquierda → **SQL Editor** → **New query**.
4. Copiá **todo** el contenido del archivo, pegalo y tocá **Run**.
5. Tiene que decir **Success**. Si dice error, copiame el mensaje y lo vemos.

## Paso 3 · Crear tu usuario de administrador

1. Menú izquierdo → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Poné **el mismo email del paso 2** y una contraseña. Marcá **Auto Confirm User**. Tocá **Create user**.
3. Ahora cerrá la puerta a desconocidos: **Authentication** → **Sign In / Providers** (o **Providers → Email**) → desactivá **Allow new users to sign up** → **Save**.
   (Aunque alguien se registrara, no podría entrar al panel: solo funciona tu email. Pero así queda más prolijo).

## Paso 4 · Conectar el sitio con Supabase

1. En Supabase: **Project Settings** (el engranaje) → **Data API** (o **API**).
2. Copiá dos cosas:
   - **Project URL** (algo como `https://abcdxyz.supabase.co`)
   - La clave **anon public** (o **publishable**). Es larga.
3. Abrí `config.js` con el Bloc de notas y pegalas acá:
   ```js
   supabase: {
     url: 'https://abcdxyz.supabase.co',
     anonKey: 'la-clave-larga'
   }
   ```
4. ⚠️ **Nunca** pegues la clave **service_role** / **secret**. Esa es privada. La `anon` sí puede estar en la web: la seguridad la ponen las reglas de la base (el paso 2).

## Paso 5 · Publicar el sitio en GitHub Pages (gratis)

1. Entrá a **github.com** y creá una cuenta (si no tenés).
2. Arriba a la derecha **+** → **New repository**:
   - **Repository name:** `silvia60`
   - **Public** ✔ → **Create repository**.
3. En la página nueva tocá **uploading an existing file**.
4. Abrí esta carpeta en el Explorador de Windows, seleccioná **todo menos la carpeta `.claude`** y arrastralo a la página. Esperá que termine de subir (el modelo del filtro pesa ~2,6 MB). Abajo tocá **Commit changes**.
5. Ahora: **Settings** → **Pages** → en **Branch** elegí `main` y `/ (root)` → **Save**.
6. A los 1–2 minutos, arriba aparece tu dirección: `https://fntapia.github.io/silvia60/`. ¡Ese es el sitio!
7. Último detalle, para que WhatsApp muestre la imagen linda al compartir: en GitHub abrí `index.html` → el lápiz (✏️ Edit) → reemplazá las dos apariciones de `https://fntapia.github.io/silvia60/` por tu dirección real → **Commit changes**. Hacé lo mismo en `fotos/index.html` y `trivia/index.html` (una línea cada uno).

> Para cambiar cualquier archivo más adelante: abrilo en GitHub → ✏️ → cambiá → **Commit changes**. En 1–2 minutos se actualiza el sitio.

---

## Tus tareas pendientes

### ✔ Fotos de Silvia (ya cargadas)
Están en `assets`, sin fondo y optimizadas (WebP con transparencia, ~70 KB cada una): `silvia-portada.webp` (portada), `silvia-retrato.webp` (cierre «ahora» e imagen de WhatsApp) y `silvia-nina.webp` (cierre «antes»). Los PNG originales siguen en `02 Fotos Silvia/sin-fondo`. Para cambiar una, pedime que la convierta, o reemplazá el archivo con el mismo nombre y formato.

### ✔ Imagen para WhatsApp (ya generada)
`assets/og.jpg` ya tiene el retrato. Si cambiás la foto, abrí `.../silvia60/herramientas/imagen-og.html` → **Descargar og.jpg** → subila a `assets` reemplazando la anterior.
WhatsApp guarda la vista previa un tiempo: si al probar ves la vieja, agregá `?v=2` al final del link.

### ☐ Link exacto del mapa
En Google Maps buscá el salón → **Compartir** → **Copiar vínculo** → pegalo en `config.js`, en `mapsUrl: ''` (entre las comillas). Si lo dejás vacío, busca la dirección escrita.

### ☐ Invitados
Entrá a `.../silvia60/panel/` con tu email y contraseña → **Invitados**:
- De a uno: escribí los nombres a mostrar (ej. «Familia Gómez»), el cupo y el teléfono. El link se arma solo (con 4 letras al azar al final para que nadie adivine el de otra familia).
- Todos juntos desde Excel: completá `07 Invitados/invitados.csv` (columnas **slug; nombres_a_mostrar; cupo; telefono; notas**, separadas por `;`). Dejá el **slug vacío** y se genera solo; la fila `familia-ejemplo` se ignora. Después, en el panel, **Importar CSV** y elegí ese archivo. Si importás dos veces, los que ya estaban se saltean.
- Botón **WhatsApp** de cada grupo: abre WhatsApp con el mensaje y su link personal listos para mandar. El texto del mensaje se cambia en `config.js` (`mensajeWhatsApp`).
- El link general (sin `?i=`) también sirve: pide nombre y cantidad.

### ☐ Preguntas de la trivia
Panel → **Trivia** → hay 5 de ejemplo. Editalas con las respuestas reales y agregá hasta 10–15. Podés poner una foto en cada pregunta.

### ☐ (Opcional) Música de fondo
Subí un archivo `musica.mp3` a `assets` y en `config.js` poné `musicaUrl: 'assets/musica.mp3'`. Aparece un botón ♪ (apagado hasta que el invitado lo toca). Usá música libre de derechos.

### ☐ (Opcional) Link corto para la pantalla
Si creás un link corto (por ejemplo en bit.ly apuntando a `.../silvia60/fotos/`), ponelo en `linkCortoTexto` en `config.js` para que se lea mejor debajo del QR.

---

## ⚠️ Muy importante: Supabase gratis "se duerme"

El plan gratis **pausa el proyecto si pasa 1 semana sin uso**. Entre el 20/11 (cierre de confirmaciones) y el 5/12 puede pasar.
**Entrá al panel al menos una vez por semana**, y sí o sí **2 o 3 días antes de la fiesta**. Si alguna vez está pausado, en supabase.com aparece el botón **Restore project** (tarda unos minutos).

---

## Prueba general (hacela una semana antes)

1. Abrí la invitación con un link de un grupo y confirmá. Fijate que aparezca en el panel → **Confirmaciones**.
2. En el celular abrí `.../silvia60/fotos/?prueba=1` (el `?prueba=1` habilita las fotos antes del día) y subí 2 fotos.
3. En la notebook del salón abrí `.../silvia60/pantalla/`: tienen que aparecer.
4. Panel → **Fotos** → ocultá una: desaparece de la pantalla.
5. Panel → **Trivia** → **Abrir trivia** → sumate desde 2 celulares → **Primera pregunta**…
6. Al terminar, borrá lo de prueba: en Supabase → **Table Editor** → tablas `fotos`, `rsvps`, `trivia_jugadores` → seleccioná las filas de prueba → **Delete**. (Las fotos de prueba también podés borrarlas en **Storage**.)

---

## El día de la fiesta

**En la notebook del salón (la que va al proyector o TV):**
1. Enchufala a la corriente. En Windows: **Configuración → Sistema → Energía** → que la pantalla y la suspensión estén en **Nunca**.
2. Conectala a internet: si el salón no tiene buen Wi-Fi, usá un celular con **datos compartidos** (hotspot). Llevá uno de respaldo.
3. Abrí Chrome en `https://fntapia.github.io/silvia60/pantalla/`, tocá la pantalla y apretá **F11** (pantalla completa).
4. En tu celular dejá abierto el **panel** para ocultar fotos, pausar el muro, mostrar mensajes («¡En 5 minutos la torta! 🎂») y manejar la trivia.

**Si se corta internet:**
- La pantalla **sigue mostrando** las fotos que ya cargó y arriba dice «Reconectando…». Cuando vuelve internet, se pone al día sola. No hay que tocar nada.
- Los celulares reintentan subir solos 3 veces y, si no pueden, muestran el botón **Reintentar**.
- Si algo queda trabado: en la notebook apretá **F5** (recargar) y después **F11**.

**Para la trivia:** Panel → Trivia → **Abrir trivia** (la pantalla muestra el QR) → esperá que se sumen → **Primera pregunta**. La respuesta y el top 5 aparecen solos a los 20 segundos. **Siguiente pregunta**… → **Terminar juego** (podio con lluvia dorada) → **Volver a las fotos**.

**Al otro día:** Panel → **Fotos** → **Todas (ZIP)** para descargar todo en buena calidad (si son muchas, baja en varias partes).

---

## El filtro automático de fotos: qué hace y qué no

Cada foto se revisa **en el celular del invitado, antes de subirse**, con una IA gratuita (nsfwjs). Si detecta contenido sexual o desnudos, la foto **no se publica**: queda en **Fotos → En revisión** (solo vos la ves) y al invitado le aparece «Esta foto no pasó el filtro automático».

**Detecta bien:** desnudos, pornografía, dibujos sexuales, poses muy provocativas.

**NO detecta:** gestos obscenos (el dedo del medio), textos o carteles ofensivos dentro de la foto, violencia, armas, drogas, ni burlas. Tampoco es infalible: alguna foto en malla o con mucha piel puede ir a revisión sin motivo (la aprobás desde el panel con **Aprobar**).

Las leyendas y los nombres sí pasan por un filtro de malas palabras.

**Por eso el respaldo es tu panel:** botón **Ocultar** en cada foto (desaparece de la pantalla al instante) y **⏸ Pausar muro** para frenar todo. Sugerencia: que alguien de confianza tenga el panel abierto en el celular durante la fiesta.

### Filtro extra (opcional, está apagado)
Dejé preparada una segunda revisión en el servidor con la IA de Claude (`supabase/functions/revisar-foto/`), que sí entiende gestos, textos ofensivos y contexto. Revisa cada foto apenas se publica y, si no es apta, la saca de la pantalla.
- **Costo aproximado** (precios de octubre 2026): viene configurada con el modelo más chico y barato, **Claude Haiku 5.5**: unos **US$ 0,20 cada 500 fotos** (menos de un centavo de dólar por foto). Si quisieras más criterio, se puede cambiar a Claude Opus 5.5 (unos US$ 7 cada 500 fotos). Necesita una cuenta en console.anthropic.com con saldo cargado.
- Activarla requiere unos pasos técnicos (instalar la herramienta de Supabase, cargar la clave y crear un «Database Webhook»). Si la querés, avisame y te guío.

---

## Límites del plan gratis (revisados en octubre 2026)

| Recurso | Gratis | Lo que vamos a usar |
|---|---|---|
| Base de datos | 500 MB | menos de 10 MB |
| Almacenamiento de fotos | **1 GB** | ~250 KB por foto en pantalla + el original. **El sitio deja de guardar originales al llegar a 800 MB** para no pasarse; las fotos se siguen publicando igual. |
| Transferencia | 5 GB/mes | pantalla + descarga del ZIP: 1–2 GB |
| Conexiones en vivo | 200 a la vez | pantalla + panel + jugadores de trivia (≤ 85) |
| Pausa por inactividad | 1 semana | ver el aviso de arriba |

Si en la fiesta suben más de ~800 fotos con originales grandes, el aviso de espacio está en Panel → Fotos.

---

## Seguridad, en criollo

- Cada familia solo ve **su** invitación y **su** respuesta. Nadie puede ver la lista de invitados ni las confirmaciones de otros.
- Los invitados no pueden borrar ni cambiar nada en la base: todo pasa por funciones que validan (cupo, fecha límite, límite de 30 fotos por hora por celular).
- Los puntos de la trivia se calculan en el servidor: no se puede hacer trampa desde el celular.
- Las fotos que no pasan el filtro van a una carpeta privada.
- El panel exige tu email y contraseña, y solo acepta el email del paso 2.
