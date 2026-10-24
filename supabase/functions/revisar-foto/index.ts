// Segunda revisión OPCIONAL de fotos con un modelo de visión (Claude).
// Está DESACTIVADA: solo funciona si la desplegás y creás el Database Webhook (ver GUIA.md, "Filtro extra").
// Se dispara con cada foto nueva publicada; si la IA la considera inapropiada, la pasa a "revision"
// (desaparece de la pantalla al instante y queda para que la mires en el panel).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const anthropic = new Anthropic(); // lee ANTHROPIC_API_KEY de los secretos de la función
// Haiku: el modelo más chico y barato (centavos por cientos de fotos). Para más criterio: "claude-sonnet-5-5" u "claude-opus-5-5".
const MODELO = Deno.env.get("MODELO_REVISION") ?? "claude-haiku-5-5";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // clave privada: solo existe en el servidor, nunca en la web
);

const INSTRUCCIONES =
  "Revisás fotos sacadas por invitados en un cumpleaños familiar de 60 años que se proyectan en una pantalla del salón, " +
  "con chicos y personas mayores mirando. Marcá como no apta una foto con desnudos, contenido sexual, gestos obscenos, " +
  "texto ofensivo o insultos legibles en la imagen, violencia, drogas, o burlas humillantes hacia alguien. " +
  "Fotos normales de fiesta (gente bailando, brindando, abrazos, vestidos con escote, comida, la torta) son aptas.";

Deno.serve(async (req) => {
  // Lo llama el Database Webhook con { type: "INSERT", record: {...} }
  const { record } = await req.json();
  if (!record || record.estado !== "publicada") return new Response("ignorada");

  const url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fotos/${record.ruta}`;
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

  let apta = true;
  let motivo = "";
  try {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { apta: { type: "boolean" }, motivo: { type: "string" } },
            required: ["apta", "motivo"],
            additionalProperties: false,
          },
        },
      },
      system: INSTRUCCIONES,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(binario) } },
          { type: "text", text: `Leyenda escrita por el invitado: ${JSON.stringify(record.leyenda ?? "")}. ¿Es apta para la pantalla?` },
        ],
      }],
    });

    if (respuesta.stop_reason === "refusal") {
      // Si el modelo se niega a analizarla, por las dudas no se muestra
      apta = false;
      motivo = "la IA no quiso analizarla";
    } else {
      const texto = respuesta.content.find((b) => b.type === "text");
      const r = JSON.parse(texto && "text" in texto ? texto.text : "{}");
      apta = r.apta !== false;
      motivo = r.motivo ?? "";
    }
  } catch (e) {
    // Si la API falla, la foto sigue publicada (ya pasó el filtro del celular)
    console.error("Revisión no disponible", e);
    return new Response("error", { status: 200 });
  }

  if (!apta) {
    await supabase.from("fotos")
      .update({ estado: "revision", puntajes: { ...(record.puntajes ?? {}), ia: motivo } })
      .eq("id", record.id);
  }
  return new Response(apta ? "apta" : "a revision");
});
