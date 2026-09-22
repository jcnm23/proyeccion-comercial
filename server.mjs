import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

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