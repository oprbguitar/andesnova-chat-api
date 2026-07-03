# AndesNova Chat API

Backend serverless de Vercel para el chatbot empresarial AndesNova IA+ del portal AndesNova Consultores S.A.C.

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
  "answer": "AndesNova IA+ answer"
}
```

## Deploy On Vercel

1. Import this repository in Vercel.
2. Configure `GEMINI_API_KEY` in Project Settings > Environment Variables.
3. Deploy the project.
4. Confirm that `/` shows the status page and `/api/chat` responds to GET and POST.
