# COSMOS — ARIA AI Integration Setup

## What was added (nothing else was changed)

```
cosmos-ai/
├── space-cosmos.html     ← your original file + 2 lines at the bottom
├── ai-assistant.css      ← all ARIA styles (uses your existing CSS variables)
├── ai-assistant.js       ← all ARIA logic (streaming, memory, UI)
├── api/
│   └── chat.js           ← secure backend proxy (hides your API key)
└── vercel.json           ← Vercel routing config
```

The **only change** to `space-cosmos.html` is two lines inserted just before `</body>`:
```html
<link rel="stylesheet" href="ai-assistant.css">
<script src="ai-assistant.js" defer></script>
```

---

## Deployment to Vercel (5 minutes)

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Add your OpenAI API key as an environment variable
In the Vercel dashboard → Project → Settings → Environment Variables:
```
Name:   OPENAI_API_KEY
Value:  sk-...your-key...
```
Or via CLI:
```bash
vercel env add OPENAI_API_KEY
```

### 3. Deploy
```bash
cd cosmos-ai
vercel --prod
```

Vercel will serve your HTML/CSS/JS as static files and route
`POST /api/chat` to the Edge Function in `api/chat.js`.

---

## Local development

```bash
npm i -g vercel
cd cosmos-ai
vercel dev          # starts on http://localhost:3000
```

Set your key in a local `.env` file (Vercel dev picks it up automatically):
```
OPENAI_API_KEY=sk-...
```

---

Keep `.env` local and never commit it to GitHub.

## Customisation

| What | Where |
|------|-------|
| AI personality / system prompt | `api/chat.js` → `SYSTEM_PROMPT` |
| GPT model or token limit | `api/chat.js` → `openAIBody` |
| Quick-suggest prompts | `ai-assistant.js` → `SUGGESTIONS` array |
| Panel size | `ai-assistant.css` → `#aria-panel` width / max-height |
| Button position | `ai-assistant.css` → `#aria-trigger` bottom / right |

---

## Architecture (security)

```
Browser (ai-assistant.js)
  │  POST /api/chat  { messages: [...] }
  ▼
Vercel Edge Function (api/chat.js)
  │  reads OPENAI_API_KEY from env  ← key never leaves server
  │  POST https://api.openai.com/v1/chat/completions
  ▼
OpenAI API → SSE stream → piped back to browser
```

The browser **never** sees your API key.
