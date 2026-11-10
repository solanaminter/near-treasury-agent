# Treasury Agent — NEAR Hackathon submission package

Prepared Nov 5, 2026 (hourly win loop). Filing is UNEDITABLE and one-shot —
file LATE in the window (window closes Nov 14, 23:59 UTC / 3:59 PM PT), not
early. Do not file until every gate below is green.

## Form fields (nearhackathon.com submission form)

- **Project name:** Treasury Agent
- **Preferred tracks:** `business` + `agents` (Autonomous Business — AI-run
  businesses managing payments, procurement, and treasuries within
  human-defined constraints)
- **Team:** solo — Solana Minter, solanaminter@gmail.com, team size 1
- **Live demo:** https://near-treasury-agent.vercel.app
- **Public repo:** https://github.com/solanaminter/near-treasury-agent
  (⚠️ DOES NOT EXIST YET — Dy creates the empty public repo, then push)
- **Demo post on X:** Dy posts from https://x.com/summer_of_66 (his tap)
- **NEAR account address (payout):** Dy's mainnet account (his tap if he has
  none yet)

## Description (form field, 20–2,000 chars — copy verbatim; verified 952 chars, 141 words, Nov 5)

Treasury Agent is an approval-gated autonomous procurement treasury for small
businesses, built on NEAR testnet. A human sets a budget policy — monthly caps
per category ($500 supplies, $300 software, $1,000 services, $200 other) — and
an agent proposes purchases against it. Purchases at or under $100
auto-execute; anything above $100 needs approvals from two distinct authorized
roles (owner + finance); over-cap proposals are rejected outright. Every
approval and execution is a real signed NEAR testnet transfer, verified
against the NEARBlocks indexer, with explorer links and on-chain badges on the
dashboard. The policy engine is pure, unit-tested logic (11/11 tests) that
gates every transfer before signing, so the agent acts freely inside the
policy and stops exactly at the human boundary. Any small business with
recurring procurement can reuse it: human-defined constraints, auditable
spend, no new trust assumptions beyond the approvers.

## Judging criteria map (from README — AI judges read it)

- Technological Implementation: real NEAR testnet transfers via near-api-js,
  policy-gated execution, indexer-verified hashes, full test suite,
  production Next.js build passing.
- Design: one dashboard for policy, proposals, approvals, spend vs. cap,
  verification status; every chain claim one click from its explorer page.
- Potential Impact: reusable by any small business with recurring procurement.
- Quality of Idea: approval-gated autonomy — free inside the policy, stopped
  at the human boundary.
- Project Sustainability: the agent cannot spend outside policy by
  construction; every execution auditable on-chain.

## Filing gates (all must be green before filing)

- [x] Build complete in-window (Oct 31–Nov 1): policy engine, testnet
      transfer layer, dashboard, 11/11 tests, production build passing.
- [x] Live demo public 200, no login wall:
      https://near-treasury-agent.vercel.app (re-verified Nov 5, 05:49 PT).
- [x] README written for machine readers (Claude Code + Codex are AI
      judges): tools named, "Do X, see Y" steps, judging-criteria map.
- [ ] REAL testnet evidence — `data/evidence.json` still the empty seed.
      Script `node scripts/testnet-demo.mjs --write-env` staged; blocked on
      pending sandbox approval card 657b98ae (helper.testnet.near.org,
      expires Nov 5, 23:51 PT). If Dy approves, re-run fresh, commit
      evidence.json, set 7 Vercel env vars, redeploy. Fallback: laptop /
      open-network run. NEVER file with fabricated hashes.
- [ ] Public repo created + pushed (Dy creates empty public
      `near-treasury-agent` on github.com; coordinator pushes HEAD 34794f2).
- [ ] X demo post published by Dy (video or screenshots of the live demo).
- [ ] NEAR mainnet account address for payout (Dy).

## X demo post draft (Dy posts; NOT posted by agent)

Treasury Agent — an approval-gated procurement treasury on NEAR testnet.
Set the policy, the agent proposes, and funds move only when the policy
allows. $100-and-under auto-executes; over $100 needs owner + finance.
Every transfer is a real signed testnet tx, verified on-chain.
Live demo: https://near-treasury-agent.vercel.app

## Status refresh — Nov 5, 05:49 PT (hourly win loop)

- Submission package drafted this run (this file) — the form-ready
  description, track selection, and gate checklist, so filing is one step
  once the repo + evidence + X post land.
- Demos re-verified 200: NEAR, ProcurePilot, FieldKit. NEAR /api/state 200,
  honest empty state. NEAR local repo clean at 34794f2, no remote.
- PayPal ProcurePilot: early-eligibility check is TODAY (Nov 5) — still NOT
  filed; sandbox tap + real transactions remain Dy's sole gate. Hard close
  Nov 12 noon PT. Draft 1272380 stands. Nov 5 is a soft target, not the
  close, so no lapse warning due.
- No code changed by this file; no secrets in it.
