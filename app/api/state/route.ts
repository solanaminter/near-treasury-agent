import { NextResponse } from "next/server";
import { loadState, stateSummary } from "../../../lib/store";
import { verifyTransaction } from "../../../lib/near";

// GET /api/state — dashboard state plus live on-chain verification of every
// recorded transaction hash (via the NEARBlocks indexer GET API).
export async function GET() {
  const state = await loadState();
  const summary = stateSummary(state);
  const hashes = new Map<string, { approver?: string; kind: string }>();
  for (const p of state.proposals) {
    for (const a of p.approvals) hashes.set(a.txHash, { approver: a.approver, kind: "approval" });
    if (p.executionTxHash) hashes.set(p.executionTxHash, { kind: "execution" });
  }
  const verifications: Record<string, unknown> = {};
  await Promise.all(
    [...hashes.entries()].map(async ([hash, meta]) => {
      try {
        verifications[hash] = {
          ...meta,
          ...(await verifyTransaction(hash)),
        };
      } catch {
        verifications[hash] = { ...meta, found: false };
      }
    }),
  );
  return NextResponse.json({
    ...summary,
    verifications,
    signingConfigured: Boolean(
      process.env.TREASURY_ACCOUNT_ID && process.env.TREASURY_PRIVATE_KEY,
    ),
  });
}
