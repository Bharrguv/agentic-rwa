
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const keyPath = path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));

  const accounts = JSON.parse(
    fs.readFileSync("scripts/devnet-accounts.json", "utf-8")
  );

  const vault = new PublicKey(accounts.vault);
  const rwaMint = new PublicKey(accounts.rwaMint);
  const stableMint = new PublicKey(accounts.stableMint);

  console.log("Creating vault RWA ATA...");
  const vaultRwa = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    rwaMint,
    vault,
    true // allowOwnerOffCurve — vault is a PDA
  );

  console.log("Creating vault stable ATA...");
  const vaultStable = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    stableMint,
    vault,
    true
  );

  accounts.vaultRwaAta = vaultRwa.address.toBase58();
  accounts.vaultStableAta = vaultStable.address.toBase58();

  fs.writeFileSync(
    "scripts/devnet-accounts.json",
    JSON.stringify(accounts, null, 2)
  );

  console.log("Vault RWA ATA:", vaultRwa.address.toBase58());
  console.log("Vault Stable ATA:", vaultStable.address.toBase58());
  console.log("Saved scripts/devnet-accounts.json");
}

main().catch(console.error);
