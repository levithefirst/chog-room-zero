// POST /api/auth/wallet/verify {message, signature}: redeem a signed Sign-In with Ethereum challenge, once
// (api/_lib/auth.ts verifyWallet). A connected wallet is not signed in until this succeeds.
import { env, verifyWallet } from '../../_lib/auth.js';
import { openDb } from '../../_lib/db.js';

export function POST(req: Request): Promise<Response> {
  return verifyWallet(req, env(), openDb);
}
