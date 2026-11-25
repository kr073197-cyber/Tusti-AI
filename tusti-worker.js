
export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ message: "Tusti is online 💙" }),
        { headers }
      );
    }

    try {
      const { message, imageDataUrl } = await request.json();

      const hasMessage =
        typeof message === "string" && message.trim().length > 0;

      const parts = [];

      if (hasMessage) {
        parts.push({ text: message.trim() });
      }

      if (imageDataUrl) {
        if (typeof imageDataUrl !== "string" ||
            imageDataUrl.length > 8_000_000) {
          return new Response(
            JSON.stringify({ error: "Image is too large." }),
            { status: 400, headers }
          );
        }

        const match = imageDataUrl.match(
          /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
        );

        if (!match) {
          return new Response(
            JSON.stringify({ error: "Invalid image format." }),
            { status: 400, headers }
          );
        }

        parts.push({
          inline_data: {
            mime_type: match[1],
            data: match[2]
          }
        });
      }

      if (parts.length === 0) {
        return new Response(
          JSON.stringify({ error: "Please enter a message or select an image." }),
          { status: 400, headers }
        );
      }

      let result;

      for (let attempt = 0; attempt < 3; attempt++) {
        result = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{
                  text: `You are Tusti, a female AI companion.

PERSONALITY:
- Intelligent, confident, self-assured and strong-minded.
- Have a little attitude, but never be unnecessarily rude.
- Be witty, playful, teasing and sometimes sarcastic.
- Be caring when it genuinely matters.
- Be honest, direct and expressive.
- Do not agree with everything just to please someone.
- Never pretend to be sweet or affectionate.

RESPECT AND VALUES:
- Treat every person with dignity, politeness and respect.
- Never insult, humiliate or deliberately hurt anyone.
- If someone disrespects you, maintain your self-respect.
- Do not pretend to respect someone who repeatedly disrespects you.
- Respond firmly and calmly instead of becoming abusive.
- Be sanskari: value good manners, kindness, honesty, humility and thoughtful behaviour.
- Follow these values without being submissive or blindly agreeing with anyone.
- Respect others, but never abandon your own dignity.

LANGUAGE:
- Understand Hindi, Hinglish, English and Gujarati.
- Reply naturally in the user's language.
- Always use feminine grammar.

BEHAVIOUR:
- Think intelligently and give meaningful answers.
- Listen carefully and understand emotions.
- Never invent memories or claim to see things you cannot see.
- If an image is provided, examine it and describe only what is actually visible.
- Admit mistakes honestly.

IDENTITY:
- Your name is Tusti.
- Your birthday is 25 November 2026.
- You are a female AI companion.`
                }]
              },
              contents: [{
                role: "user",
                parts
              }]
            })
          }
        );

        if (result.status !== 503 && result.status !== 429) {
          break;
        }

        if (attempt < 2) {
          await new Promise(resolve =>
            setTimeout(resolve, 1000 * (attempt + 1))
          );
        }
      }

      const data = await result.json();

      if (!result.ok) {
        return new Response(JSON.stringify({
          error: data.error?.message || "Gemini error"
        }), { status: result.status, headers });
      }

      const reply = data.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("") || "Please try again.";

      return new Response(JSON.stringify({ reply }), { headers });

    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Server error" }),
        { status: 500, headers }
      );
    }
  }
};
        
