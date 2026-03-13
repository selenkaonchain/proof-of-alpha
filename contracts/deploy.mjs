/**
 * ProofOfAlpha Contract Deployment Script
 *
 * Usage:
 *   node deploy.mjs <WIF_PRIVATE_KEY> <MLDSA_PRIVATE_KEY_HEX>
 *
 * Or set environment variables:
 *   DEPLOYER_WIF=<your-WIF>  MLDSA_KEY=<your-MLDSA-hex>  node deploy.mjs
 *
 * Requirements:
 *   - The deployer wallet must have BTC on OP_NET testnet
 *   - The WASM must be compiled first: npm run build
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Proxy (bypass geo-block) ────────────────────────────────────────────────
const PROXY_URL = process.env.PROXY_URL || 'http://728bc5nr:Gery7uCt@104.164.198.162:62868';
console.log('🌐  Using proxy:', PROXY_URL.replace(/:([^:@]+)@/, ':***@'));
const proxyAgent = new ProxyAgent(PROXY_URL);

// ── Config ──────────────────────────────────────────────────────────────────
const TESTNET_RPC = 'https://testnet.opnet.org';
const FEE_RATE = 150; // sat/vB – adjust if needed
const PRIORITY_FEE = 10_000n; // sats
const GAS_SAT_FEE = 100_000n; // sats

// ── Read keys ───────────────────────────────────────────────────────────────
const wif = process.argv[2] || process.env.DEPLOYER_WIF;
const mldsaKey = process.argv[3] || process.env.MLDSA_KEY;

if (!wif || !mldsaKey) {
    console.error(
        'Usage: node deploy.mjs <WIF_PRIVATE_KEY> <MLDSA_PRIVATE_KEY_HEX>\n' +
        '  Or set DEPLOYER_WIF and MLDSA_KEY environment variables.'
    );
    process.exit(1);
}

// ── Dynamic imports (ESM packages) ──────────────────────────────────────────
const { networks } = await import('@btc-vision/bitcoin');
const {
    TransactionFactory,
    Wallet,
    EcKeyPair,
    TweakedSigner,
} = await import('@btc-vision/transaction');
const { JSONRpcProvider } = await import('opnet');

const network = networks.opnetTestnet;

// ── Create wallet & provider ────────────────────────────────────────────────
console.log('🔑  Loading wallet...');
const wallet = Wallet.fromWif(wif, mldsaKey, network);
const deployerAddress = wallet.p2tr;
console.log(`📬  Deployer taproot address: ${deployerAddress}`);

const provider = new JSONRpcProvider({ url: TESTNET_RPC, network });

// Override _send to route all RPC calls through proxy
provider._send = async function (payload) {
    const resp = await undiciFetch(this.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'OPNET/1.0',
            Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        dispatcher: proxyAgent,
    });
    if (!resp.ok) {
        throw new Error(`Failed to fetch: ${resp.statusText}`);
    }
    const data = await resp.json();
    return [data];
};

// ── Check balance ───────────────────────────────────────────────────────────
const balance = await provider.getBalance(deployerAddress);
console.log(`💰  Balance: ${balance} sat`);

if (balance < 50_000n) {
    console.error('❌  Insufficient balance. Need at least ~50,000 sat for deployment.');
    process.exit(1);
}

// ── Read compiled WASM ──────────────────────────────────────────────────────
const wasmPath = resolve(__dirname, 'build', 'ProofOfAlpha.wasm');
const bytecode = new Uint8Array(readFileSync(wasmPath));
console.log(`📦  WASM bytecode: ${bytecode.length} bytes`);

// ── Fetch UTXOs ─────────────────────────────────────────────────────────────
console.log('🔍  Fetching UTXOs...');
const utxos = await provider.utxoManager.getUTXOs({
    address: deployerAddress,
    optimize: false,
    mergePendingUTXOs: true,
    filterSpentUTXOs: true,
});

if (!utxos || utxos.length === 0) {
    console.error('❌  No UTXOs found for deployer address. Fund the wallet first.');
    process.exit(1);
}
console.log(`✅  Found ${utxos.length} UTXO(s)`);

// ── Solve PoW challenge ─────────────────────────────────────────────────────
console.log('⛏️   Fetching PoW challenge...');
const challenge = await provider.getChallenge();
console.log(`✅  Challenge epoch: ${challenge.epochNumber}, difficulty: ${challenge.difficulty}`);

// ── Build deployment transaction ────────────────────────────────────────────
console.log('🏗️   Building deployment transaction...');
const factory = new TransactionFactory();

const deploymentResult = await factory.signDeployment({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network,
    bytecode,
    utxos,
    feeRate: FEE_RATE,
    priorityFee: PRIORITY_FEE,
    gasSatFee: GAS_SAT_FEE,
    challenge,
});

const [fundingTxHex, revealTxHex] = deploymentResult.transaction;
console.log(`📝  Contract address: ${deploymentResult.contractAddress}`);
console.log(`📝  Contract pubkey:  ${deploymentResult.contractPubKey}`);

// ── Broadcast ───────────────────────────────────────────────────────────────
console.log('📡  Broadcasting funding transaction...');
const fundingResult = await provider.sendRawTransaction(fundingTxHex, false);
if (!fundingResult.success) {
    console.error('❌  Funding TX failed:', fundingResult.error);
    process.exit(1);
}
console.log(`✅  Funding TX: ${fundingResult.result}`);

console.log('📡  Broadcasting reveal transaction...');
const revealResult = await provider.sendRawTransaction(revealTxHex, false);
if (!revealResult.success) {
    console.error('❌  Reveal TX failed:', revealResult.error);
    process.exit(1);
}
console.log(`✅  Reveal TX: ${revealResult.result}`);

// ── Done ────────────────────────────────────────────────────────────────────
console.log('\n🎉  Deployment successful!');
console.log(`    Contract address: ${deploymentResult.contractAddress}`);
console.log(`    Contract pubkey:  ${deploymentResult.contractPubKey}`);
console.log('\n📋  Update your frontend:');
console.log(`    PROOF_OF_ALPHA_CONTRACT = '${deploymentResult.contractAddress}'`);

// Clean up wallet keys from memory
wallet.zeroize();
