
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, mintTo } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey("39CDc5zXBMFkjqZoELL4bYr9VrMNZCk1e9tzGnrgmdpz");

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const keyPath = path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

  const accounts = JSON.parse(
    fs.readFileSync("scripts/devnet-accounts.json", "utf-8")
  );

  const vault = new PublicKey(accounts.vault);
  const position = new PublicKey(accounts.position);
  const stableMint = new PublicKey(accounts.stableMint);
  const userStable = new PublicKey(accounts.userStableAta);
  const vaultStable = new PublicKey(accounts.vaultStableAta);

  
  console.log("Funding vault with stable liquidity (demo)...");
  await mintTo(
    connection,
    wallet,
    stableMint,
    vaultStable,
    wallet,
    1_000_000_000 // 1000 stable (6 decimals)
  );

  const idl = JSON.parse(
    fs.readFileSync("target/idl/agentic_rwa_modern.json", "utf-8")
  );
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const program = new Program(idl as anchor.Idl, provider);

  
  const amount = new anchor.BN(50_000_000);

  console.log("Borrowing 50 stable...");
  const tx = await program.methods
    .borrow(amount)
    .accounts({
      user: wallet.publicKey,
      position: position,
      vault: vault,
      stableMint: stableMint,
      userStableAccount: userStable,
      vaultStableAccount: vaultStable,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("Success. Tx:", tx);
  console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
