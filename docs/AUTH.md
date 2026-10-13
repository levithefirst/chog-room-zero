# Sign-in (RC-7)

Optional. Anyone can play as a guest and nothing in the game waits for sign-in. Signing in proves an identity
(Google account or wallet address) and links it to this device's player card. **Progress still lives on the device**
(localStorage): there is no database yet, so there is no cloud save and no cross-device account. Sign-in never checks
Chog NFT ownership.

## What is built

| Piece | File | Notes |
|---|---|---|
| Config | `api/auth/config.ts` | `GET` -> `{google, wallet}` booleans only. |
| Session | `api/auth/session.ts`, `api/auth/logout.ts` | HMAC-SHA256 signed token in an HttpOnly, Secure, SameSite=Lax cookie (30 days), listing the proven identities. Logout is same-origin POST only. |
| Google | `api/auth/google/start.ts`, `callback.ts` | OAuth 2.0 authorization code + PKCE (S256) + signed state cookie (10 min). Code exchanged server-to-server with the client secret; ID token audience, issuer and expiry checked. |
| Wallets | `api/auth/wallet/challenge.ts`, `verify.ts` | Sign-In with Ethereum (EIP-4361) message bound to the host, a random nonce and a 5 minute expiry, kept in a signed HttpOnly SameSite=Strict cookie for that browser. The server recovers the signer (EIP-191) and compares it with the challenged address. The challenge is cleared on every verify, so a signature works once. Connecting a wallet alone signs nothing in. |
| Browser | `src/ui/auth.ts` | EIP-6963 discovery offers MetaMask (`io.metamask`), Rabby (`io.rabby`), Zerion (`io.zerion.wallet`); falls back to a single injected `window.ethereum`. |
| Tests | `tests/rc7-auth.test.ts` | 12 tests: config, token tampering/expiry, EIP-55 and a public web3.js `personal_sign` vector, full wallet round trip, replay, wrong key, edited message, foreign host/origin, expiry, Google start (PKCE, redirect URI, no secret leaked), callback (bad state, wrong audience, expired), identity linking, logout. |

GitHub sign-in is not offered (owner: excluded).

## Owner setup (Vercel project `chog-room-zero`, Environment Variables)

| Variable | Value | Needed for |
|---|---|---|
| `AUTH_SECRET` | 32+ random characters (e.g. `openssl rand -base64 48`) | everything (without it every endpoint answers "not set up") |
| `AUTH_ORIGIN` | the canonical address, e.g. `https://chogroomzero.xyz` | Google (redirect URI), wallet host check |
| `GOOGLE_CLIENT_ID` | from Google Cloud | Google |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud (server only, never in the client or Git) | Google |
| `AUTH_ALLOWED_HOSTS` | optional, comma list of extra hosts allowed to sign in with a wallet | e.g. `chog-room-zero.vercel.app` |

The deployment's own `*.vercel.app` URLs (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) are
allowed automatically. After changing variables, redeploy.

Google Cloud (https://console.cloud.google.com/auth/clients): create an OAuth client of type **Web application**.
- Authorized JavaScript origin: `https://chogroomzero.xyz`
- Authorized redirect URI: `https://chogroomzero.xyz/api/auth/google/callback`
- Scopes used: `openid email profile`.
Google sign-in started on any other host first moves to `AUTH_ORIGIN`, so the cookie lands where Google returns.

## Limits (honest)

- **No database:** sessions prove identity, nothing more. Records, medals and the player card are per device. A cloud
  save needs a store (for example Vercel Marketplace Neon or Upstash, free tiers) and an owner decision.
- **Replay:** a captured signature cannot be redeemed without the same browser's challenge cookie, and the cookie
  expires in 5 minutes and is cleared on use. Strict server-side single-use nonces need a key-value store.
- **Mobile wallets:** works inside a wallet's in-app browser (MetaMask, Rabby, Zerion inject a provider). A plain
  mobile browser would need WalletConnect, which needs a project id (owner action); not included.
- **Chains:** the signed message records the wallet's chain id only. No chain-specific feature is enabled. Monad /
  Robinhood chain ids and RPCs are UNKNOWN in `docs/STATE.md` until verified.
- **NFT:** ownership verification is separate and not built (contract, network and method UNKNOWN).
