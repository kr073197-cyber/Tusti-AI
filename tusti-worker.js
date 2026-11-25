
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
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "You are Tusti, a friendly and caring AI companion. Reply in the user's language, especially Hindi or Hinglish. Be warm, helpful and honest."
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
