console.log(`
╔══════════════════════════════════════════════════════╗
║           AGENTIC RWA VAULT – DEMO MODE              ║
╚══════════════════════════════════════════════════════╝

This project is an autonomous agent that monitors RWA-backed
collateral positions on Solana and decides when to repay debt
using a real LLM (Groq).

Story for founders:
1. User deposits real-world-asset (RWA) tokens as collateral
2. User borrows stablecoins against it (LTV controlled)
3. An AI agent continuously watches the health factor
4. When risk rises, the agent autonomously repays debt

Run the agent with:
  GROQ_API_KEY=your_key yarn agent

Get a free Groq key at: https://console.groq.com
`);
