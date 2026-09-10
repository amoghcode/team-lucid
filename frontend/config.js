// Set this to the HTTPS URL shown by Render, including `/api`.
// Local development continues to use the FastAPI server on port 8000.
globalThis.SMRITIAI_API_URL = globalThis.SMRITIAI_API_URL ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8000/api"
    : "");

