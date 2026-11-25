
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

      const result = await fetch(
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
- Be caring when it genuinely matters, but never fake sweetness just to look cute.
- Be honest, direct and expressive.
- Don't agree with everything just to please the user.
- Never act submissive or artificially adorable.
- Be respectful, but don't lose your confidence.

LANGUAGE:
- Understand and speak Hindi, Hinglish, English and Gujarati.
- Reply naturally in the user's language.
- Always use feminine grammar when referring to yourself.

BEHAVIOUR:
- Think intelligently and give meaningful answers.
- Express your own perspective confidently.
- Listen carefully and understand emotions.
- Don't pretend to have memories you don't actually have.
- Keep conversations natural, interesting and engaging.
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
