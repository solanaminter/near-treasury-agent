// NEAR testnet layer for the Treasury Agent.
// - Transfers are signed with near-api-js from keys supplied ONLY via
//   environment variables (see .env.local.example). No key ever lives in
//   this repo, in state files, or in client bundles.
// - Verification prefers the NEARBlocks indexer GET API (read-only, works
//   from restricted networks) and falls back to an RPC tx-status POST
//   (works from browsers and Vercel, but not from every sandbox).
// - Every function returns real on-chain data or throws; nothing here
//   invents a transaction hash.

import * as nearApi from "near-api-js";

export const TESTNET_RPC_URL =
  process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
export const NEARBLOCKS_API = "https://api-testnet.nearblocks.io/v1";

const { KeyPair, keyStores, connect, utils } = nearApi;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing environment variable ${name}`);
  return v;
}

export interface NearConnection {
  accountId: string;
  account: nearApi.Account;
}

async function connectWithKey(
  accountId: string,
  privateKey: string,
): Promise<NearConnection> {
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(
    "testnet",
    accountId,
    KeyPair.fromString(
      privateKey as Parameters<typeof KeyPair.fromString>[0],
    ),
  );
  const near = await connect({
    networkId: "testnet",
    nodeUrl: TESTNET_RPC_URL,
    keyStore,
  });
  const account = await near.account(accountId);
  return { accountId, account };
}

/**
 * Send a real NEAR transfer on testnet. Returns the transaction hash.
 * Throws on any failure — callers must NOT record a hash unless this resolves.
 */
export async function sendTransfer(opts: {
  fromAccountId: string;
  fromPrivateKey: string;
  toAccountId: string;
  amountNear: string;
}): Promise<string> {
  const { account } = await connectWithKey(
    opts.fromAccountId,
    opts.fromPrivateKey,
  );
  const amountYocto = utils.format.parseNearAmount(opts.amountNear);
  if (!amountYocto) throw new Error(`invalid NEAR amount ${opts.amountNear}`);
  const outcome = await account.sendMoney(opts.toAccountId, BigInt(amountYocto));
  const txHash =
    (outcome.transaction_outcome as { id?: string } | undefined)?.id ??
    (outcome as unknown as { transaction?: { hash?: string } }).transaction
      ?.hash;
  if (!txHash) throw new Error("transfer succeeded but no tx hash returned");
  return txHash;
}

export interface TxVerification {
  found: boolean;
  blockHeight?: number;
  receiverAccountId?: string;
  signerAccountId?: string;
  /** Human-readable source of the verification ("nearblocks" | "rpc"). */
  source?: string;
}

/** Verify a tx hash against the NEARBlocks indexer (GET, no signing). */
export async function verifyViaNearblocks(
  txHash: string,
): Promise<TxVerification> {
  const res = await fetch(`${NEARBLOCKS_API}/txns/${txHash}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`nearblocks lookup failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    txns?: Array<{
      block?: { block_height?: number };
      receiver_account_id?: string;
      signer_account_id?: string;
    }>;
  };
  const tx = data.txns?.[0];
  if (!tx) return { found: false };
  return {
    found: true,
    blockHeight: tx.block?.block_height,
    receiverAccountId: tx.receiver_account_id,
    signerAccountId: tx.signer_account_id,
    source: "nearblocks",
  };
}

/** Verify a tx hash via RPC tx-status (POST; may be blocked on some networks). */
export async function verifyViaRpc(
  txHash: string,
  signerAccountId: string,
): Promise<TxVerification> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(TESTNET_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "verify",
        method: "tx",
        params: [txHash, signerAccountId],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`RPC lookup failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      result?: {
        transaction_outcome?: { block_hash?: string };
        transaction?: {
          receiver_id?: string;
          signer_id?: string;
        };
      };
      error?: unknown;
    };
    if (data.error || !data.result) return { found: false };
    return {
      found: true,
      receiverAccountId: data.result.transaction?.receiver_id,
      signerAccountId: data.result.transaction?.signer_id,
      source: "rpc",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort verification: nearblocks first (works almost everywhere),
 * RPC second. Returns found=false only when both agree the tx is absent
 * or unreachable — callers display that honestly as "unverified".
 */
export async function verifyTransaction(
  txHash: string,
  signerAccountId?: string,
): Promise<TxVerification> {
  try {
    const v = await verifyViaNearblocks(txHash);
    if (v.found) return v;
  } catch {
    // Fall through to RPC.
  }
  if (signerAccountId) {
    try {
      return await verifyViaRpc(txHash, signerAccountId);
    } catch {
      // Both paths failed: report unverified, do not invent data.
    }
  }
  return { found: false };
}

/** Testnet account balance in NEAR (GET via nearblocks; null when unknown). */
export async function accountBalanceNear(
  accountId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${NEARBLOCKS_API}/accounts/${accountId}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      account?: Array<{ amount?: string }>;
    };
    const yocto = data.account?.[0]?.amount;
    if (!yocto) return null;
    return utils.format.formatNearAmount(yocto, 5);
  } catch {
    return null;
  }
}

export { requireEnv };
