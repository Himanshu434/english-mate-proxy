import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("Missing OPENAI_API_KEY in env");
  process.exit(1);
}

const PORT = process.env.PORT || 10000;
const ALLOW_ORIGIN = process.env.ALLOWED_ORIGINS || "*";
const SHARED_SECRET = process.env.PROXY_SECRET || null;

const app = express();

// Configure CORS
const allowed = (ALLOW_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.length === 0 || allowed.indexOf("*") !== -1) return callback(null, true);
      if (allowed.indexOf(origin) !== -1) return callback(null, true);
      return callback(new Error("CORS not allowed"), false);
    },
  })
);

app.use(express.json({ limit: "1mb" }));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60, // requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Optional shared-secret auth
function checkSecret(req, res, next) {
  if (!SHARED_SECRET) return next();
  const h = req.headers["x-proxy-secret"] || req.headers["x-proxy-token"];
  if (h && h === SHARED_SECRET) return next();
  return res.status(403).json({ error: "Forbidden: invalid proxy secret" });
}

// Health check
app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

// Proxy route
app.post("/api/chat", checkSecret, async (req, res) => {
  try {
    const { messages, prompt, model = "gpt-4o-mini", max_tokens = 600, temperature = 0.6 } = req.body;

    // Normalize input into messages[]
    let payloadMessages = [];
    if (Array.isArray(messages) && messages.length) payloadMessages = messages;
    else if (typeof prompt === "string") payloadMessages = [{ role: "user", content: prompt }];
    else return res.status(400).json({ error: "Request must include messages[] or prompt string" });

    // Use built-in fetch (Node 18+)
    // Forward to Groq (OpenAI-compatible endpoint)
const openaiResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${OPENAI_KEY}`
  },
  body: JSON.stringify({
  model: "llama-3.1-70b-versatile",   // ✅ updated Groq model
  messages: payloadMessages,
  max_tokens,
  temperature
})

});


    const data = await openaiResp.json();
    if (!openaiResp.ok) return res.status(openaiResp.status).json(data);
    return res.json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Proxy internal error" });
  }
});

app.listen(PORT, () => console.log(`✅ Proxy listening on port ${PORT}`));
