
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
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

  const rwaMint = new PublicKey(accounts.rwaMint);
  const stableMint = new PublicKey(accounts.stableMint);

 
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    PROGRAM_ID
  );

  console.log("Authority:", wallet.publicKey.toBase58());
  console.log("Vault PDA:", vaultPda.toBase58());
  console.log("RWA mint:", rwaMint.toBase58());
  console.log("Stable mint:", stableMint.toBase58());

  
  const idlPath = "target/idl/agentic_rwa_modern.json";
  if (!fs.existsSync(idlPath)) {
    console.error("IDL not found. Run: anchor build");
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const program = new Program(idl as anchor.Idl, provider);

  const ltvBps = 7000; // 70%

  console.log("\nSending initialize_vault (ltv_bps=7000)...");

  try {
    const tx = await program.methods
      .initializeVault(ltvBps)
      .accounts({
        authority: wallet.publicKey,
        vault: vaultPda,
        rwaMint: rwaMint,
        stableMint: stableMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Success. Tx:", tx);
    console.log(
      "Explorer:",
      `https://explorer.solana.com/tx/${tx}?cluster=devnet`
    );

    accounts.vault = vaultPda.toBase58();
    accounts.ltvBps = ltvBps;
    fs.writeFileSync(
      "scripts/devnet-accounts.json",
      JSON.stringify(accounts, null, 2)
    );
    console.log("Updated scripts/devnet-accounts.json with vault PDA");
  } catch (e: any) {
    console.error("initialize_vault failed:");
    console.error(e.message || e);
    if (String(e.message || e).includes("already in use")) {
      console.log("Vault may already be initialized. Continuing is OK.");
      accounts.vault = vaultPda.toBase58();
      fs.writeFileSync(
        "scripts/devnet-accounts.json",
        JSON.stringify(accounts, null, 2)
      );
    }
  }
}

main().catch(console.error);
