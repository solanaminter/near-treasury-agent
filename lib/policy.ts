// Budget policy + treasury flow engine for the Treasury Agent.
// Pure logic — no chain calls here. Every state transition in this file is
// unit-tested (see tests/). The chain layer (lib/near.ts) only executes a
// transfer AFTER this engine says the proposal is executable, and every
// approval / execution it performs is recorded with its real testnet
// transaction hash. Nothing here ever fabricates a transaction.

export type Category = "supplies" | "software" | "services" | "other";

export interface BudgetPolicy {
  /** Max spend per category per month, in USD. */
  caps: Record<Category, number>;
  /** Purchases at or under this amount auto-execute; above it needs approval. */
  approvalThresholdUsd: number;
  /** Distinct approver roles that must sign an over-threshold proposal. */
  requiredApprovals: number;
  /** Roles allowed to approve (e.g. ["owner", "finance"]). */
  approvers: string[];
  /** Human-readable approver role shown in the UI. */
  approverRole: string;
  /** Public NEAR testnet account that holds treasury funds. No keys here. */
  treasuryAccountId: string;
  /** Demo conversion rate, USD -> NEAR, used ONLY to size testnet transfers. */
  demoUsdToNearRate: number;
}

export const DEFAULT_POLICY: BudgetPolicy = {
  caps: { supplies: 500, software: 300, services: 1000, other: 200 },
  approvalThresholdUsd: 100,
  requiredApprovals: 2,
  approvers: ["owner", "finance"],
  approverRole: "owner",
  treasuryAccountId: "",
  demoUsdToNearRate: 0.01,
};

export type ProposalStatus =
  | "pending"
  | "approved"
  | "executed"
  | "rejected";

export interface Approval {
  approver: string;
  /** Real NEAR testnet transaction hash of the approval transfer. */
  txHash: string;
  timestamp: string;
}

export interface Proposal {
  id: string;
  category: Category;
  description: string;
  amountUsd: number;
  /** NEAR amount of the execution transfer, derived from demoUsdToNearRate. */
  amountNear: string;
  vendorAccountId: string;
  status: ProposalStatus;
  approvals: Approval[];
  /** Set once a real NEAR testnet execution transfer lands. */
  executionTxHash?: string;
  /** Human-readable reason when rejected or blocked. */
  reason?: string;
  createdAt: string;
}

export function usdToNear(policy: BudgetPolicy, amountUsd: number): string {
  // Keep 5 decimal places: enough precision for demo-size transfers.
  return (amountUsd * policy.demoUsdToNearRate).toFixed(5);
}

/** True when the proposal needs human approval before it can execute. */
export function needsApproval(policy: BudgetPolicy, p: Proposal): boolean {
  return p.amountUsd > policy.approvalThresholdUsd;
}

/** True when the category cap still has room for this proposal. */
export function withinCap(
  policy: BudgetPolicy,
  spent: Record<Category, number>,
  p: Proposal,
): boolean {
  return (spent[p.category] ?? 0) + p.amountUsd <= policy.caps[p.category];
}

/** Spend totals per category across executed proposals only. */
export function spentByCategory(
  proposals: Proposal[],
): Record<Category, number> {
  const spent: Record<Category, number> = {
    supplies: 0,
    software: 0,
    services: 0,
    other: 0,
  };
  for (const p of proposals) {
    if (p.status === "executed") spent[p.category] += p.amountUsd;
  }
  return spent;
}

/** Distinct approver roles that have approved this proposal. */
export function approverSet(p: Proposal): Set<string> {
  return new Set(p.approvals.map((a) => a.approver));
}

/** Apply an approval. Throws on any rule violation — callers surface the message. */
export function applyApproval(
  policy: BudgetPolicy,
  p: Proposal,
  approver: string,
  txHash: string,
  timestamp: string,
): Proposal {
  if (p.status === "executed") throw new Error("proposal already executed");
  if (p.status === "rejected") throw new Error("proposal was rejected");
  if (!policy.approvers.includes(approver)) {
    throw new Error(`approver "${approver}" is not an authorized approver role`);
  }
  if (approverSet(p).has(approver)) {
    throw new Error(`approver "${approver}" already approved this proposal`);
  }
  const next: Proposal = {
    ...p,
    approvals: [...p.approvals, { approver, txHash, timestamp }],
  };
  if (!needsApproval(policy, next)) {
    // Under-threshold proposals never wait: they are executable immediately.
    next.status = "pending";
  } else if (approverSet(next).size >= policy.requiredApprovals) {
    next.status = "approved";
  } else {
    next.status = "pending";
  }
  return next;
}

/**
 * The execution gate. Returns { ok: true } only when the proposal may move
 * funds on-chain right now; otherwise { ok: false, reason } naming the blocker.
 * The chain layer must call this immediately before signing any transfer.
 */
export function canExecute(
  policy: BudgetPolicy,
  spent: Record<Category, number>,
  p: Proposal,
): { ok: boolean; reason?: string } {
  if (p.status === "executed") return { ok: false, reason: "already executed" };
  if (p.status === "rejected") return { ok: false, reason: "proposal rejected" };
  if (!withinCap(policy, spent, p)) {
    return { ok: false, reason: "category cap would be exceeded" };
  }
  if (needsApproval(policy, p)) {
    const have = approverSet(p).size;
    if (p.status !== "approved" || have < policy.requiredApprovals) {
      return {
        ok: false,
        reason: `needs ${policy.requiredApprovals} approvals, has ${have}`,
      };
    }
  }
  return { ok: true };
}

/** Mark a proposal executed after its transfer lands. Throws if gated. */
export function applyExecution(
  policy: BudgetPolicy,
  spent: Record<Category, number>,
  p: Proposal,
  txHash: string,
): Proposal {
  const gate = canExecute(policy, spent, p);
  if (!gate.ok) throw new Error(`execution blocked: ${gate.reason}`);
  return { ...p, status: "executed", executionTxHash: txHash, reason: undefined };
}

export function explorerTxUrl(txHash: string): string {
  return `https://explorer.testnet.near.org/transactions/${txHash}`;
}
