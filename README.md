# SmritiAI

SmritiAI is a vanilla JavaScript, offline-first PWA for gentle cognitive engagement and family-supported routines. It includes six playable activities, reminders, family-photo recognition, multilingual UI, a rule-based companion, caregiver analytics, and PDF reporting. It is an assistive engagement tool, not a diagnostic or emergency-response service.

## Data flow

```mermaid
flowchart TD
    FE[Frontend JavaScript] -->|JSON or form data over HTTPS| API[FastAPI backend]

    API --> AUTH[Authentication routes]
    AUTH --> REGISTER[POST /register\nCreates a family account and profile]
    AUTH --> LOGIN[POST /login\nVerifies credentials and returns a JWT]
    AUTH --> UNLOCK[POST /caregiver/unlock\nVerifies the caregiver PIN]

    API --> DATA[Family-data routes]
    DATA --> SYNC[POST /sync\nSaves queued device changes and returns newer records]
    DATA --> GAMES[POST /game-results\nStores completed game scores]
    DATA --> REMINDERS[GET/POST/PATCH/DELETE /reminders\nReads and manages reminders]
    DATA --> FAMILY[GET/POST/PATCH/DELETE /family-members\nManages family names and relationships]
    DATA --> PHOTOS[GET /family-members/:id/photo\nReturns a private family photo]
    DATA --> PROFILE[GET/PATCH /profile\nReads or updates the family profile]
    DATA --> ANALYTICS[GET /analytics\nCalculates recent engagement scores]

    REGISTER --> MONGO[(MongoDB)]
    SYNC --> MONGO
    GAMES --> MONGO
    REMINDERS --> MONGO
    FAMILY --> MONGO
    PROFILE --> MONGO
    ANALYTICS --> MONGO
    FAMILY --> GRIDFS[(MongoDB GridFS\nFamily photo files)]
    GRIDFS --> PHOTOS
```

The frontend sends authenticated requests to FastAPI. The API scopes each request to its family account, then stores structured records in MongoDB; uploaded family photos are resized, converted to WebP, and stored in MongoDB GridFS.

## Local development

1. Run `npm install`.
2. Run `npm run dev` for the PWA.
3. Copy `backend/.env.example` to `backend/.env` and provide a MongoDB connection plus secure JWT secret.
4. Install `backend/requirements.txt`, then run `uvicorn main:app --reload` from `backend/`.

The guided demo is local-only and uses fictional data. Its caregiver PIN is `2468`.

## Production

`npm run build` creates the static `dist/` directory. Set `frontend/config.js` to the public HTTPS API URL before building. `render.yaml` describes the FastAPI deployment; set `MONGODB_URI` and `ALLOWED_ORIGINS` in the service environment.
