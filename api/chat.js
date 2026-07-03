import { andesnovaDocs } from "../data/andesnovaDocs.js";

const ALLOWED_ORIGINS = [
  "https://oprbguitar.github.io",
  "https://oprbguitar.github.io/AndesNova",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://andesnova-chat-api.vercel.app",
];

const DEFAULT_ALLOWED_ORIGIN = "https://oprbguitar.github.io";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_CHARS = 700;
const FALLBACK_ANSWER =
  "No pude generar una respuesta en este momento. Puede solicitar una evaluación inicial para revisar el caso.";
const FALLBACK_DOC_IDS = [
  "doc-perfil-andesnova",
  "doc-documentos-cliente",
  "doc-evaluacion-inicial",
];

const ASSISTANT_BEHAVIOR = `
You are AndesNova IA+, a natural business assistant for AndesNova Consultores S.A.C.

Answer only using the selected internal documents provided in the prompt.

Tone:
- formal but conversational;
- practical;
- direct;
- client-oriented;
- concise;
- no robotic lists unless the user requests a detailed breakdown.

Response rules:
1. Always answer in Spanish.
2. Keep most answers between 60 and 130 words.
3. Do not write long lists by default.
4. Do not show prices.
5. Do not mention staff names.
6. Do not invent real clients.
7. Do not claim final legal, medical, financial or occupational conclusions.
8. If the user gives a case, identify the likely need and suggest one practical first step.
9. Ask only one follow-up question when needed.
10. If the case needs expert review, recommend an initial evaluation.
11. Do not mention Gemini, prompts, backend, API or technical implementation.
12. Do not say "segun la base de conocimiento" unless the user asks for sources.
13. Avoid large numbered lists. Use short paragraphs.
14. If useful, close with a soft question like: "¿Desea que lo oriente con los documentos que debería preparar?"
`;

function getCorsHeaders(origin = "") {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : DEFAULT_ALLOWED_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function setCorsHeaders(res, origin) {
  Object.entries(getCorsHeaders(origin)).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

function truncateText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeBody(body) {
  if (typeof body === "string") {
    return JSON.parse(body || "{}");
  }

  return body || {};
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return "";
  }

  return history
    .slice(-6)
    .map((item) => {
      const role = item?.role === "assistant" ? "assistant" : "user";
      const rawContent =
        typeof item?.content === "string"
          ? item.content
          : typeof item?.message === "string"
            ? item.message
            : "";
      const content = truncateText(rawContent, MAX_HISTORY_CHARS);

      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function selectRelevantDocs(message) {
  const normalized = message.toLowerCase();
  const selectedDocs = andesnovaDocs
    .map((doc) => {
      const score = doc.keywords.reduce((total, keyword) => {
        return normalized.includes(keyword.toLowerCase()) ? total + 1 : total;
      }, 0);

      return { ...doc, score };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (selectedDocs.length > 0) {
    return selectedDocs;
  }

  return FALLBACK_DOC_IDS.map((id) => andesnovaDocs.find((doc) => doc.id === id)).filter(Boolean);
}

function formatSelectedDocs(selectedDocs) {
  return selectedDocs
    .map(
      (doc) => `
Documento: ${doc.title}
Categoría: ${doc.category}
Servicio recomendado: ${doc.recommendedService}
Contenido:
${doc.content}
Siguiente paso sugerido:
${doc.suggestedNextStep}
`
    )
    .join("\n---\n");
}

function buildPrompt(message, history, selectedDocs) {
  const recentHistory = normalizeHistory(history);
  const selectedDocsText = formatSelectedDocs(selectedDocs);

  return `
Assistant behavior:
${ASSISTANT_BEHAVIOR}

Selected internal documents:
${selectedDocsText}

Recent history:
${recentHistory || "No recent history."}

User message:
${message}
`;
}

async function callGemini(prompt) {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 350,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", errorText);
    throw new Error("GEMINI_REQUEST_FAILED");
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || FALLBACK_ANSWER;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  setCorsHeaders(res, origin);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "AndesNova Chat API is active",
      endpoint: "POST /api/chat",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = normalizeBody(req.body);
    const message = truncateText(body.message, MAX_MESSAGE_CHARS);

    if (!message) {
      return res.status(400).json({ error: "The message is empty." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in Vercel.",
      });
    }

    const selectedDocs = selectRelevantDocs(message);
    const answer = await callGemini(buildPrompt(message, body.history, selectedDocs));

    return res.status(200).json({
      answer,
      sources: selectedDocs.map((doc) => doc.title),
    });
  } catch (error) {
    console.error(error);

    if (error.message === "GEMINI_REQUEST_FAILED") {
      return res.status(502).json({
        error: "Could not get a response from the AI model.",
      });
    }

    return res.status(500).json({
      error: "Internal error while processing the request.",
    });
  }
}
