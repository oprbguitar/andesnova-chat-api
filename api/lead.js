const ALLOWED_ORIGINS = [
  "https://www.andesnova.solutions",
  "https://andesnova.solutions",
  "https://oprbguitar.github.io",
  "https://andesnova.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const DEFAULT_ALLOWED_ORIGIN = "https://www.andesnova.solutions";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_MAX_TRACKED_IPS = 2000;
const rateLimitHits = new Map();

const MAX_NAME_CHARS = 120;
const MAX_COMPANY_CHARS = 160;
const MAX_EMAIL_CHARS = 254;
const MAX_PHONE_CHARS = 30;
const MAX_MESSAGE_CHARS = 2000;
const MAX_SUMMARY_CHARS = 8000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitHits.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    if (rateLimitHits.size >= RATE_LIMIT_MAX_TRACKED_IPS) {
      rateLimitHits.clear();
    }
    rateLimitHits.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function setCorsHeaders(res, origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : DEFAULT_ALLOWED_ORIGIN;
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Vary", "Origin");
}

function truncateText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function validateLead(body) {
  const name = truncateText(body?.name, MAX_NAME_CHARS);
  const company = truncateText(body?.company, MAX_COMPANY_CHARS);
  const email = truncateText(body?.email, MAX_EMAIL_CHARS);
  const phone = truncateText(body?.phone, MAX_PHONE_CHARS);
  const message = truncateText(body?.message, MAX_MESSAGE_CHARS);
  const summary = truncateText(body?.summary, MAX_SUMMARY_CHARS);
  const consent = body?.consent === true;

  const errors = [];
  if (name.length < 2) errors.push("name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push("email");
  if (message.length < 5 && !summary) errors.push("message");
  if (!consent) errors.push("consent");

  return {
    ok: errors.length === 0,
    errors,
    lead: { name, company, email, phone, message, summary, consent },
  };
}

function buildEmailText(lead, origin) {
  const receivedAt = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });
  return [
    "NUEVO PROSPECTO - PORTAL ANDESNOVA",
    "",
    `Nombre: ${lead.name}`,
    `Empresa: ${lead.company || "No indicada"}`,
    `Correo: ${lead.email}`,
    `Teléfono: ${lead.phone || "No indicado"}`,
    `Origen: ${origin || "desconocido"}`,
    `Recibido: ${receivedAt} (hora de Lima)`,
    "",
    "MENSAJE",
    lead.message || "(sin mensaje adicional)",
    ...(lead.summary ? ["", "DIAGNÓSTICO / RESUMEN ADJUNTO", lead.summary] : []),
    "",
    "El prospecto aceptó la política de privacidad al enviar el formulario.",
  ].join("\n");
}

async function sendLeadEmail(lead, origin) {
  const apiKey = process.env.RESEND_API_KEY;
  const inbox = process.env.LEAD_INBOX || "peru.labs.pe@gmail.com";
  const from = process.env.LEAD_FROM || "AndesNova Consultas <consultas@andesnova.solutions>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [inbox],
      reply_to: lead.email,
      subject: `Nuevo prospecto: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
      text: buildEmailText(lead, origin),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Resend request failed:", response.status, detail.slice(0, 300));
    throw new Error(`Resend request failed with ${response.status}`);
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  setCorsHeaders(res, origin);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: "Lead service not configured" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { ok, errors, lead } = validateLead(body);
  if (!ok) {
    return res.status(400).json({ error: "Invalid lead", fields: errors });
  }

  try {
    await sendLeadEmail(lead, origin);
    return res.status(200).json({ ok: true, provider: "resend" });
  } catch (error) {
    console.error("Lead delivery failed:", error.message);
    return res.status(502).json({ error: "Lead delivery failed" });
  }
}
