# Serron Backend

Backend proxy server for TendAI LLM integration with OpenAI.

## Setup

1. Install dependencies:
```bash
npm install
```

2. **Create `.env` file** in the `tendai-backend` directory:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Or create manually with:
     ```
     OPENAI_API_KEY=your_openai_api_key_here
     PORT=3001
     ```
   - **Get your OpenAI API key from:** https://platform.openai.com/api-keys
   - **Important:** The server will NOT start without a valid `OPENAI_API_KEY`!

3. Start the server:
```bash
npm start
```

The server will:
- ✅ Check if `.env` file exists and loads it
- ✅ Verify that `OPENAI_API_KEY` is set
- ✅ Show masked API key for verification (first 4 and last 4 chars)
- ✅ Start on port 3001 by default (or PORT from .env; PWA dev server often uses 3000)
- ✅ Enable CORS for frontend communication

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### POST /api/talk

Send a message to the LLM and get a response.

**Request:**
```json
{
  "message": "How can I improve my sleep?"
}
```

**Response:**
```json
{
  "reply": "Here are some tips to improve your sleep..."
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "tendai-backend"
}
```

## Deployment

This backend is ready for deployment on Render.com or similar platforms.

Make sure to:
1. Set `OPENAI_API_KEY` in your environment variables
2. The server will automatically use `process.env.PORT` (Render sets this automatically)

## Security

- API key is stored in environment variables, never in code
- CORS is enabled for frontend communication
- Input validation and length limits are in place
- Error messages don't expose sensitive information in production

