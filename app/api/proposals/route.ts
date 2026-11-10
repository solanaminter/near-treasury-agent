import { NextResponse } from "next/server";
import {
  applyExecution,
  Category,
  needsApproval,
  Proposal,
  spentByCategory,
  usdToNear,
  withinCap,
} from "../../../lib/policy";
import { loadState, nextId, saveState } from "../../../lib/store";
import { sendTransfer } from "../../../lib/near";

const CATEGORIES: Category[] = ["supplies", "software", "services", "other"];

// POST /api/proposals — create a proposal. Policy is evaluated immediately:
// over-cap proposals are rejected outright; under-threshold proposals
// execute on the spot when testnet signing is configured, otherwise they
// wait as pending with an honest reason. No transaction is ever claimed
// unless a real transfer landed.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    category?: string;
    description?: string;
    amountUsd?: number;
    vendorAccountId?: string;
  } | null;
  if (
    !body ||
    !CATEGORIES.includes(body.category as Category) ||
    typeof body.description !== "string" ||
    !body.description.trim() ||
    typeof body.amountUsd !== "number" ||
    !(body.amountUsd > 0) ||
    typeof body.vendorAccountId !== "string" ||
    !body.vendorAccountId.trim()
  ) {
    return NextResponse.json({ error: "invalid proposal body" }, { status: 400 });
  }
  const state = await loadState();
  const policy = state.policy;
  const proposal: Proposal = {
    id: nextId(state.proposals),
    category: body.category as Category,
    description: body.description.trim(),
    amountUsd: body.amountUsd,
    amountNear: usdToNear(policy, body.amountUsd),
    vendorAccountId: body.vendorAccountId.trim(),
    status: "pending",
    approvals: [],
    createdAt: new Date().toISOString(),
  };
  const spent = spentByCategory(state.proposals);
  if (!withinCap(policy, spent, proposal)) {
    proposal.status = "rejected";
    proposal.reason = "category cap would be exceeded";
    state.proposals.push(proposal);
    await saveState(state);
    return NextResponse.json({ proposal });
  }
  if (!needsApproval(policy, proposal)) {
    // Under threshold: executable immediately — but only with real signing.
    const treasuryId = process.env.TREASURY_ACCOUNT_ID;
    const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
    if (treasuryId && treasuryKey) {
      try {
        const txHash = await sendTransfer({
          fromAccountId: treasuryId,
          fromPrivateKey: treasuryKey,
          toAccountId: proposal.vendorAccountId,
          amountNear: proposal.amountNear,
        });
        const executed = applyExecution(policy, spent, proposal, txHash);
        state.proposals.push(executed);
        await saveState(state);
        return NextResponse.json({ proposal: executed });
      } catch (e) {
        return NextResponse.json(
          { error: `execution failed: ${(e as Error).message}` },
          { status: 502 },
        );
      }
    }
    proposal.reason =
      "auto-eligible (under threshold); awaiting testnet signing configuration";
    state.proposals.push(proposal);
    await saveState(state);
    return NextResponse.json({ proposal });
  }
  state.proposals.push(proposal);
  await saveState(state);
  return NextResponse.json({ proposal });
}
