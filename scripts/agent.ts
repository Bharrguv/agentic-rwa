
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const LIVE_ONCHAIN = process.env.LIVE_ONCHAIN === "1";
const PROGRAM_ID = new PublicKey("39CDc5zXBMFkjqZoELL4bYr9VrMNZCk1e9tzGnrgmdpz");

const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};

function log(msg: string, color = c.reset) {
  const time = new Date().toLocaleTimeString();
  console.log(`${c.cyan}[${time}]${c.reset} ${color}${msg}${c.reset}`);
}

async function askGroq(collateral: number, borrowed: number, ltvBps: number) {
  const health =
    collateral > 0
      ? (collateral * ltvBps) / 10000 / Math.max(borrowed, 0.0001)
      : 999;

  if (health < 1.25 && borrowed > 0) {
    const amount = Math.max(1, Math.floor(borrowed * 0.3));
    // Still try LLM for the reason when key exists
  }

  if (!GROQ_API_KEY) {
    if (health < 1.25 && borrowed > 0) {
      return {
        action: "repay",
        amount: Math.max(1, Math.floor(borrowed * 0.3)),
        reason: `Health ${health.toFixed(3)} low (rule)`,
      };
    }
    return { action: "hold", amount: 0, reason: "Healthy (no LLM key)" };
  }

  const prompt = `You are an autonomous risk agent for a Solana RWA lending vault.
Position:
- Collateral: ${collateral} RWA
- Borrowed: ${borrowed} stable
- Max LTV: ${ltvBps / 100}%
- Health Factor: ${health.toFixed(3)}

Reply ONLY with JSON:
{"action":"repay"|"hold","amount":number,"reason":"short text"}
If health < 1.25 repay 20-40% of debt (integer amount). Otherwise hold.`;

  try {
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
      const errText = await res.text();
      log(`Groq HTTP ${res.status}: ${errText.slice(0, 100)}`, c.red);
    } else {
      const data: any = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch (e: any) {
    log(`Groq error: ${e.message || e}`, c.red);
  }

  if (health < 1.25 && borrowed > 0) {
    return {
      action: "repay",
      amount: Math.max(1, Math.floor(borrowed * 0.3)),
      reason: "Fallback repay (LLM unavailable)",
    };
  }
  return { action: "hold", amount: 0, reason: "Holding" };
}

async function repayOnChain(humanAmount: number): Promise<string | null> {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const keyPath = path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

  const accounts = JSON.parse(
    fs.readFileSync("scripts/devnet-accounts.json", "utf-8")
  );

  const idl = JSON.parse(
    fs.readFileSync("target/idl/agentic_rwa_modern.json", "utf-8")
  );
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  const program = new Program(idl as anchor.Idl, provider);

  const amount = new anchor.BN(Math.floor(humanAmount * 1_000_000));

  const tx = await program.methods
    .repay(amount)
    .accounts({
      user: wallet.publicKey,
      position: new PublicKey(accounts.position),
      vault: new PublicKey(accounts.vault),
      stableMint: new PublicKey(accounts.stableMint),
      userStableAccount: new PublicKey(accounts.userStableAta),
      vaultStableAccount: new PublicKey(accounts.vaultStableAta),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}

async function main() {
  console.clear();
  console.log(`${c.bold}${c.magenta}
╔══════════════════════════════════════════════════════╗
║     AGENTIC RWA YIELD & RISK MANAGER                 ║
║     Solana Devnet  •  Groq LLM  •  On-chain repay    ║
╚══════════════════════════════════════════════════════╝
${c.reset}`);

  log(
    LIVE_ONCHAIN
      ? "MODE: LIVE on-chain repay enabled"
      : "MODE: simulation (set LIVE_ONCHAIN=1 for real txs)",
    LIVE_ONCHAIN ? c.green : c.yellow
  );

  if (GROQ_API_KEY) log("Groq key detected", c.green);
  else log("No GROQ_API_KEY — rule-based decisions", c.yellow);

  // Mirror approximate on-chain state after your deposit/borrow/repay demos
  // 100 RWA collateral, remaining debt after 15 repay ≈ 35 if you borrowed 50
  let collateral = 100;
  let borrowed = 35;
  const ltvBps = 7000;

  log("Monitoring loop started", c.cyan);
  console.log("");

  let cycle = 1;
  while (true) {
    const health =
      (collateral * ltvBps) / 10000 / Math.max(borrowed, 0.0001);

    console.log(
      `${c.bold}─── Cycle #${cycle} ───────────────────────────────${c.reset}`
    );
    log(`Collateral : ${collateral} RWA`);
    log(`Borrowed   : ${borrowed} stable`);
    log(
      `Health     : ${health.toFixed(3)} ${
        health < 1.25 ? c.red + "⚠ LOW" : c.green + "✓ OK"
      }`
    );

    const decision = await askGroq(collateral, borrowed, ltvBps);
    log(
      `Decision → ${String(decision.action).toUpperCase()} ${
        decision.amount || ""
      }`,
      c.magenta
    );
    log(`Reason: ${decision.reason}`, c.yellow);

    if (decision.action === "repay" && decision.amount > 0 && borrowed > 0) {
      const repayAmt = Math.min(Number(decision.amount), borrowed);

      if (LIVE_ONCHAIN) {
        try {
          log(`Sending on-chain repay of ${repayAmt}...`, c.cyan);
          const tx = await repayOnChain(repayAmt);
          borrowed -= repayAmt;
          log(`✓ On-chain repay confirmed`, c.green);
          log(
            `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
            c.cyan
          );
        } catch (e: any) {
          log(`On-chain repay failed: ${e.message || e}`, c.red);
          log("Keeping simulated balances unchanged this cycle", c.yellow);
        }
      } else {
        borrowed -= repayAmt;
        log(`✓ Simulated repay of ${repayAmt}`, c.green);
      }
    } else {
      log(`✓ Holding position`, c.green);
    }

    console.log("");
    cycle++;
    await new Promise((r) => setTimeout(r, 8000));
  }
}

main().catch(console.error);
