import { NextResponse } from "next/server";
import { applyApproval } from "../../../lib/policy";
import { loadState, saveState } from "../../../lib/store";
import { sendTransfer } from "../../../lib/near";

// POST /api/approvals — record a human approval as a REAL testnet transfer
// from the approver's account to the treasury (a tiny amount). The approval
// is only recorded when that transfer lands and returns a hash.
// Without approver keys configured this returns 503 — approvals are never
// recorded without on-chain evidence.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    proposalId?: string;
    approver?: string;
  } | null;
  if (!body?.proposalId || !body?.approver) {
    return NextResponse.json({ error: "proposalId and approver required" }, { status: 400 });
  }
  const state = await loadState();
  const policy = state.policy;
  const proposal = state.proposals.find((p) => p.id === body.proposalId);
  if (!proposal) return NextResponse.json({ error: "proposal not found" }, { status: 404 });

  let accounts: Record<string, string> = {};
  let keys: Record<string, string> = {};
  try {
    accounts = JSON.parse(process.env.APPROVER_ACCOUNTS_JSON ?? "{}") as Record<string, string>;
    keys = JSON.parse(process.env.APPROVER_KEYS_JSON ?? "{}") as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "misconfigured approver env vars" }, { status: 500 });
  }
  const approverAccount = accounts[body.approver];
  const approverKey = keys[body.approver];
  const treasuryId = policy.treasuryAccountId || process.env.TREASURY_ACCOUNT_ID;
  if (!approverAccount || !approverKey || !treasuryId) {
    return NextResponse.json(
      { error: "testnet signing not configured for this approver (APPROVER_ACCOUNTS_JSON / APPROVER_KEYS_JSON / TREASURY_ACCOUNT_ID)" },
      { status: 503 },
    );
  }
  let txHash: string;
  try {
    txHash = await sendTransfer({
      fromAccountId: approverAccount,
      fromPrivateKey: approverKey,
      toAccountId: treasuryId,
      amountNear: process.env.APPROVAL_AMOUNT_NEAR ?? "0.00001",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `approval transfer failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
  try {
    const next = applyApproval(policy, proposal, body.approver, txHash, new Date().toISOString());
    state.proposals = state.proposals.map((p) => (p.id === next.id ? next : p));
    await saveState(state);
    return NextResponse.json({ proposal: next });
  } catch (e) {
    // Transfer landed but the policy rejected the approval (e.g. duplicate).
    // Report honestly: the hash exists on-chain but was not applied.
    return NextResponse.json(
      { error: (e as Error).message, txHash, note: "transfer landed on testnet but was not applied to the proposal" },
      { status: 409 },
    );
  }
}
