# AndesNova Chat API

Backend serverless de Vercel para el chatbot empresarial AndesNova IA+ del portal AndesNova Consultores S.A.C.
Las respuestas se generan con documentacion interna estructurada del backend, seleccionando solo los documentos mas relevantes para cada consulta.

Production URL:

```text
https://andesnova-chat-api.vercel.app/
```

Main endpoint:

```text
https://andesnova-chat-api.vercel.app/api/chat
```

## Environment Variable

The Gemini API key must be configured in Vercel Environment Variables:

```text
GEMINI_API_KEY
```

Do not place the API key in the codebase or in this README.

## GET Test

```powershell
Invoke-RestMethod -Uri "https://andesnova-chat-api.vercel.app/api/chat" -Method GET
```

Expected response:

```json
{
  "status": "ok",
  "message": "AndesNova Chat API is active",
  "geminiKeyConfigured": true,
  "endpoint": "POST /api/chat"
}
```

## POST Test

```powershell
Invoke-RestMethod -Uri "https://andesnova-chat-api.vercel.app/api/chat" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"message":"Tengo contratos desordenados y proveedores sin control"}'
```

Expected response:

```json
{
  "answer": "Respuesta breve y natural de AndesNova IA+",
  "sources": [
    "Cumplimiento legal y control contractual",
    "Logistica y contrataciones"
  ]
}
```

`POST /api/chat` devuelve respuestas cortas, naturales y orientadas al caso del cliente. El frontend puede ignorar `sources` si no necesita mostrar las referencias internas.

## Troubleshooting

If the chatbot shows the fallback message, check Vercel Logs first.

Confirm:

- `GEMINI_API_KEY` exists in Vercel Environment Variables.
- `GET /api/chat` returns `geminiKeyConfigured: true`.
- `POST /api/chat` returns a JSON response with `answer`.
- The browser origin is allowed by CORS, especially `https://oprbguitar.github.io`.

Errors from `/api/chat` are returned as JSON with `error` and a short safe `details` field.

## Deploy On Vercel

1. Import this repository in Vercel.
2. Configure `GEMINI_API_KEY` in Project Settings > Environment Variables.
3. Deploy the project.
4. Confirm that `/` shows the status page and `/api/chat` responds to GET and POST.
