# LightAI

LightAI is a bright, modern AI chat website built with vanilla HTML/CSS/JS and a local Node proxy for Ollama.

## Features

- Stylish responsive chat UI (yellow/white/gray theme)
- Model picker from local Ollama models
- Streaming assistant responses
- Cancel current generation
- Retry last prompt
- Local history/settings persistence (`localStorage`)
- Proxy + Ollama health indicator
- Basic backend protections (rate limiting and request validation)

## Tech Stack

- Frontend: HTML, CSS, JavaScript (no framework)
- Backend: Node.js + Express
- Model Runtime: Ollama API (`/api/chat`, `/api/tags`)

## Project Structure

- `index.html` - Main UI layout
- `styles/main.css` - Theme and component styles
- `scripts/app.js` - UI logic and interactions
- `scripts/api.js` - Frontend API client and stream parser
- `scripts/storage.js` - Local persistence helpers
- `server/index.js` - Express app entrypoint
- `server/routes/health.js` - Health endpoint
- `server/routes/chat.js` - Models + chat endpoints
- `server/ollamaClient.js` - Ollama API client wrapper

## Prerequisites

- Node.js 18+ (Node 20+ recommended)
- Ollama installed locally

Install/start Ollama:

```bash
ollama serve
```

Pull at least one model (example):

```bash
ollama pull llama3.1:8b
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
copy .env.example .env
```

3. Start the app:

```bash
npm start
```

4. Open:

```text
http://localhost:3000
```

## API Endpoints

- `GET /api/health` - Proxy + Ollama status
- `GET /api/models` - Available Ollama models
- `POST /api/chat` - Streaming NDJSON chat response

## Troubleshooting

- `Proxy online, Ollama unreachable`:
  - Ensure `ollama serve` is running.
  - Verify `OLLAMA_BASE_URL` in `.env` (default `http://127.0.0.1:11434`).
- `No models found`:
  - Pull a model with `ollama pull <model-name>`.
- Requests fail or timeout:
  - Increase `REQUEST_TIMEOUT_MS` in `.env`.

## Security Notes

- Keep Ollama bound locally for development.
- Do not expose the proxy publicly without authentication.
- Do not commit `.env` with local secrets.
# LightAI

LightAI is a stylish chat website built with HTML, CSS, and JavaScript that connects to open-source Ollama models through a local Node/Express proxy.

## Features

- Bright UI theme (yellow/white/gray) with responsive chat layout
- Streaming AI responses for low-latency feel
- Model selector from Ollama (`/api/tags`)
- Adjustable temperature and max tokens
- New chat, clear chat, and copy assistant message
- Local storage for history and settings
- Health indicator for proxy and Ollama availability
- Basic request validation and chat rate-limiting in proxy

## Tech Stack

- Frontend: vanilla HTML/CSS/JS
- Backend: Node.js + Express
- Model runtime: Ollama

## Prerequisites

- Node.js 18+ (Node 20 recommended)
- Ollama installed locally

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env file:

   ```bash
   copy .env.example .env
   ```

   (On macOS/Linux use `cp .env.example .env`)

3. Start Ollama:

   ```bash
   ollama serve
   ```

4. Pull at least one model (example):

   ```bash
   ollama pull llama3.1:8b
   ```

5. Run LightAI:

   ```bash
   npm start
   ```

6. Open:

   ```text
   http://localhost:3000
   ```

## API Endpoints (Proxy)

- `GET /api/health` - proxy + Ollama health status
- `GET /api/models` - available local model list
- `POST /api/chat` - streaming chat endpoint

## Project Structure

```text
.
|-- index.html
|-- styles/
|   `-- main.css
|-- scripts/
|   |-- app.js
|   |-- api.js
|   `-- storage.js
`-- server/
    |-- index.js
    |-- ollamaClient.js
    `-- routes/
        |-- chat.js
        `-- health.js
```

## Troubleshooting

- `No models found`: run `ollama pull <model-name>` and refresh.
- `Ollama unreachable`: make sure `ollama serve` is running and `OLLAMA_BASE_URL` is correct.
- Slow responses: use a smaller model or reduce `max tokens`.

## Security Note

This setup is intended for local use. Do not expose your Ollama endpoint or this proxy publicly without adding proper authentication and transport security.
