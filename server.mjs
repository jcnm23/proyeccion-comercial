import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

app.get("/api/state", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("app_state")
      .select("data")
      .eq("id", "principal")
      .maybeSingle();

    if (error) throw error;

    res.json(data ? data.data : null);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "No se pudo cargar la información"
    });
  }
});

app.put("/api/state", async (req, res) => {
  try {
    const { error } = await supabase
      .from("app_state")
      .upsert({
        id: "principal",
        data: req.body,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "No se pudo guardar la información"
    });
  }
});

app.post("/api/consultar-ia", async (req, res) => {
  try {
    const { pregunta, datos } = req.body;

    const respuesta = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      instructions: `
Actúa como consultor financiero, organizacional,
especialista en metas, ahorro y gestión de proyectos.
Responde siempre en español.
Analiza los datos proporcionados.
No inventes información.
Entrega recomendaciones claras y prudentes.
      `,
      input: `
Pregunta del usuario:
${pregunta}

Datos del sistema:
${JSON.stringify(datos)}
      `
    });

    res.json({
      respuesta: respuesta.output_text
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "No fue posible consultar la inteligencia artificial."
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor activo en http://localhost:${port}`);
});