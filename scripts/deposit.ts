
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
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
  const rwaMint = new PublicKey(accounts.rwaMint);
  const userRwa = new PublicKey(accounts.userRwaAta);
  const vaultRwa = new PublicKey(accounts.vaultRwaAta);

  const [positionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), wallet.publicKey.toBuffer()],
    PROGRAM_ID
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

  // 100 RWA with 6 decimals = 100_000_000
  const amount = new anchor.BN(100_000_000);

  console.log("User:", wallet.publicKey.toBase58());
  console.log("Position PDA:", positionPda.toBase58());
  console.log("Depositing 100 RWA...");

  const tx = await program.methods
    .depositCollateral(amount)
    .accounts({
      user: wallet.publicKey,
      position: positionPda,
      vault: vault,
      rwaMint: rwaMint,
      userRwaAccount: userRwa,
      vaultRwaAccount: vaultRwa,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("Success. Tx:", tx);
  console.log(
    `https://explorer.solana.com/tx/${tx}?cluster=devnet`
  );

  accounts.position = positionPda.toBase58();
  fs.writeFileSync(
    "scripts/devnet-accounts.json",
    JSON.stringify(accounts, null, 2)
  );
  console.log("Saved position to devnet-accounts.json");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
