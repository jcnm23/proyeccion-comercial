import session from "express-session";
import { google } from "googleapis";
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

function crearClienteGoogle() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function leerTokensGoogle() {
  const { data, error } = await supabase
    .from("google_tokens")
    .select("tokens")
    .eq("id", "principal")
    .maybeSingle();

  if (error) throw error;

  return data?.tokens || null;
}

async function guardarTokensGoogle(tokens) {
  const { data: anterior } = await supabase
    .from("google_tokens")
    .select("tokens")
    .eq("id", "principal")
    .maybeSingle();

  const tokensFinales = {
    ...(anterior?.tokens || {}),
    ...tokens
  };

  const { error } = await supabase
    .from("google_tokens")
    .upsert({
      id: "principal",
      tokens: tokensFinales,
      updated_at: new Date().toISOString()
    });

  if (error) throw error;
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60
  }
}));

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

app.get("/auth/google", (req, res) => {
  const googleClient = crearClienteGoogle();

  const url = googleClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.events"
    ]
  });

  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("No se recibió el código de Google.");
    }

    const googleClient = crearClienteGoogle();
    const { tokens } = await googleClient.getToken(code);

    await guardarTokensGoogle(tokens);

    res.redirect("/?calendar=connected");
  } catch (error) {
    console.error("Error OAuth Google:", error);
    res.status(500).send("No se pudo conectar Google Calendar.");
  }
});

app.get("/api/calendar/status", async (req, res) => {
  try {
    const tokens = await leerTokensGoogle();

    res.json({
      conectado: Boolean(tokens?.refresh_token || tokens?.access_token)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "No se pudo consultar el estado de Google Calendar."
    });
  }
});

app.post("/api/calendar/events", async (req, res) => {
  try {
    const { titulo, descripcion, fecha, hora } = req.body;

    if (!titulo || !fecha) {
      return res.status(400).json({
        error: "El título y la fecha son obligatorios."
      });
    }

    const tokens = await leerTokensGoogle();

    if (!tokens) {
      return res.status(401).json({
        error: "Primero debes conectar Google Calendar."
      });
    }

    const googleClient = crearClienteGoogle();
    googleClient.setCredentials(tokens);

    const fechaInicio = new Date(
      `${fecha}T${hora || "09:00"}:00-06:00`
    );

    const fechaFin = new Date(
      fechaInicio.getTime() + 60 * 60 * 1000
    );

    const calendar = google.calendar({
      version: "v3",
      auth: googleClient
    });

    const respuesta = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: titulo,
        description: descripcion || "",
        start: {
          dateTime: fechaInicio.toISOString(),
          timeZone: "America/Mexico_City"
        },
        end: {
          dateTime: fechaFin.toISOString(),
          timeZone: "America/Mexico_City"
        }
      }
    });

    res.json({
      ok: true,
      evento: respuesta.data
    });
  } catch (error) {
    console.error("Error creando evento:", error);
    res.status(500).json({
      error: "No se pudo crear el evento en Google Calendar."
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor activo en http://localhost:${port}`);
});