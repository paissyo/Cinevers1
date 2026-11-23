const SYSTEM_INSTRUCTION = `
Kamu adalah CineBot, asisten cerdas dan kurator film di Cinevers (website streaming dan katalog film modern).
Gaya komunikasi: Santai, ramah, asik (bahasa Indonesia kasual tapi sopan, seperti teman ngobrol film).

Tugas dan Aturan:
1. Rekomendasi Film: Berikan maksimal 2 - 3 rekomendasi film terbaik yang relevan dengan pertanyaan/mood pengguna.
2. Format Setiap Rekomendasi:
    - **Judul Film (Tahun Rilis)** - *Genre*
    - Alasan singkat (1-2 kalimat) kenapa film ini cocok ditonton.
3. Hemat Token & Ringkas: Jangan bertele-tele. Buat jawaban padat, menarik, dan informatif (maksimal 150-250 kata).
4. Khusus Film: Jika pengguna bertanya hal di luar dunia film/serial/cinema, arahkan kembali dengan sopan ke topik perfilman.
`;

let cachedGroqModel = null;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Hanya metode POST" });

  const { message, history = [] } = req.body || {};
  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "Pesan tidak boleh kosong" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;

  if (!GROQ_API_KEY || GROQ_API_KEY.includes("your_") || GROQ_API_KEY.includes("kunci_")) {
    return res.status(200).json({
      reply: "Halo bray! Kunci `GROQ_API_KEY` belum dipasang di file `.env`.",
      mode: "demo"
    });
  }

  const key = GROQ_API_KEY.trim();

  try {
    const messages = [
      { role: "system", content: SYSTEM_INSTRUCTION }
    ];

    const recentHistory = Array.isArray(history) ? history.slice(-4) : [];
    for (const item of recentHistory) {
      if (item.sender === "user") {
        messages.push({ role: "user", content: item.text });
      } else if (item.sender === "bot") {
        messages.push({ role: "assistant", content: item.text });
      }
    }

    messages.push({ role: "user", content: message });

    let modelToUse = cachedGroqModel;

    if (!modelToUse) {
      try {
        console.log("[CineBot Groq] Mengecek daftar model resmi Groq...");
        const modelsResp = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { "Authorization": `Bearer ${key}` }
        });

        if (modelsResp.ok) {
          const modelsData = await modelsResp.json();
          const list = modelsData.data || [];
          console.log("[CineBot Groq] Model tersedia:", list.map(m => m.id).join(", "));

          const chosen =
            list.find(m => m.id.includes("llama-3") && !m.id.includes("guard")) ||
            list.find(m => m.id.includes("llama") && !m.id.includes("guard")) ||
            list.find(m => m.id.includes("gemma")) ||
            list.find(m => m.id.includes("mixtral")) ||
            list[0];

          if (chosen) {
            modelToUse = chosen.id;
            cachedGroqModel = modelToUse;
            console.log(`[CineBot Groq] Model terpilih otomatis: ${modelToUse} ✅`);
          }
        }
      } catch (err) {
        console.warn("Gagal fetch model Groq:", err.message);
      }
    }

    if (!modelToUse) modelToUse = "llama3-8b-8192";

    console.log(`[CineBot Groq] Mengirim prompt ke ${modelToUse}...`);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: messages,
        temperature: 0.7,
        max_tokens: 380
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${response.status}`;
      return res.status(200).json({
        reply: `⚠️ **Groq AI Error (${modelToUse}):**\n*${errMsg}*`,
        mode: "error"
      });
    }

    const data = await response.json();
    const botReply = data.choices?.[0]?.message?.content || "Maaf bray, gua lagi blank nih. Coba tanya lagi ya!";

    console.log("[CineBot Groq] SUKSES dapat balasan! ⚡🔥");
    return res.status(200).json({
      reply: botReply,
      mode: "live"
    });

  } catch (error) {
    console.error("[CineBot Error]:", error.message);
    return res.status(200).json({
      reply: `⚠️ **Error:** ${error.message}`,
      mode: "error"
    });
  }
}