import { useMemo, useState, useCallback } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
  useConnection,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

const PROGRAM_ID = "39CDc5zXBMFkjqZoELL4bYr9VrMNZCk1e9tzGnrgmdpz";
const ENDPOINT = clusterApiUrl("devnet");

function makeSessionId() {
  return `RWA-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function Dashboard() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem("rwa_session_id");
    if (existing) return existing;
    const id = makeSessionId();
    localStorage.setItem("rwa_session_id", id);
    return id;
  });
  const [balance, setBalance] = useState<number | null>(null);
  const [collateral, setCollateral] = useState(100);
  const [borrowed, setBorrowed] = useState(50);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const LTV = 0.7;
  const health = (collateral * LTV) / Math.max(borrowed, 0.0001);

  const addLog = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString();
    setLog((prev) => [`[${t}] ${msg}`, ...prev].slice(0, 40));
  }, []);

  const refreshBalance = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
      addLog(`Balance: ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch (e: any) {
      addLog(`Balance error: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const stress = () => {
    const next = Math.floor(collateral * LTV * 0.95);
    setBorrowed(next);
    addLog(`Risk up — borrowed → ${next}`);
  };

  const runAgent = () => {
    if (health < 1.25 && borrowed > 0) {
      const repay = Math.max(1, Math.floor(borrowed * 0.3));
      setBorrowed((b) => b - repay);
      addLog(`Agent: REPAY ${repay} (health was ${health.toFixed(3)})`);
    } else {
      addLog(`Agent: HOLD (health ${health.toFixed(3)})`);
    }
  };

  const reset = () => {
    setCollateral(100);
    setBorrowed(50);
    addLog("Position reset");
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24, color: "#e2e8f0", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Agentic RWA Risk Manager</h1>
          <p style={{ margin: "8px 0 0", color: "#94a3b8" }}>Solana Devnet · Connect wallet to try</p>
        </div>
        <WalletMultiButton />
      </header>

      <section style={card}>
        <h2 style={h2}>Try it</h2>
        <ol style={{ color: "#cbd5e1", lineHeight: 1.7, paddingLeft: 20 }}>
          <li>Click <b>Select Wallet</b> → Phantom (set network to <b>Devnet</b> in Phantom settings).</li>
          <li>Get free SOL: <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" style={{ color: "#818cf8" }}>faucet.solana.com</a></li>
          <li>Click <b>Refresh balance</b>, then use agent controls.</li>
          <li>On-chain program:{" "}
            <a
              href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#818cf8", wordBreak: "break-all" }}
            >
              {PROGRAM_ID}
            </a>
          </li>
        </ol>
        <p style={{ color: "#64748b", fontSize: 13 }}>Session ID: <code>{sessionId}</code></p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 16 }}>
        <Stat label="Wallet" value={connected && publicKey ? publicKey.toBase58().slice(0, 8) + "…" : "Not connected"} />
        <Stat label="SOL (Devnet)" value={balance === null ? "—" : balance.toFixed(4)} />
        <Stat label="Collateral" value={String(collateral)} />
        <Stat label="Borrowed" value={String(borrowed)} />
        <Stat label="Health" value={health.toFixed(3)} alert={health < 1.25} />
      </div>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={h2}>Wallet</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button style={btn} disabled={!connected || busy} onClick={refreshBalance}>Refresh balance</button>
          <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>
            Open faucet
          </a>
        </div>
        {!connected && (
          <p style={{ color: "#fbbf24", fontSize: 14, marginTop: 12 }}>
            Connect Phantom (Devnet) to load your SOL balance.
          </p>
        )}
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={h2}>Agent controls</h2>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>Same risk logic as the terminal agent. Browser simulator is instant; CLI scripts do real deposit/borrow/repay.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <button style={{ ...btn, background: "#e11d48" }} onClick={stress}>Increase risk</button>
          <button style={{ ...btn, background: "#4f46e5" }} onClick={runAgent}>Run agent cycle</button>
          <button style={btn} onClick={reset}>Reset</button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={h2}>Activity</h2>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, maxHeight: 240, overflow: "auto" }}>
          {log.length === 0 && <div style={{ color: "#64748b" }}>No events yet</div>}
          {log.map((line, i) => (
            <div key={i} style={{ marginBottom: 6, color: "#cbd5e1" }}>{line}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={card}>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 8, color: alert ? "#fbbf24" : "#fff" }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 16,
  padding: 20,
};

const h2: React.CSSProperties = { margin: "0 0 12px", fontSize: 18 };

const btn: React.CSSProperties = {
  background: "#334155",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  padding: "10px 16px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

export default function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div style={{ minHeight: "100vh", background: "#070b14" }}>
            <Dashboard />
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
