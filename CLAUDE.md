# CLAUDE.md — Proof of Alpha

## Project Description
Proof of Alpha (PoA) is a prediction reputation system built on Bitcoin Layer 1 with OP_NET.
Users connect OPWallet, write trade predictions, commit the SHA-256 hash on-chain via a $PILL token transfer, and later reveal outcomes to build verifiable reputation.

## BOB Integration
- Package versions and vite.config.ts from BOB's `opnet_opnet_dev` tool (setup section)
- Network configuration from BOB's frontend guidelines: `networks.opnetTestnet` (NOT `networks.testnet`)
- Provider pattern: singleton `JSONRpcProvider({ url, network })` per BOB's caching guidelines
- Contract interaction: `getContract<IOP20Contract>(addr, OP_20_ABI, provider, network, sender?)` per BOB

## Package Rules
### ALWAYS Use
- `opnet@rc` — OPNet SDK, JSONRpcProvider, getContract, ABIs
- `@btc-vision/bitcoin@rc` — Bitcoin library (OPNet fork, includes `networks.opnetTestnet`)
- `@btc-vision/transaction@rc` — Transaction types and ABI data types
- `@btc-vision/walletconnect@latest` — Wallet connection modal
- `react` — UI framework
- `vite` + `vite-plugin-node-polyfills` — Build tool with Node.js polyfills

### NEVER Use
- `bitcoinjs-lib`, `ethers`, `web3`, `@metamask/sdk`
- `window.ethereum`
- `express`
- `networks.testnet` — Use `networks.opnetTestnet` instead!

## Wallet Integration
- Use `@btc-vision/walletconnect` for the connection modal
- ALWAYS include the WalletConnect popup CSS fix (mandatory per BOB)
- signer and mldsaSigner are NULL on frontend — wallet extension signs
- Use `useWalletConnect()` hook for wallet state

## Contract Interaction
- Create SEPARATE `JSONRpcProvider({ url, network })` for read operations
- Testnet: `https://testnet.opnet.org` with `networks.opnetTestnet`
- ALWAYS check `'error' in result` before using contract call results
- NEVER put private keys in frontend code

## App Mechanics
- User writes a prediction (max 280 chars)
- Prediction text + wallet + timestamp → SHA-256 hash
- Hash committed on-chain via $PILL token transfer (50 PILL)
- User sets a deadline (1-90 days)
- After outcome, user reveals as correct/wrong
- Correct predictions increase reputation score & streak
- Leaderboard ranks traders by accuracy & streak
- Share to X (Twitter) with auto-generated tweet

## State Persistence
- Predictions stored in localStorage (keyed by wallet address)
- Leaderboard derived from all stored predictions
- Offline-compatible — predictions persist between sessions

## Build and Dev
- `npm install` — install dependencies
- `npm run dev` — start dev server
- `npm run build` — production build to `dist/`
