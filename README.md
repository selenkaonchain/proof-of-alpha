# 🧠 Proof of Alpha (PoA)

**Timestamp trade predictions on Bitcoin L1. Prove your alpha before it happens.**

Built on [OP_NET](https://opnet.org) · Bitcoin Layer 1 smart contract infrastructure · Built with [BOB](https://ai.opnet.org)

---

## What It Does

Proof of Alpha is an on-chain prediction reputation system. Traders commit hashed predictions to Bitcoin L1 via OP_NET, prove their foresight after outcomes unfold, and build a verifiable track record.

**No more "I called it" with no proof.** Every prediction is hashed, timestamped, and committed on-chain — before the outcome happens.

### Core Flow

1. **Write a prediction** — *"BTC will hit $100k before June 2026"*
2. **Commit on-chain** — The prediction is SHA-256 hashed and a $PILL token transfer is made on Bitcoin L1 via OP_NET, proving the timestamp
3. **Wait for outcome** — Deadline countdown runs
4. **Reveal & verify** — Mark as correct or wrong. The hash, timestamp, and outcome are all verifiable
5. **Build reputation** — Accuracy %, win streak, leaderboard rank

### Features

- **On-chain commitment** — Every prediction costs 50 $PILL, creating an immutable Bitcoin L1 timestamp
- **SHA-256 hashing** — Prediction text is hashed before commitment. Tamper-proof
- **Reputation system** — Accuracy percentage, current streak, best streak
- **Leaderboard** — Top traders ranked by accuracy and verified predictions
- **Share to X** — One-click tweet: *"I just proved my alpha on Bitcoin"*
- **Deadline system** — Predictions expire if not resolved (1–90 day windows)
- **Dark crypto UI** — Bitcoin orange accent, glassmorphism cards, responsive design

---

## Why It Matters

| Criteria | How PoA Delivers |
|---|---|
| **Innovation** | First on-chain alpha proof system on Bitcoin L1 |
| **Working Product** | Simple UI + real on-chain token transfers |
| **Mainnet Viability** | Crypto influencers, traders, analysts — anyone making public calls |
| **UX** | Three clicks: write → commit → share |
| **Virality** | Built-in leaderboard + X share button |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Bitcoin L1 via [OP_NET](https://opnet.org) |
| Wallet | [OPWallet](https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb) |
| SDK | `opnet@rc`, `@btc-vision/bitcoin@rc`, `@btc-vision/transaction@rc` |
| Wallet Connect | `@btc-vision/walletconnect@latest` |
| Frontend | React + TypeScript |
| Build | Vite + vite-plugin-node-polyfills |
| Network | OP_NET Testnet (`networks.opnetTestnet`) |
| Fee Token | $PILL (OP_20 standard) |
| Hashing | Web Crypto API (SHA-256) |
| AI Agent | [BOB](https://ai.opnet.org) — OP_NET's AI dev agent |

---

## How to Run

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [OPWallet browser extension](https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb)
- Testnet BTC from [faucet.opnet.org](https://faucet.opnet.org)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/proof-of-alpha.git
cd proof-of-alpha

# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

### Deploy

```bash
# Vercel (recommended)
vercel

# Or build and upload dist/ to IPFS
npm run build
```

---

## Project Structure

```
proof-of-alpha/
├── index.html              # Entry point
├── package.json            # Dependencies (opnet, btc-vision, react)
├── vite.config.ts          # Vite + node polyfills + OPNet aliases
├── tsconfig.json           # TypeScript config
├── vercel.json             # Vercel deployment config
├── CLAUDE.md               # BOB/Claude project instructions
├── .gitignore              # Security: excludes .env, node_modules, dist
└── src/
    ├── main.tsx            # React entry
    ├── App.tsx             # Main app component (all screens)
    ├── styles.css          # Full design system (dark crypto theme)
    ├── vite-env.d.ts       # Vite type reference
    ├── hooks/
    │   ├── useBlockchain.ts    # Wallet connection, balance, on-chain commits
    │   └── usePredictions.ts   # Prediction CRUD, stats, leaderboard
    └── utils/
        └── helpers.ts      # SHA-256 hash, formatting utilities
```

---

## Security

- **No private keys** in codebase — wallet extension handles all signing
- **No .env files** committed — `.gitignore` excludes all environment files
- **No backend** — fully client-side, no API keys to leak
- **signer/mldsaSigner null** on frontend — OPWallet signs transactions
- `node_modules/` and `dist/` excluded from repository

---

## Built With BOB

This project was built using [BOB](https://ai.opnet.org), OP_NET's AI development agent. BOB provided:
- Correct package versions and Vite configuration
- OPNet wallet integration patterns
- Contract interaction best practices
- Network configuration (`networks.opnetTestnet`)

---

## License

MIT

---

*Proof of Alpha — Because real alpha leaves a trail on Bitcoin.* 🧠⛓️
