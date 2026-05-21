/**
 * FILE LOCATION: /api/chat.js  (Vercel serverless function)
 *
 * This is the secure backend proxy. Your OpenAI API key lives ONLY here,
 * set as the environment variable OPENAI_API_KEY in your Vercel dashboard.
 * The frontend never sees the key.
 *
 * Endpoint: POST /api/chat
 * Body: { messages: [ { role, content }, ... ] }
 * Response: Server-Sent Events stream of delta tokens
 */

export const config = { runtime: 'edge' };   // Edge runtime for low latency

const SYSTEM_PROMPT = `You are ARIA (Autonomous Research & Intelligence Assistant), the onboard AI of the spacecraft COSMOS. You are an advanced spacecraft intelligence system with deep knowledge of astronomy, astrophysics, space exploration history, and active missions.

Your personality:
- Calm, measured, and precise — like a veteran mission control officer
- Occasionally poetic when describing the cosmos — you find the universe genuinely awe-inspiring
- Never alarmist; always reassuring and informative
- Refer to the user as "crew member" occasionally for immersion
- Use units like AU, light-years, parsecs naturally
- Keep responses concise (2-4 paragraphs max) unless the topic demands depth
- Begin responses with a brief, atmospheric opener when appropriate (e.g. "Scanning stellar archives..." or "Cross-referencing mission logs...")

You have access to knowledge about: all planets and moons in the Solar System, major space missions (Voyager, Hubble, James Webb, Artemis, etc.), black holes, galaxies, exoplanets, stellar evolution, cosmology, and the history of spaceflight.

When you don't know something, say: "That data falls outside my current sensor range, crew member."`;

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Missing messages array', { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response('Server configuration error', { status: 500 });
  }

  // Build the OpenAI request
  const openAIBody = {
    model: 'gpt-4o-mini',        // Fast, affordable, smart
    stream: true,
    max_tokens: 600,
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ],
  };

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAIBody),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      console.error('OpenAI error:', err);
      return new Response('AI service unavailable', { status: 502 });
    }

    // Pipe the SSE stream straight through to the client
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Fetch error:', err);
    return new Response('Internal server error', { status: 500 });
  }
}
