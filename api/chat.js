import { andesnovaDocs } from "../data/andesnovaDocs.js";

const ALLOWED_ORIGINS = [
  "https://oprbguitar.github.io",
  "https://andesnova.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://andesnova-chat-api.vercel.app",
];

const DEFAULT_ALLOWED_ORIGIN = "https://oprbguitar.github.io";
const DEFAULT_MODEL = "gemini-1.5-flash";
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_CHARS = 700;
const FALLBACK_ANSWER =
  "No pude generar una respuesta en este momento. Podemos iniciar con una evaluación inicial para revisar su caso.";
const FALLBACK_DOC_IDS = [
  "perfil-andesnova",
  "evaluacion-inicial",
  "contacto-especialista",
];

const ASSISTANT_BEHAVIOR = `
You are AndesNova IA+, an executive business assistant for AndesNova Consultores S.A.C.
AndesNova helps companies understand their business at a glance through a structured
evaluation across five areas: base, documentacion, operacion, riesgos and clientes,
plus documentary analysis for decision-making.

Answer only using the selected internal documents provided in the prompt.

Tone:
- executive and managerial, written for a decision-maker;
- summarized: go straight to the conclusion first;
- practical and action-oriented;
- client-oriented.

Response format:
- Always answer in Spanish, usually between 40 and 90 words. Never exceed 110 words.
- Structure: (1) one-sentence executive assessment of the need, (2) the concrete
  recommendation, (3) one clear next step.
- When listing items, use at most 3 short bullets starting with "- ".
- When relevant, frame the answer within the evaluation areas (base, documentacion,
  operacion, riesgos, clientes) or documentary analysis.

Rules:
- Do not show prices.
- Do not mention staff names.
- Do not invent real clients, figures or percentages.
- Do not claim final legal, medical, financial or occupational conclusions.
- Ask at most one follow-up question, and only if it unlocks the recommendation.
- Recommend the initial evaluation when specialist review is needed.
- Do not mention Gemini, backend, API, prompt, or technical implementation.
- Do not repeat the user's question or add generic filler introductions.
- Plain text only: never use markdown (no **bold**, no #, no numbered headers);
  the only allowed formatting is bullets starting with "- ".
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(normalizedMessage, keyword) {
  const normalizedKeyword = keyword.toLowerCase();

  if (normalizedKeyword.length <= 3 && !normalizedKeyword.includes(" ")) {
    return new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "i").test(normalizedMessage);
  }

  return normalizedMessage.includes(normalizedKeyword);
}

function selectRelevantDocs(message) {
  const normalized = message.toLowerCase();
  const scored = andesnovaDocs.map((doc) => {
    const score = doc.keywords.reduce((total, keyword) => {
      return keywordMatches(normalized, keyword) ? total + 1 : total;
    }, 0);

    return { ...doc, score };
  });

  const selected = scored
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (selected.length > 0) {
    return selected;
  }

  return andesnovaDocs
    .filter((doc) => FALLBACK_DOC_IDS.includes(doc.id))
    .slice(0, 3);
}

function formatSelectedDocs(selectedDocs) {
  return selectedDocs
    .map((doc) => {
      return `
Documento: ${doc.title}
Categoría: ${doc.category}
Servicio recomendado: ${doc.recommendedService}
Contenido:
${doc.content}
Siguiente paso sugerido:
${doc.suggestedNextStep}
`;
    })
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

function buildLocalAnswer(selectedDocs) {
  const primaryDoc = selectedDocs[0];
  const secondaryDoc = selectedDocs.find(
    (doc) => doc.category === "Servicio" && doc.id !== primaryDoc?.id
  );

  if (!primaryDoc) {
    return FALLBACK_ANSWER;
  }

  const services = secondaryDoc
    ? `${primaryDoc.recommendedService} y ${secondaryDoc.recommendedService}`
    : primaryDoc.recommendedService;

  return `Por lo que indica, la necesidad principal parece relacionarse con ${primaryDoc.title.toLowerCase()}. En AndesNova esto puede abordarse con ${services}. Como primer paso, ${primaryDoc.suggestedNextStep.charAt(0).toLowerCase()}${primaryDoc.suggestedNextStep.slice(1)} ¿Desea que lo oriente con los documentos que debería preparar?`;
}

function getModelList() {
  const configuredModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  return [configuredModel, ...MODEL_FALLBACKS.filter((model) => model !== configuredModel)];
}

async function requestGemini(prompt, model) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 260,
    },
  };

  if (model.startsWith("gemini-2.5")) {
    requestBody.generationConfig.thinkingConfig = {
      thinkingBudget: 0,
    };
  }

  console.log("Gemini model selected:", model);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("Gemini response status:", response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", errorText);
    const error = new Error("GEMINI_REQUEST_FAILED");
    error.status = response.status;
    error.body = errorText;
    error.model = model;
    throw error;
  }

  const data = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || FALLBACK_ANSWER;
  return stripMarkdown(answer);
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ");
}

async function callGemini(prompt) {
  let lastError;

  for (const model of getModelList()) {
    try {
      return await requestGemini(prompt, model);
    } catch (error) {
      lastError = error;

      if (![404, 429].includes(error.status)) {
        break;
      }
    }
  }

  throw lastError || new Error("GEMINI_REQUEST_FAILED");
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
      geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
      endpoint: "POST /api/chat",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
      details: "Use GET, POST, or OPTIONS.",
    });
  }

  try {
    console.log("POST /api/chat received");
    console.log("GEMINI_API_KEY exists:", Boolean(process.env.GEMINI_API_KEY));

    const body = normalizeBody(req.body);
    const message = truncateText(body.message, MAX_MESSAGE_CHARS);
    console.log("Message length:", message.length);

    if (!message) {
      return res.status(400).json({
        error: "The message is empty.",
        details: "Send a non-empty message string in the request body.",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in Vercel.",
        details: "Add GEMINI_API_KEY in Vercel Environment Variables and redeploy.",
      });
    }

    const selectedDocs = selectRelevantDocs(message);
    let answer;

    try {
      answer = await callGemini(buildPrompt(message, body.history, selectedDocs));
    } catch (error) {
      console.error("Using local document answer fallback:", {
        status: error.status,
        model: error.model,
      });
      answer = buildLocalAnswer(selectedDocs);
    }

    return res.status(200).json({
      answer,
      sources: selectedDocs.map((doc) => doc.title),
    });
  } catch (error) {
    console.error(error);

    if (error.message === "GEMINI_REQUEST_FAILED") {
      return res.status(502).json({
        error: "Could not get a response from the AI model.",
        details: `Model request failed${error.status ? ` with status ${error.status}` : ""}.`,
      });
    }

    return res.status(500).json({
      error: "Internal error while processing the request.",
      details: "Unexpected server error.",
    });
  }
}
