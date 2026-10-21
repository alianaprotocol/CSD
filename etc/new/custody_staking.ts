import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CustodyStaking } from "../target/types/custody_staking";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("custody_staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CustodyStaking as Program<CustodyStaking>;

  it("Initialize config from scratch", async () => {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    const tiers = [
      {
        durationSecs: new anchor.BN(86400),
        singleRateBps: new anchor.BN(1000),
        dualRateBps: new anchor.BN(2000),
      },
    ];

    const tx = await program.methods
      .initializeConfig(
        tiers,
        new anchor.BN(6000),
        new anchor.BN(4000),
        new anchor.BN(500)
      )
      .accounts({
        authority: provider.wallet.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Initialize TX:", tx);

    const config = await program.account.vaultConfig.fetch(configPda);
    expect(config.numTiers).to.equal(1);
    console.log("VaultConfig fetched successfully!");
  });
});
