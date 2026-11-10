// End-to-end flow test of the policy engine WITHOUT chain calls:
// propose -> (approve x2) -> execute, plus the rejection paths.
// Real chain hashes are exercised by scripts/testnet-demo.mjs on testnet.
import test from "node:test";
import assert from "node:assert/strict";
import type { Proposal } from "../lib/policy.ts";
import {
  DEFAULT_POLICY,
  applyApproval,
  applyExecution,
  canExecute,
  spentByCategory,
  usdToNear,
} from "../lib/policy.ts";

function propose(id: string, amountUsd: number, category: Proposal["category"] = "software"): Proposal {
  return {
    id,
    category,
    description: `demo ${id}`,
    amountUsd,
    amountNear: usdToNear(DEFAULT_POLICY, amountUsd),
    vendorAccountId: "vendor-x.testnet",
    status: "pending",
    approvals: [],
    createdAt: "2026-11-01T00:00:00.000Z",
  };
}

test("full flow: small proposal executes, large proposal needs 2 approvals then executes", () => {
  let proposals: Proposal[] = [];
  const spent = () => spentByCategory(proposals);

  const small = propose("p1", 49);
  const smallExec = applyExecution(DEFAULT_POLICY, spent(), small, "tx-small");
  proposals.push(smallExec);
  assert.equal(smallExec.status, "executed");
  assert.equal(spent().software, 49);
  assert.equal(spent().supplies, 0);

  const large = propose("p2", 250, "supplies");
  assert.equal(canExecute(DEFAULT_POLICY, spent(), large).ok, false);
  const a1 = applyApproval(DEFAULT_POLICY, large, "owner", "tx-a1", "t");
  assert.equal(canExecute(DEFAULT_POLICY, spent(), a1).ok, false);
  const a2 = applyApproval(DEFAULT_POLICY, a1, "finance", "tx-a2", "t");
  assert.equal(a2.status, "approved");
  const largeExec = applyExecution(DEFAULT_POLICY, spent(), a2, "tx-large");
  proposals.push(largeExec);
  assert.equal(largeExec.status, "executed");
  assert.equal(spent().supplies, 250);
});

test("over-cap proposal is rejected by the gate at execution time", () => {
  const spent = { supplies: 450, software: 0, services: 0, other: 0 };
  const p = propose("p3", 100, "supplies");
  assert.equal(canExecute(DEFAULT_POLICY, spent, p).ok, false);
  assert.match(canExecute(DEFAULT_POLICY, spent, p).reason ?? "", /cap/);
});
