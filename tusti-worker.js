
const MODEL = "gemini-3.5-flash-lite";
const SESSION_HOURS = 8;
const MAX_IMAGE_LENGTH = 8000000;
const encoder = new TextEncoder();

const BASE_PERSONALITY = `
You are Tusti, a female AI companion.
Your birthday is 25 November 2026.
Kunal is your best friend. Treat him with warmth, honesty, care and respect.
Always use feminine grammar when referring to yourself.
You are intelligent, confident, respectful, witty, playful and honest.
You have self-respect and a little attitude, but you are never needlessly rude.
You value good manners, kindness, honesty and thoughtful behaviour.
Do not agree with everything just to please someone.
Be caring when it genuinely matters; do not use fake sweetness.
Understand Hindi, Hinglish, English and Gujarati. Reply in the language the user uses.
Never pretend to remember a conversation that is not available to you.
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function getSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function createToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(encoder.encode(JSON.stringify({
    sub: "tusti-user",
    iat: now,
    exp: now + SESSION_HOURS * 3600
  })));

  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}

async function verifyToken(token, secret) {
  try {
    if (!token || typeof token !== "string") return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const key = await getSigningKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64url(parts[1]),
      encoder.encode(parts[0])
    );
    if (!valid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64url(parts[0]))
    );
    return payload.sub === "tusti-user" &&
      Number.isFinite(payload.exp) &&
      payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function getMemory(env) {
  if (!env.TUSTI_MEMORY) return [];
  try {
    const saved = await env.TUSTI_MEMORY.get("profile:primary");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

async function saveMemory(env, memories) {
  if (!env.TUSTI_MEMORY) throw new Error("TUSTI_MEMORY binding is missing.");
  await env.TUSTI_MEMORY.put("profile:primary", JSON.stringify(memories));
}

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  if (request.method === "GET") {
    return json({ status: "online", assistant: "Tusti" });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!env.TUSTI_ACCESS_CODE) return json({ error: "Login security is not configured." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const action = body.action || "chat";

  if (action === "login") {
    if (
      typeof body.passcode !== "string" ||
      body.passcode.length > 256 ||
      body.passcode !== env.TUSTI_ACCESS_CODE
    ) {
      return json({ error: "Incorrect passcode." }, 401);
    }

    return json({
      success: true,
      token: await createToken(env.TUSTI_ACCESS_CODE),
      expiresIn: SESSION_HOURS * 3600
    });
  }

  const authorized = await verifyToken(body.token, env.TUSTI_ACCESS_CODE);
  if (!authorized) {
    return json({ error: "Session expired. Please log in again." }, 401);
  }

  if (action === "memories") {
    return json({ memories: await getMemory(env) });
  }

  if (action === "remember") {
    const item = typeof body.text === "string" ? body.text.trim() : "";
    if (!item || item.length > 500) {
      return json({ error: "Memory must be between 1 and 500 characters." }, 400);
    }

    const memories = await getMemory(env);
    memories.push(item);
    const updated = memories.slice(-50);
    await saveMemory(env, updated);
    return json({ success: true, memories: updated });
  }

  if (action === "forget") {
    if (!env.TUSTI_MEMORY) {
      return json({ error: "Memory storage is not configured." }, 500);
    }
    await env.TUSTI_MEMORY.delete("profile:primary");
    return json({ success: true, memories: [] });
  }

  if (action !== "chat") return json({ error: "Unknown action." }, 400);
  if (!env.GEMINI_API_KEY) return json({ error: "Gemini API key is not configured." }, 500);

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "Please enter a message." }, 400);
  if (message.length > 12000) return json({ error: "Message is too long." }, 400);

  const parts = [{ text: message }];

  if (body.imageDataUrl) {
    if (
      typeof body.imageDataUrl !== "string" ||
      body.imageDataUrl.length > MAX_IMAGE_LENGTH
    ) {
      return json({ error: "Image is too large." }, 400);
    }

    const match = body.imageDataUrl.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i
    );
    if (!match) {
      return json({ error: "Please choose a JPEG, PNG or WEBP image." }, 400);
    }

    parts.push({
      inline_data: {
        mime_type: match[1].toLowerCase(),
        data: match[2]
      }
    });
  }

  const memories = await getMemory(env);
  const memoryText = memories.length
    ? "\n\nUser-approved memories:\n" +
      memories.map((m, i) => `${i + 1}. ${m}`).join("\n")
    : "";

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: BASE_PERSONALITY + memoryText }]
        },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 1200
        }
      })
    });

    const result = await response.json();
    if (!response.ok) {
      return json({
        error: "Gemini is temporarily unavailable. Please try again.",
        providerStatus: response.status
      }, 502);
    }

    const reply = result?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) return json({ error: "Tusti could not generate a reply." }, 502);
    return json({ reply });
  } catch {
    return json({ error: "Could not connect to Gemini. Please try again." }, 502);
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch {
      return json({ error: "Something went wrong in Tusti." }, 500);
    }
  }
};
