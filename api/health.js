import { andesnovaDocs } from "../data/andesnovaDocs.js";

const ALLOWED_ORIGINS = [
  "https://oprbguitar.github.io",
  "https://andesnova.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.includes(origin) ? origin : "https://andesnova.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ status: "unavailable" });

  const hasLocalFallback = Array.isArray(andesnovaDocs) && andesnovaDocs.length > 0;
  if (!process.env.GEMINI_API_KEY) {
    return res.status(hasLocalFallback ? 200 : 503).json({
      status: hasLocalFallback ? "fallback" : "unavailable",
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    return res.status(200).json({
      status: response.ok ? "available" : hasLocalFallback ? "fallback" : "unavailable",
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return res.status(hasLocalFallback ? 200 : 503).json({
      status: hasLocalFallback ? "fallback" : "unavailable",
      checkedAt: new Date().toISOString(),
    });
  }
}
