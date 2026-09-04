

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export async function repayOnChain(
  program: anchor.Program,
  user: anchor.web3.Keypair,
  amount: number,
  accounts: {
    position: PublicKey;
    vault: PublicKey;
    stableMint: PublicKey;
    userStable: PublicKey;
    vaultStable: PublicKey;
    tokenProgram: PublicKey;
  }
) {
  console.log(`[on-chain] Sending repay ix for amount=${amount}`);

  
  const tx = await program.methods
    .repay(new anchor.BN(amount))
    .accounts({
      user: user.publicKey,
      position: accounts.position,
      vault: accounts.vault,
      stableMint: accounts.stableMint,
      userStableAccount: accounts.userStable,
      vaultStableAccount: accounts.vaultStable,
      tokenProgram: accounts.tokenProgram,
    })
    .signers([user])
    .rpc();

  console.log(`[on-chain] Repay confirmed: ${tx}`);
  return tx;
}

