# LightAI

LightAI is a stylish AI chat website using HTML/CSS/JS with a local Node proxy for Ollama.

The assistant identity is:
- Name: `Light`
- Version: `0.1`

## Features

- Bright yellow/white/gray responsive UI
- Streaming chat responses
- Cancel and retry generation
- Model picker, temperature, and max token controls
- Account creation and login (`username` + `password`)
- Cookie-based session so you stay logged in
- Per-account saved conversations with delete support
- Local settings persistence (`localStorage`)
- Password-gated runtime base prompt update
- Health status for proxy and Ollama
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
- verify/install Ollama (via `winget` if missing)
- install npm dependencies if needed
- start Ollama service
- pull `llama3.1:8b`
- create the custom `Light` model from `Modelfile.light`
- create `.env` from `.env.example` (if missing)
- start the server and open `http://localhost:3000`

## Manual Start

```bat
npm install
copy .env.example .env
ollama serve
ollama pull llama3.1:8b
ollama create Light -f Modelfile.light
npm start
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
