import test from "node:test";
import assert from "node:assert/strict";
import type { Proposal } from "../lib/policy.ts";
import {
  DEFAULT_POLICY,
  applyApproval,
  applyExecution,
  canExecute,
  explorerTxUrl,
  needsApproval,
  spentByCategory,
  usdToNear,
  withinCap,
} from "../lib/policy.ts";

const base = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  category: "supplies",
  description: "paper",
  amountUsd: 49,
  amountNear: "0.49000",
  vendorAccountId: "vendor-x.testnet",
  status: "pending",
  approvals: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const spent = { supplies: 0, software: 0, services: 0, other: 0 };

test("under-threshold proposals do not need approval", () => {
  assert.equal(needsApproval(DEFAULT_POLICY, base({ amountUsd: 100 })), false);
  assert.equal(needsApproval(DEFAULT_POLICY, base({ amountUsd: 100.01 })), true);
});

test("cap accounting rejects over-cap proposals", () => {
  assert.equal(withinCap(DEFAULT_POLICY, { ...spent, supplies: 400 }, base({ amountUsd: 100 })), true);
  assert.equal(withinCap(DEFAULT_POLICY, { ...spent, supplies: 401 }, base({ amountUsd: 100 })), false);
});

test("spent counts executed proposals only", () => {
  const list = [
    base({ id: "a", status: "executed", amountUsd: 50 }),
    base({ id: "b", status: "pending", amountUsd: 999 }),
    base({ id: "c", status: "rejected", amountUsd: 999 }),
  ];
  assert.equal(spentByCategory(list).supplies, 50);
});

test("execution gate blocks unapproved over-threshold proposals", () => {
  const p = base({ amountUsd: 250 });
  assert.deepEqual(canExecute(DEFAULT_POLICY, spent, p).ok, false);
});

test("execution gate passes auto-eligible proposals within cap", () => {
  assert.deepEqual(canExecute(DEFAULT_POLICY, spent, base()), { ok: true });
});

test("execution gate blocks already-executed and rejected proposals", () => {
  assert.equal(canExecute(DEFAULT_POLICY, spent, base({ status: "executed" })).ok, false);
  assert.equal(canExecute(DEFAULT_POLICY, spent, base({ status: "rejected" })).ok, false);
});

test("approvals require authorized, distinct roles and flip status at threshold", () => {
  const p = base({ amountUsd: 250 });
  assert.throws(() => applyApproval(DEFAULT_POLICY, p, "intruder", "h1", "t"), /not an authorized approver/);
  const once = applyApproval(DEFAULT_POLICY, p, "owner", "h1", "t");
  assert.equal(once.status, "pending");
  assert.throws(() => applyApproval(DEFAULT_POLICY, once, "owner", "h2", "t"), /already approved/);
  const twice = applyApproval(DEFAULT_POLICY, once, "finance", "h2", "t");
  assert.equal(twice.status, "approved");
  assert.equal(canExecute(DEFAULT_POLICY, spent, twice).ok, true);
});

test("applyExecution enforces the gate and records the hash", () => {
  const blocked = base({ amountUsd: 250 });
  assert.throws(() => applyExecution(DEFAULT_POLICY, spent, blocked, "hX"), /needs 2 approvals/);
  const ok = applyExecution(DEFAULT_POLICY, spent, base(), "hEXEC");
  assert.equal(ok.status, "executed");
  assert.equal(ok.executionTxHash, "hEXEC");
});

test("usdToNear uses the demo rate and explorer links point at testnet", () => {
  assert.equal(usdToNear(DEFAULT_POLICY, 49), "0.49000");
  assert.equal(
    explorerTxUrl("abc"),
    "https://explorer.testnet.near.org/transactions/abc",
  );
});
