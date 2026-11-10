// Server-side state for the Treasury Agent dashboard.
// - Runtime state lives in data/state.json (gitignored, local/dev only).
// - Committed testnet evidence lives in data/evidence.json: proposals whose
//   transfers REALLY landed on testnet, with real hashes. On first run (or
//   on Vercel, where the filesystem is ephemeral) state is seeded from
//   evidence.json so the dashboard always shows real history, never mocks.
// - This file never stores private keys. Keys live only in env vars.

import { promises as fs } from "fs";
import path from "path";
import {
  BudgetPolicy,
  DEFAULT_POLICY,
  Proposal,
  spentByCategory,
} from "./policy";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const EVIDENCE_FILE = path.join(DATA_DIR, "evidence.json");

export interface TreasuryState {
  policy: BudgetPolicy;
  proposals: Proposal[];
}

export function policyFromEnv(): BudgetPolicy {
  const rate = Number(process.env.DEMO_USD_TO_NEAR_RATE ?? "");
  return {
    ...DEFAULT_POLICY,
    treasuryAccountId: process.env.TREASURY_ACCOUNT_ID ?? "",
    demoUsdToNearRate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_POLICY.demoUsdToNearRate,
  };
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function loadEvidence(): Promise<Proposal[]> {
  const data = await readJson<{ proposals?: Proposal[] }>(EVIDENCE_FILE);
  return data?.proposals ?? [];
}

/** Load state, seeding from committed evidence when no runtime state exists. */
export async function loadState(): Promise<TreasuryState> {
  const policy = policyFromEnv();
  const saved = await readJson<TreasuryState>(STATE_FILE);
  if (saved && Array.isArray(saved.proposals)) {
    return { policy, proposals: saved.proposals };
  }
  return { policy, proposals: await loadEvidence() };
}

export async function saveState(state: TreasuryState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Store proposals only; policy comes from env/defaults at load time.
  await fs.writeFile(
    STATE_FILE,
    JSON.stringify({ proposals: state.proposals }, null, 2),
    "utf8",
  );
}

/** Append a proposal to the committed evidence file (used by demo scripts). */
export async function appendEvidence(proposal: Proposal): Promise<void> {
  const proposals = await loadEvidence();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    EVIDENCE_FILE,
    JSON.stringify({ proposals: [...proposals, proposal], note: "Real NEAR testnet transactions only. Each executionTxHash and approval txHash is verifiable at https://explorer.testnet.near.org/transactions/<hash>." }, null, 2),
    "utf8",
  );
}

export function nextId(proposals: Proposal[]): string {
  return `p${proposals.length + 1}`;
}

export function stateSummary(state: TreasuryState) {
  const spent = spentByCategory(state.proposals);
  return {
    policy: state.policy,
    proposals: state.proposals,
    spent,
    executedCount: state.proposals.filter((p) => p.status === "executed")
      .length,
    pendingCount: state.proposals.filter((p) => p.status === "pending")
      .length,
  };
}
