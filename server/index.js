require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

function ruleDecide(collateral, borrowed, ltvBps) {
  const health =
    collateral > 0
      ? (collateral * ltvBps) / 10000 / Math.max(borrowed, 0.0001)
      : 999;
  if (health < 1.25 && borrowed > 0) {
    return {
      action: "repay",
      amount: Math.max(1, Math.floor(borrowed * 0.3)),
      reason: `Health ${health.toFixed(3)} below 1.25 — reduce debt`,
      source: "rules",
      health,
    };
  }
  return {
    action: "hold",
    amount: 0,
    reason: `Health ${health.toFixed(3)} is acceptable`,
    source: "rules",
    health,
  };
}

async function groqDecide(collateral, borrowed, ltvBps) {
  const health =
    collateral > 0
      ? (collateral * ltvBps) / 10000 / Math.max(borrowed, 0.0001)
      : 999;

  const prompt = `You are a risk agent for a Solana RWA vault.
Collateral: ${collateral} RWA, Borrowed: ${borrowed}, LTV cap: ${ltvBps / 100}%, Health: ${health.toFixed(3)}.
Reply ONLY JSON: {"action":"repay"|"hold","amount":number,"reason":"short"}
If health < 1.25 repay 20-40% of debt as integer. Else hold.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 120,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Groq ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("Bad LLM JSON");
  const parsed = JSON.parse(match[0]);
  return { ...parsed, source: "groq", health };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    groqConfigured: Boolean(GROQ_API_KEY),
    cluster: "devnet",
  });
});

app.post("/api/agent/decide", async (req, res) => {
  try {
    const collateral = Number(req.body.collateral ?? 100);
    const borrowed = Number(req.body.borrowed ?? 50);
    const ltvBps = Number(req.body.ltvBps ?? 7000);

    if (!GROQ_API_KEY) {
      return res.json(ruleDecide(collateral, borrowed, ltvBps));
    }
    try {
      const decision = await groqDecide(collateral, borrowed, ltvBps);
      return res.json(decision);
    } catch (e) {
      const fallback = ruleDecide(collateral, borrowed, ltvBps);
      return res.json({
        ...fallback,
        reason: `${fallback.reason} (LLM fallback: ${e.message})`,
        source: "rules_fallback",
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Agent API http://localhost:${PORT}`);
  console.log(`Groq: ${GROQ_API_KEY ? "configured" : "not set — using rules"}`);
});
