# Treasury Agent — NEAR Hackathon: Build Beyond Boundaries

**Live Demo:** https://near-treasury-agent.vercel.app (production deploy,
Oct 31, 2026 — dashboard live; testnet signing not yet configured, so the
demo shows the honest empty state until real testnet evidence lands).

An approval-gated autonomous procurement treasury for a small business, on
NEAR testnet. Tracks: `business` + `agents` (Autonomous Business — AI-run
businesses managing payments, procurement, and treasuries within
human-defined constraints).

## What it is (machine-readable summary)

- **Product:** a treasury dashboard where a human sets a budget policy, an
  agent proposes purchases against it, and funds move on NEAR testnet only
  when the policy allows.
- **Policy engine:** `lib/policy.ts` — pure, unit-tested logic. Category
  monthly caps (supplies $500, software $300, services $1000, other $200);
  purchases at or under $100 auto-execute; purchases above $100 need
  approvals from 2 distinct authorized roles (`owner`, `finance`);
  over-cap proposals are rejected. Execution is gated by `canExecute()`,
  which the API routes call immediately before signing any transfer.
- **Chain layer:** `lib/near.ts` — `near-api-js` v5 transfers on testnet,
  verified against the NEARBlocks indexer (`api-testnet.nearblocks.io`, GET)
  with an RPC tx-status POST fallback. Every approval is itself a real
  testnet transfer (approver → treasury); every execution is a real
  transfer (treasury → vendor). No smart contract: the policy engine plus
  signed transfers give verifiable on-chain evidence without a contract
  deploy toolchain.
- **App:** Next.js 15 + React 19, Vercel-deployable (`vercel.json`).
  Dashboard at `app/page.tsx`; API routes under `app/api/` (`state`,
  `proposals`, `approvals`, `execute`); state in `lib/store.ts`
  (runtime `data/state.json`, gitignored) seeded from committed
  `data/evidence.json`.
- **Demo rate:** 1 USD = 0.01 NEAR by default (`DEMO_USD_TO_NEAR_RATE`),
  used ONLY to size testnet transfers. It is configurable so the demo
  script can fit small faucet balances.

## Do X, see Y

- Open the dashboard → see the policy panel, spend-vs-cap bars, proposals,
  approvals, and executed transfers, each with an explorer link and an
  on-chain verification badge.
- Propose a purchase under $100 → with testnet signing configured it
  executes immediately and its hash appears with a ✅ on-chain badge;
  without signing it waits as pending with an honest reason (never a fake
  transfer).
- Propose a purchase over $100 → it waits in pending; approve as `owner`
  and as `finance` (each approval is a real transfer) → Execute becomes
  unblocked and moves funds.
- Propose over the category cap → the policy engine rejects it outright.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 11 policy + flow tests (node:test, no network)
npm run build
```

## Generate real testnet evidence (one command, open network required)

```bash
node scripts/testnet-demo.mjs [--write-env] [--reuse-env]
npm run verify-evidence
```

The script creates fresh testnet accounts (treasury, owner, finance,
vendor), runs the full flow (a $49 auto-executed proposal; a $250 proposal
approved by owner + finance, then executed), verifies every hash against
the indexer, writes `data/evidence.json`, and prints the `.env.local`
block. Keys go only to that block / `.env.local` (gitignored) — never to
the repo. For the deployed dashboard, set the same values as Vercel env
vars (`TREASURY_ACCOUNT_ID`, `TREASURY_PRIVATE_KEY`,
`APPROVER_ACCOUNTS_JSON`, `APPROVER_KEYS_JSON`); see
`.env.local.example`.

## Testnet evidence — honest status

- `data/evidence.json` is **intentionally empty right now**: no treasury
  transaction has landed yet, and this repo will not fabricate one.
- **Why it is empty (verified, not assumed):** the Muse sandbox VM's egress
  proxy drops POST requests to NEAR hosts (GET works — e.g. the NEARBlocks
  indexer returns live testnet blocks). Update Nov 5, 01:49 PT: an RPC POST
  to `rpc.testnet.near.org` now returns 200 (12.6s, verified Nov 4 23:49 PT),
  contradicting the earlier "POST hangs" finding — but the helper POST that
  creates accounts (`helper.testnet.near.org`) is still unproven from the
  sandbox and is gated on a pending sandbox approval, so the demo script
  still cannot complete from here. Account creation and signed transfers
  therefore remain unproven from the sandbox. Update Nov 6, 04:49 PT: a
  fresh helper-POST probe (empty-body POST to helper.testnet.near.org)
  timed out after 25s with no response (curl exit 124, confirmed Nov 6
  04:54 PT) — consistent with the sandbox egress proxy dropping POSTs
  to the NEAR helper, not a helper-side failure. The Nov 5 11:51 PM PT
  testnet approval card has lapsed. Real testnet evidence still needs
  the laptop/open-network route.
  Demo URL re-verified this run: https://near-treasury-agent.vercel.app
  → 200. Public repo live at https://github.com/solanaminter/near-treasury-agent
  (pushed Nov 9, 22:53 PT, commit 3165ec3d) — but the remote serves only that
  Nov 9 snapshot: local master (44ebf24, incl. the submission package) shares
  no ancestor with remote main, so a staffed-window sync (force-push or
  rebase decision) is still needed before the repo gate is fully met;
  remaining filing gates are the NEAR mainnet account (payout), the X demo
  post, and real testnet evidence (laptop/open-network route).
- **Unblock (one step, coordinator-owned):** run
  `node scripts/testnet-demo.mjs` from any open network (laptop, Vercel,
  or the live browser's network), then `npm run verify-evidence`. The
  dashboard will then show real hashes with on-chain badges.
- **Verifier proof (not treasury evidence):** the verification code path
  was smoke-tested against a real, unrelated testnet transaction —
  `J7UmfyuBq1Acz4KPSNWtE6Z7psoe2xwrijtLWASMoPQv`
  (block 270420292, signer `stakin-mpc2.testnet`) — and returned
  `found: true` via the indexer. That hash is deliberately NOT in
  `evidence.json`: it is not ours.

## Judging criteria map

- **Technological Implementation:** real NEAR testnet transfers via
  `near-api-js`, policy-gated execution, indexer-verified hashes,
  full test suite, production Next.js build passing.
- **Design:** one dashboard for policy, proposals, approvals, spend vs.
  cap, and verification status; every chain claim is one click from its
  explorer page.
- **Potential Impact:** any small business with recurring procurement can
  reuse this: human-defined constraints, auditable spend, no new
  trust assumptions beyond the approvers.
- **Quality of Idea:** approval-gated autonomy — the agent acts freely
  inside the policy and stops exactly at the human boundary.
- **Project Sustainability:** the agent cannot spend outside policy by
  construction; every execution is auditable on-chain; the model
  generalizes to any procurement category or approver set.

## Tools used

- Next.js 15, React 19 (dashboard, Vercel-deployable)
- `near-api-js` 5 (NEAR testnet calls)
- NEAR testnet + NEARBlocks indexer (evidence + verification)
- NEAR Intents / Chain Signatures: not used — the design does not need
  them, and no mock centerpiece is claimed in their place.

## License

MIT.
