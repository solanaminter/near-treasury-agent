"use client";

import { useCallback, useEffect, useState } from "react";

type Proposal = {
  id: string;
  category: string;
  description: string;
  amountUsd: number;
  amountNear: string;
  vendorAccountId: string;
  status: string;
  approvals: { approver: string; txHash: string; timestamp: string }[];
  executionTxHash?: string;
  reason?: string;
  createdAt: string;
};

type State = {
  policy: {
    caps: Record<string, number>;
    approvalThresholdUsd: number;
    requiredApprovals: number;
    approvers: string[];
    approverRole: string;
    treasuryAccountId: string;
    demoUsdToNearRate: number;
  };
  proposals: Proposal[];
  spent: Record<string, number>;
  executedCount: number;
  pendingCount: number;
  verifications: Record<
    string,
    { found?: boolean; blockHeight?: number; receiverAccountId?: string; source?: string }
  >;
  signingConfigured: boolean;
};

const EXPLORER = "https://explorer.testnet.near.org/transactions/";

function TxLink({ hash, v }: { hash: string; v?: State["verifications"][string] }) {
  return (
    <span>
      <a href={EXPLORER + hash} target="_blank" rel="noreferrer">
        {hash.slice(0, 12)}…
      </a>{" "}
      {v?.found ? (
        <span title={v.source ? `verified via ${v.source}` : "verified on-chain"}>
          ✅ on-chain{v.blockHeight ? ` (#${v.blockHeight})` : ""}
        </span>
      ) : (
        <span title="not yet confirmed by the indexer">⏳ unverified</span>
      )}
    </span>
  );
}

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    category: "supplies",
    description: "",
    amountUsd: "",
    vendorAccountId: "",
  });
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      setState(await res.json());
    } catch (e) {
      setError(`failed to load state: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load ]);

  async function post(path: string, body: unknown, label: string) {
    setBusy(label);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "request failed");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!state) return <main style={S.main}>Loading treasury state…</main>;
  const { policy } = state;

  return (
    <main style={S.main}>
      <h1>Treasury Agent</h1>
      <p>
        Approval-gated autonomous procurement treasury on NEAR testnet.
        Tracks: <strong>business</strong> + <strong>agents</strong>. Every
        approval and execution below is a real testnet transaction — click a
        hash to see it on the explorer.
      </p>

      {!state.signingConfigured && (
        <p style={S.banner}>
          Testnet signing is not configured in this deployment, so approvals
          and executions return an honest error instead of a fake transfer.
          Set TREASURY_ACCOUNT_ID / TREASURY_PRIVATE_KEY /
          APPROVER_ACCOUNTS_JSON / APPROVER_KEYS_JSON (server env vars only,
          never in the repo) or run <code>scripts/testnet-demo.mjs</code> from
          an open network to generate real evidence.
        </p>
      )}
      {error && <p style={S.error}>{error}</p>}

      <section>
        <h2>Policy</h2>
        <p>
          Approval threshold: ${policy.approvalThresholdUsd} — purchases above
          it need {policy.requiredApprovals} approvals from distinct roles (
          {policy.approvers.join(", ")}). Treasury account:{" "}
          {policy.treasuryAccountId || "(not configured)"}. Demo conversion: 1
          USD = {policy.demoUsdToNearRate} NEAR (demo sizing only).
        </p>
        <ul>
          {Object.entries(policy.caps).map(([cat, cap]) => (
            <li key={cat}>
              {cat}: ${state.spent[cat] ?? 0} spent / ${cap} cap
              <span style={S.barWrap}>
                <span
                  style={{
                    ...S.bar,
                    width: `${Math.min(100, ((state.spent[cat] ?? 0) / cap) * 100)}%`,
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Propose a purchase</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            post(
              "/api/proposals",
              { ...form, amountUsd: Number(form.amountUsd) },
              "propose",
            );
          }}
        >
          <label>
            Category{" "}
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {Object.keys(policy.caps).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            Description{" "}
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </label>{" "}
          <label>
            Amount (USD){" "}
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amountUsd}
              onChange={(e) => setForm({ ...form, amountUsd: e.target.value })}
              required
            />
          </label>{" "}
          <label>
            Vendor (testnet account){" "}
            <input
              value={form.vendorAccountId}
              onChange={(e) => setForm({ ...form, vendorAccountId: e.target.value })}
              placeholder="vendor-….testnet"
              required
            />
          </label>{" "}
          <button type="submit" disabled={!!busy}>
            {busy === "propose" ? "Working…" : "Propose"}
          </button>
        </form>
        <p>
          Under ${policy.approvalThresholdUsd} executes immediately (when
          signing is configured); over it waits for{" "}
          {policy.requiredApprovals} approvals. Over-cap proposals are
          rejected by the policy engine.
        </p>
      </section>

      <section>
        <h2>
          Proposals ({state.proposals.length}) — {state.pendingCount} pending,{" "}
          {state.executedCount} executed
        </h2>
        {state.proposals.length === 0 && (
          <p>
            No proposals yet. Run <code>scripts/testnet-demo.mjs</code> to
            create the first real ones, or propose one above.
          </p>
        )}
        <ul>
          {state.proposals.map((p) => (
            <li key={p.id} style={S.card}>
              <strong>{p.description}</strong> — ${p.amountUsd} ({p.amountNear}{" "}
              NEAR) · {p.category} · vendor {p.vendorAccountId} · status:{" "}
              <strong>{p.status}</strong>
              {p.reason && <> · {p.reason}</>}
              <br />
              Approvals ({p.approvals.length}/{policy.requiredApprovals}):{" "}
              {p.approvals.length === 0
                ? "none yet"
                : p.approvals.map((a) => (
                    <span key={a.txHash}>
                      {a.approver} (<TxLink hash={a.txHash} v={state.verifications[a.txHash]} />){" "}
                    </span>
                  ))}
              <br />
              {p.executionTxHash ? (
                <>
                  Executed:{" "}
                  <TxLink hash={p.executionTxHash} v={state.verifications[p.executionTxHash]} />
                </>
              ) : (
                p.status === "pending" && (
                  <>
                    {policy.approvers.map((role) => (
                      <button
                        key={role}
                        disabled={!!busy}
                        onClick={() =>
                          post("/api/approvals", { proposalId: p.id, approver: role }, `approve-${role}`)
                        }
                      >
                        Approve as {role}
                      </button>
                    ))}{" "}
                    <button
                      disabled={!!busy}
                      onClick={() => post("/api/execute", { proposalId: p.id }, "execute")}
                    >
                      Execute
                    </button>{" "}
                    <span>(execute is policy-gated: it fails until approvals + cap pass)</span>
                  </>
                )
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  main: { fontFamily: "sans-serif", maxWidth: 860, margin: "0 auto", padding: 24 },
  banner: { background: "#fff8e1", border: "1px solid #e6c200", padding: 12 },
  error: { background: "#fdecea", border: "1px solid #d33", padding: 12 },
  card: { border: "1px solid #ddd", padding: 10, marginBottom: 10 },
  barWrap: {
    display: "inline-block",
    width: 160,
    height: 10,
    background: "#eee",
    marginLeft: 8,
    verticalAlign: "middle",
  },
  bar: { display: "block", height: 10, background: "#2a7" },
};
