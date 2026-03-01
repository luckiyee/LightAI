# LightAI

LightAI is a stylish AI chat website using HTML/CSS/JS with a Node runtime that connects to Ollama.

The assistant identity is:
- Name: `Light`
- Version: `0.1`

## Features

- Bright yellow/white/gray responsive UI
- Streaming chat responses
- Cancel and retry generation
- Light model editions (`Flash` and `Light`) in-chat selector
- File/image upload support in chat composer
- Optional web search with source indicators
- Account creation and login (`username` + `password`)
- Cookie-based session so you stay logged in
- Per-account saved conversations with delete support
- Local settings persistence (`localStorage`)
- Password-gated runtime base prompt update
- Uses the official `ollama` npm client for chat/runtime access
- Basic rate-limiting and request validation in proxy

## Password Prompt Switch

Send this exact message in chat:

```text
Kli-T10-Pmo
```

Then send your new base prompt in the next message.  
That prompt becomes the active system prompt for future responses.

## One-Click Start (Windows)

Run:

```bat
Start.bat
```

`Start.bat` will:
- verify/install Node.js (via `winget` if missing)
- install npm dependencies if needed
- create `.env` from `.env.example` (if missing)
- start the server and open `http://localhost:3000`

## Manual Start

```bat
npm install
copy .env.example .env
npm start
```

## Runtime Provider

The app uses Ollama via the `ollama` npm client. You can point it to either:
- a local Ollama server (`http://127.0.0.1:11434`)
- Ollama Cloud (`https://ollama.com`) with an API key

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_API_KEY=
```

## API Endpoints

- `GET /api/health`
- `GET /api/models`
- `POST /api/chat`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/conversations`
- `GET /api/conversations/:id`
- `POST /api/conversations`
- `DELETE /api/conversations/:id`

## Security Notes

- Auth sessions are stored in HTTP-only cookies.
- User accounts, sessions, and conversations are stored locally at `server/data/db.json`.
- This app is designed for local/trusted use; add stronger auth controls before public exposure.
