import { NextResponse } from "next/server";
import { applyExecution, canExecute, spentByCategory } from "../../../lib/policy";
import { loadState, saveState } from "../../../lib/store";
import { sendTransfer } from "../../../lib/near";

// POST /api/execute — move funds for an approved (or auto-eligible) proposal.
// The policy gate runs immediately before signing; without testnet signing
// configured this returns 503 rather than claiming a transfer.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { proposalId?: string } | null;
  if (!body?.proposalId) {
    return NextResponse.json({ error: "proposalId required" }, { status: 400 });
  }
  const state = await loadState();
  const policy = state.policy;
  const proposal = state.proposals.find((p) => p.id === body.proposalId);
  if (!proposal) return NextResponse.json({ error: "proposal not found" }, { status: 404 });
  const spent = spentByCategory(state.proposals);
  const gate = canExecute(policy, spent, proposal);
  if (!gate.ok) {
    return NextResponse.json({ error: `execution blocked: ${gate.reason}` }, { status: 409 });
  }
  const treasuryId = process.env.TREASURY_ACCOUNT_ID;
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryId || !treasuryKey) {
    return NextResponse.json(
      { error: "testnet signing not configured (TREASURY_ACCOUNT_ID / TREASURY_PRIVATE_KEY)" },
      { status: 503 },
    );
  }
  let txHash: string;
  try {
    txHash = await sendTransfer({
      fromAccountId: treasuryId,
      fromPrivateKey: treasuryKey,
      toAccountId: proposal.vendorAccountId,
      amountNear: proposal.amountNear,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `execution transfer failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
  const executed = applyExecution(policy, spent, proposal, txHash);
  state.proposals = state.proposals.map((p) => (p.id === executed.id ? executed : p));
  await saveState(state);
  return NextResponse.json({ proposal: executed });
}
