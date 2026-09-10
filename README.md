# SmritiAI

SmritiAI is a vanilla JavaScript, offline-first PWA for gentle cognitive engagement and family-supported routines. It includes six playable activities, reminders, family-photo recognition, multilingual UI, a rule-based companion, caregiver analytics, and PDF reporting. It is an assistive engagement tool, not a diagnostic or emergency-response service.

## Local development

1. Run `npm install`.
2. Run `npm run dev` for the PWA.
3. Copy `backend/.env.example` to `backend/.env` and provide a MongoDB connection plus secure JWT secret.
4. Install `backend/requirements.txt`, then run `uvicorn main:app --reload` from `backend/`.

The guided demo is local-only and uses fictional data. Its caregiver PIN is `2468`.

## Production

`npm run build` creates the static `dist/` directory. Set `frontend/config.js` to the exact public Render API URL (including `/api`) before building. `render.yaml` describes the FastAPI deployment; set `MONGODB_URI` and set `ALLOWED_ORIGINS` to the exact frontend origins in the Render service environment. Do not include a trailing slash in an origin.

Example production configuration:

```js
globalThis.SMRITIAI_API_URL = "https://your-render-service.onrender.com/api";
```

The production frontend intentionally reports a clear configuration error when this value is missing instead of silently sending authentication details to `localhost`.

