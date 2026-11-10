// End-to-end testnet demo for the Treasury Agent.
//
// Run from an OPEN network (a laptop, Vercel, or any host whose egress
// allows POST to https://rpc.testnet.near.org and the testnet helper).
// It does NOT work from the Muse sandbox VM: that egress proxy drops POSTs
// to NEAR hosts (verified: GET works, POST hangs), so account creation and
// transfers fail there even though reads work.
//
// What it does, in order:
//   1. Creates fresh testnet accounts (treasury, owner, finance, vendor)
//      via the testnet helper, or reuses accounts from .env.local.
//   2. Runs the real treasury flow:
//      - p1: $49 supplies proposal, under the $100 threshold -> executes
//        immediately as a treasury -> vendor transfer.
//      - p2: $250 supplies proposal, over threshold -> waits; owner and
//        finance each send a real approval transfer to the treasury;
//        then p2 executes as a treasury -> vendor transfer.
//   3. Verifies every hash against the NEARBlocks indexer.
//   4. Writes data/evidence.json (real hashes only) and prints the
//      .env.local block for the dashboard. With --write-env it also writes
//      .env.local (gitignored; never committed).
//
// Usage:
//   node scripts/testnet-demo.mjs [--write-env] [--reuse-env]
//
// Keys are generated fresh per run and never written anywhere except the
// printed block and (optionally) .env.local. Never mainnet, never real funds.

import { KeyPair } from "near-api-js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELPER_URL = "https://helper.testnet.near.org/account";
const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
const NEARBLOCKS = "https://api-testnet.nearblocks.io/v1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJson(url, body, timeoutMs = 30000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: c.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST ${url} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(t);
  }
}

async function nearblocks(pathname) {
  const res = await fetch(`${NEARBLOCKS}${pathname}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`nearblocks ${pathname} -> HTTP ${res.status}`);
  return res.json();
}

async function balanceNear(accountId) {
  const data = await nearblocks(`/accounts/${accountId}`);
  const yocto = data.account?.[0]?.amount;
  if (!yocto) return 0;
  return Number(BigInt(yocto)) / 1e24;
}

async function createAccount(accountId, publicKey) {
  await postJson(HELPER_URL, { newAccountId: accountId, newAccountPublicKey: publicKey });
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const bal = await balanceNear(accountId).catch(() => 0);
    if (bal > 0) return bal;
  }
  throw new Error(`account ${accountId} created but never funded (check https://near-faucet.io)`);
}

// Minimal signing via near-api-js (same calls as lib/near.ts sendTransfer).
async function sendTransfer({ fromAccountId, fromPrivateKey, toAccountId, amountNear }) {
  const nearApi = await import("near-api-js");
  const keyStore = new nearApi.keyStores.InMemoryKeyStore();
  await keyStore.setKey("testnet", fromAccountId, nearApi.KeyPair.fromString(fromPrivateKey));
  const near = await nearApi.connect({ networkId: "testnet", nodeUrl: RPC_URL, keyStore });
  const account = await near.account(fromAccountId);
  const yocto = nearApi.utils.format.parseNearAmount(amountNear);
  const outcome = await account.sendMoney(toAccountId, BigInt(yocto));
  const hash = outcome.transaction_outcome?.id ?? outcome.transaction?.hash;
  if (!hash) throw new Error("transfer returned no hash");
  return hash;
}

async function verifyHash(hash, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const data = await nearblocks(`/txns/${hash}`).catch(() => null);
    if (data?.txns?.length) {
      return { found: true, blockHeight: data.txns[0].block?.block_height };
    }
    await sleep(5000);
  }
  return { found: false };
}

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const suffix = Date.now().toString(36);
  const names = {
    treasury: `treasury-${suffix}.testnet`,
    owner: `owner-${suffix}.testnet`,
    finance: `finance-${suffix}.testnet`,
    vendor: `vendor-${suffix}.testnet`,
  };
  const keys = {};
  let env = {};
  const envPath = path.join(ROOT, ".env.local");
  if (args.has("--reuse-env")) {
    env = parseEnvFile(await fs.readFile(envPath, "utf8"));
    names.treasury = env.TREASURY_ACCOUNT_ID;
    const accounts = JSON.parse(env.APPROVER_ACCOUNTS_JSON ?? "{}");
    const privs = JSON.parse(env.APPROVER_KEYS_JSON ?? "{}");
    names.owner = accounts.owner;
    names.finance = accounts.finance;
    keys.treasury = env.TREASURY_PRIVATE_KEY;
    keys.owner = privs.owner;
    keys.finance = privs.finance;
    names.vendor = env.VENDOR_ACCOUNT_ID;
    if (!names.treasury || !keys.treasury) throw new Error("--reuse-env needs a populated .env.local");
  } else {
    for (const role of Object.keys(names)) {
      const kp = KeyPair.fromRandom("ed25519");
      keys[role] = kp.toString();
      console.log(`creating ${names[role]} ...`);
      const bal = await createAccount(names[role], kp.getPublicKey().toString());
      console.log(`  funded: ${bal} NEAR`);
    }
  }

  // Size the demo rate to the treasury balance so the flow always fits.
  const treasuryBal = await balanceNear(names.treasury);
  const rate = Math.min(0.01, (treasuryBal * 0.25) / 250);
  const near = (usd) => (usd * rate).toFixed(5);
  console.log(`treasury balance ${treasuryBal} NEAR -> demo rate ${rate} NEAR/USD`);

  const now = () => new Date().toISOString();
  const proposals = [];

  // p1: $49, under the $100 threshold -> executes immediately.
  console.log("p1: $49 supplies -> execute");
  const p1hash = await sendTransfer({
    fromAccountId: names.treasury,
    fromPrivateKey: keys.treasury,
    toAccountId: names.vendor,
    amountNear: near(49),
  });
  console.log(`  execution tx: ${p1hash}`);
  proposals.push({
    id: "p1",
    category: "supplies",
    description: "Office supplies restock (demo)",
    amountUsd: 49,
    amountNear: near(49),
    vendorAccountId: names.vendor,
    status: "executed",
    approvals: [],
    executionTxHash: p1hash,
    createdAt: now(),
  });

  // p2: $250, over threshold -> 2 approvals, then execute.
  console.log("p2: $250 supplies -> approvals then execute");
  const a1 = await sendTransfer({
    fromAccountId: names.owner,
    fromPrivateKey: keys.owner,
    toAccountId: names.treasury,
    amountNear: "0.00001",
  });
  console.log(`  owner approval tx: ${a1}`);
  const a2 = await sendTransfer({
    fromAccountId: names.finance,
    fromPrivateKey: keys.finance,
    toAccountId: names.treasury,
    amountNear: "0.00001",
  });
  console.log(`  finance approval tx: ${a2}`);
  const p2hash = await sendTransfer({
    fromAccountId: names.treasury,
    fromPrivateKey: keys.treasury,
    toAccountId: names.vendor,
    amountNear: near(250),
  });
  console.log(`  execution tx: ${p2hash}`);
  proposals.push({
    id: "p2",
    category: "supplies",
    description: "Bulk supplies order (demo)",
    amountUsd: 250,
    amountNear: near(250),
    vendorAccountId: names.vendor,
    status: "executed",
    approvals: [
      { approver: "owner", txHash: a1, timestamp: now() },
      { approver: "finance", txHash: a2, timestamp: now() },
    ],
    executionTxHash: p2hash,
    createdAt: now(),
  });

  // Verify every hash on-chain before writing evidence.
  for (const p of proposals) {
    for (const h of [...p.approvals.map((a) => a.txHash), p.executionTxHash]) {
      const v = await verifyHash(h);
      console.log(`  verify ${h.slice(0, 12)}... -> ${v.found ? `on-chain (#${v.blockHeight})` : "NOT FOUND (indexer lag?)"}`);
      if (!v.found) throw new Error(`hash ${h} could not be verified; evidence NOT written`);
    }
  }

  const evidence = {
    note: "Real NEAR testnet transactions only. Each executionTxHash and approval txHash is verifiable at https://explorer.testnet.near.org/transactions/<hash>.",
    proposals,
  };
  await fs.writeFile(path.join(ROOT, "data", "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log("wrote data/evidence.json");

  const envBlock = [
    `TREASURY_ACCOUNT_ID=${names.treasury}`,
    `TREASURY_PRIVATE_KEY=${keys.treasury}`,
    `APPROVER_ACCOUNTS_JSON=${JSON.stringify({ owner: names.owner, finance: names.finance })}`,
    `APPROVER_KEYS_JSON=${JSON.stringify({ owner: keys.owner, finance: keys.finance })}`,
    `VENDOR_ACCOUNT_ID=${names.vendor}`,
    `DEMO_USD_TO_NEAR_RATE=${rate}`,
    `APPROVAL_AMOUNT_NEAR=0.00001`,
  ].join("\n");
  console.log("\n--- .env.local block (server env vars only, never commit) ---");
  console.log(envBlock);
  if (args.has("--write-env")) {
    await fs.appendFile(envPath, `\n${envBlock}\n`);
    console.log("appended to .env.local (gitignored)");
  }
  console.log("\nDone. Start the dashboard with: npm run dev");
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
