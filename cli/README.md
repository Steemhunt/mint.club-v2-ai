# 🪙 Mint Club CLI

> Trade bonding curve tokens on **Base** from your terminal.

[![npm](https://img.shields.io/npm/v/mint.club-cli.svg?style=flat-square)](https://www.npmjs.com/package/mint.club-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Part of the [mint.club-v2-ai](https://github.com/Steemhunt/mint.club-v2-ai) monorepo.

---

[Mint Club V2](https://mint.club) is a permissionless bonding curve protocol — launch a token backed by any reserve asset with automated pricing. No liquidity pool required.

This CLI gives you full access from the command line: check prices, buy, sell, zap through Uniswap, create tokens, and manage your wallet.

## Install

```bash
npm install -g mint.club-cli
```

Requires Node.js 18+. After install, the `mc` command is available globally.

## Setup

```bash
# Generate a new wallet
mc wallet --generate

# Or import an existing key
mc wallet --set-private-key 0xYourPrivateKey
```

Your private key is stored at `~/.mintclub/.env`. **Back it up securely** — if lost, your funds are gone forever.

## Commands

### 💱 `mc price <token>`

Get current token price in reserve and USD.

```
$ mc price 0xDF2B...79c9

💱 SIGNET (0xDF2B...79c9)

   Price: 1.170000 HUNT
   Price (USD): $0.0061
   Reserve: 126,819.23 HUNT (~$660.34)
   Market Cap: ~$3,159.60
```

Uses the bonding curve for reserve pricing and [1inch Spot Price Aggregator](https://1inch.io) for USD conversion.

---

### 🔍 `mc info <token>`

Detailed token info — name, supply, reserve, royalties, bonding curve, and pricing.

```
$ mc info 0xDF2B...79c9

🪙 Token: SIGNET (SIGNET)
📍 Address: 0xDF2B...79c9
👤 Creator: 0x980C...92E4
💰 Reserve Token: 0x37f0...064C (HUNT)
💎 Reserve Balance: 126,819.23
📊 Supply: 517,963.04 / 1,000,000
💸 Mint Royalty: 0.30%  |  🔥 Burn Royalty: 0.30%
📈 Bonding Curve: 500 steps, 0.01 → 99.99 per token (+10000x)

💱 Current Price: 1.17 reserve per 1 SIGNET (~$0.0061)
💵 Reserve Value: ~$660.34
📊 Market Cap: ~$3,159.60
```

---

### 🛒 `mc buy <token>`

Buy (mint) tokens with the reserve token along the bonding curve.

```bash
mc buy 0xTokenAddress -a 100          # Buy 100 tokens
mc buy 0xTokenAddress -a 100 -m 500   # Max cost 500 reserve
```

| Option | Description |
|--------|-------------|
| `-a, --amount <n>` | Tokens to buy **(required)** |
| `-m, --max-cost <n>` | Max reserve to spend |

---

### 🔥 `mc sell <token>`

Sell (burn) tokens back to the bonding curve.

```bash
mc sell 0xTokenAddress -a 50           # Sell 50 tokens
mc sell 0xTokenAddress -a 50 -m 10     # Min refund 10 reserve
```

| Option | Description |
|--------|-------------|
| `-a, --amount <n>` | Tokens to sell **(required)** |
| `-m, --min-refund <n>` | Min reserve to receive |

---

### ⚡ `mc zap-buy <token>`

Buy tokens with **any token** — auto-routes through Uniswap V3 into the reserve, then mints.

```bash
# Buy with ETH (auto-finds best route)
mc zap-buy 0xTokenAddress -i ETH -a 0.01

# Buy with USDC (manual path)
mc zap-buy 0xTokenAddress -i 0xUSDC -a 50 -p "0xUSDC,3000,0xHUNT"
```

| Option | Description |
|--------|-------------|
| `-i, --input-token <addr>` | Token to pay with — use `ETH` for native ETH **(required)** |
| `-a, --amount <n>` | Amount of input token to spend **(required)** |
| `-p, --path <p>` | Manual swap path: `token,fee,token,...` (optional — auto-routes if omitted) |
| `-m, --min-tokens <n>` | Min tokens to receive |

---

### ⚡ `mc zap-sell <token>`

Sell tokens and receive **any token** — burns for reserve, then swaps to your desired output.

```bash
# Sell to ETH
mc zap-sell 0xTokenAddress -a 100 -o ETH

# Sell to USDC
mc zap-sell 0xTokenAddress -a 100 -o 0xUSDC
```

| Option | Description |
|--------|-------------|
| `-a, --amount <n>` | Tokens to sell **(required)** |
| `-o, --output-token <addr>` | Token to receive — use `ETH` for native ETH **(required)** |
| `-p, --path <p>` | Manual swap path (optional — auto-routes if omitted) |
| `-m, --min-output <n>` | Min output to receive |

---

### 🪙 `mc create`

Create a new bonding curve token with presets or custom steps.

```bash
# Exponential curve from 0.01 to 100
mc create -n "My Token" -s MTK \
  -r 0xReserveToken -x 1000000 \
  --curve exponential --initial-price 0.01 --final-price 100

# Custom steps
mc create -n "My Token" -s MTK \
  -r 0xReserveToken -x 1000000 \
  -t "500000:0.01,1000000:1.0"
```

**Curve presets:** `linear` · `exponential` · `logarithmic` · `flat`

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Token name **(required)** |
| `-s, --symbol <sym>` | Token symbol **(required)** |
| `-r, --reserve <addr>` | Reserve token address **(required)** |
| `-x, --max-supply <n>` | Max supply **(required)** |
| `--curve <type>` | Curve preset |
| `--initial-price <n>` | Start price (with `--curve`) |
| `--final-price <n>` | End price (with `--curve`) |
| `-t, --steps <s>` | Custom steps as `range:price,...` |
| `--mint-royalty <bp>` | Mint royalty in bps (default: `100` = 1%) |
| `--burn-royalty <bp>` | Burn royalty in bps (default: `100` = 1%) |
| `-y, --yes` | Skip confirmation |

---

### 👛 `mc wallet`

View balances with USD values, or manage keys.

```
$ mc wallet

👛 Wallet: 0x5831...E316

💰 Balances on Base:

   ETH: 0.008749 (~$17.13)
   HUNT: 1,000.00 (~$5.20)

🪙 Mint Club Tokens:

   SIGNET: 500.00 (~$2.93)
   ONCHAT: 1,200.00 (~$8.40)

💵 Total: ~$33.66
```

Tokens you've traded via `buy`/`sell`/`zap-buy`/`zap-sell` are automatically tracked in `~/.mintclub/tokens.json` and shown here.

| Option | Description |
|--------|-------------|
| `-g, --generate` | Generate a new wallet |
| `-s, --set-private-key <key>` | Import a private key |

---

### 📤 `mc send <to>`

Send ETH, ERC-20, or ERC-1155 tokens.

```bash
mc send 0xRecipient -a 0.1                          # Send ETH
mc send 0xRecipient -a 100 -t 0xToken               # Send ERC-20
mc send 0xRecipient -a 1 -t 0xNFT --token-id 42     # Send ERC-1155
```

| Option | Description |
|--------|-------------|
| `-a, --amount <n>` | Amount **(required)** |
| `-t, --token <addr>` | Token address (omit for ETH) |
| `--token-id <id>` | ERC-1155 token ID |

---

### ⬆️ `mc upgrade`

Update to the latest version.

```bash
mc upgrade
```

## Swap Routing

Zap commands auto-find the best Uniswap V3 route through WETH, USDC, and USDbC. You can also specify a manual path:

```
tokenAddress,fee,tokenAddress[,fee,tokenAddress]
```

**Fee tiers:** `100` (0.01%) · `500` (0.05%) · `3000` (0.3%) · `10000` (1%)

**Example:** `0xUSDC,500,0xWETH,3000,0xHUNT` (USDC → WETH → HUNT)

## Links

| | |
|---|---|
| 🌐 **App** | [mint.club](https://mint.club) |
| 📖 **Docs** | [docs.mint.club](https://docs.mint.club) |
| 📦 **SDK** | [mint.club-v2-sdk](https://www.npmjs.com/package/mint.club-v2-sdk) |
| 🔗 **Contracts** | [github.com/Steemhunt/mint.club-v2-contract](https://github.com/Steemhunt/mint.club-v2-contract) |
| 💬 **Chat** | [OnChat](https://onchat.sebayaki.com/mintclub) |
| 🐦 **Twitter** | [@MintClubPro](https://twitter.com/MintClubPro) |
| 🏗️ **Hunt Town** | [hunt.town](https://hunt.town) |

## License

MIT — built with 🏗️ by [Hunt Town](https://hunt.town)
