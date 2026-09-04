
import {
  Connection,
  Keypair,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  
  const keyPath = path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));

  console.log("Wallet:", payer.publicKey.toBase58());
  const bal = await connection.getBalance(payer.publicKey);
  console.log("Balance:", bal / LAMPORTS_PER_SOL, "SOL");

  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    console.log("Low SOL — request airdrop from https://faucet.solana.com");
  }

  
  console.log("\nCreating RWA mint...");
  const rwaMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6
  );
  console.log("RWA mint:", rwaMint.toBase58());

  
  console.log("Creating stable mint...");
  const stableMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6
  );
  console.log("Stable mint:", stableMint.toBase58());

  
  const userRwa = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    rwaMint,
    payer.publicKey
  );
  const userStable = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    stableMint,
    payer.publicKey
  );

  
  await mintTo(connection, payer, rwaMint, userRwa.address, payer, 1_000_000_000); // 1000 RWA (6 decimals)
  await mintTo(connection, payer, stableMint, userStable.address, payer, 5_000_000_000); // 5000 stable

  console.log("\nUser RWA ATA:", userRwa.address.toBase58());
  console.log("User Stable ATA:", userStable.address.toBase58());

  
  const out = {
    cluster: "devnet",
    programId: "39CDc5zXBMFkjqZoELL4bYr9VrMNZCk1e9tzGnrgmdpz",
    authority: payer.publicKey.toBase58(),
    rwaMint: rwaMint.toBase58(),
    stableMint: stableMint.toBase58(),
    userRwaAta: userRwa.address.toBase58(),
    userStableAta: userStable.address.toBase58(),
  };
  fs.writeFileSync("scripts/devnet-accounts.json", JSON.stringify(out, null, 2));
  console.log("\nSaved scripts/devnet-accounts.json");
  console.log("Next: initialize vault on-chain (initialize_vault instruction).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
