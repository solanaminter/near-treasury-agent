// Verify every transaction hash in data/evidence.json against the
// NEARBlocks testnet indexer (GET only — works even from restricted
// networks). No keys needed. Exits non-zero if any hash is unverified.
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const evidence = JSON.parse(await fs.readFile(path.join(ROOT, "data", "evidence.json"), "utf8"));
  const hashes = [];
  for (const p of evidence.proposals ?? []) {
    for (const a of p.approvals ?? []) hashes.push({ hash: a.txHash, kind: `approval:${a.approver}`, proposal: p.id });
    if (p.executionTxHash) hashes.push({ hash: p.executionTxHash, kind: "execution", proposal: p.id });
  }
  if (!hashes.length) {
    console.log("evidence.json has no transaction hashes yet — run scripts/testnet-demo.mjs from an open network first.");
    return;
  }
  let bad = 0;
  for (const h of hashes) {
    let found = null;
    for (let i = 0; i < 3 && !found; i++) {
      const res = await fetch(`https://api-testnet.nearblocks.io/v1/txns/${h.hash}`, { headers: { accept: "application/json" } }).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        if (data.txns?.length) found = data.txns[0];
      }
      if (!found) await sleep(2000);
    }
    const url = `https://explorer.testnet.near.org/transactions/${h.hash}`;
    if (found) {
      console.log(`OK  [${h.proposal} ${h.kind}] block #${found.block?.block_height} ${url}`);
    } else {
      console.log(`FAIL [${h.proposal} ${h.kind}] not found ${url}`);
      bad++;
    }
  }
  if (bad) {
    console.log(`${bad} hash(es) unverified`);
    process.exit(1);
  }
  console.log(`all ${hashes.length} hash(es) verified on testnet`);
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
