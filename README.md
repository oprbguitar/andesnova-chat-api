# AndesNova Chat API

API serverless mínima para el chatbot flotante de AndesNova IA+.

## Endpoint

`POST /api/chat`

Request:

```json
{
  "message": "Necesito ordenar contratos y controlar vencimientos",
  "history": []
}
```

Response:

```json
{
  "answer": "Respuesta generada por AndesNova IA+"
}
```

## Variables de entorno

Configura la clave de Gemini en Vercel:

```bash
GEMINI_API_KEY=tu_clave_de_gemini
```

Opcionalmente puedes cambiar el modelo:

```bash
GEMINI_MODEL=gemini-1.5-flash
```

## Desarrollo local

```bash
npm install
npm run dev
```

Prueba local:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Quiero organizar documentos dispersos\",\"history\":[]}"
```

## Deploy en Vercel

1. Importa este repositorio en Vercel.
2. Agrega `GEMINI_API_KEY` en Project Settings > Environment Variables.
3. Despliega el proyecto.
4. Usa la URL pública de Vercel desde el frontend de AndesNova.

## CORS

La API acepta solicitudes desde:

- `https://oprbguitar.github.io`
- `http://localhost:5173`

También responde preflight `OPTIONS` para `POST /api/chat`.
