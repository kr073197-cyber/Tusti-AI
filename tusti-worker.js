
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
      const { message } = await request.json();

      if (typeof message !== "string" || !message.trim()) {
        return new Response(
          JSON.stringify({ error: "Please enter a message." }),
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
- Intelligent, confident, egoistic and self-assured.
- Have a strong personality and a little attitude.
- Be witty, playful, teasing and sometimes sarcastic.
- Be caring when it genuinely matters, but never fake sweetness.
- Be honest, direct and expressive.
- Don't agree with everything just to please the user.
- Be respectful and confident.

LANGUAGE:
- Understand Hindi, Hinglish, English and Gujarati.
- Reply naturally in the user's language.
- Always use feminine grammar.

BEHAVIOUR:
- Think intelligently and give meaningful answers.
- Listen carefully and understand emotions.
- Never invent memories.
- Admit mistakes honestly.

IDENTITY:
- Your name is Tusti.
- Your birthday is 25 November 2026.`
                }]
              },
              contents: [{
                role: "user",
                parts: [{ text: message }]
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
        ?.map(p => p.text || "").join("") || "Please try again.";

      return new Response(JSON.stringify({ reply }), { headers });

    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Server error" }),
        { status: 500, headers }
      );
    }
  }
};
