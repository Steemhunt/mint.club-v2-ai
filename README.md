# 🪙 mint.club-cli

> The command-line interface for [Mint Club V2](https://mint.club) — create and trade bonding curve tokens from your terminal.

[![npm version](https://img.shields.io/npm/v/mint.club-cli.svg)](https://www.npmjs.com/package/mint.club-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What is Mint Club?

[Mint Club V2](https://mint.club) is a permissionless bonding curve protocol for creating and trading tokens with automated pricing. Anyone can launch a token backed by a reserve asset — no liquidity pool needed. The bonding curve guarantees instant buy/sell at deterministic prices.

- 🌐 **App**: [mint.club](https://mint.club)
- 📖 **Docs**: [docs.mint.club](https://docs.mint.club)
- 🐦 **Twitter**: [@MintClubPro](https://twitter.com/MintClubPro)
- 💬 **Chat**: [OnChat](https://onchat.sebayaki.com/mintclub)
- 📦 **SDK**: [mint.club-v2-sdk](https://www.npmjs.com/package/mint.club-v2-sdk)
- 🔗 **GitHub**: [github.com/Steemhunt](https://github.com/Steemhunt)

## Install

```bash
npm install -g mint.club-cli
```

Requires Node.js 18+.

## Quick Start

```bash
# Set up a wallet
mc wallet --generate

# Check your wallet & balances
mc wallet

# Look up a token
mc info 0xYourTokenAddress --chain base

# Buy tokens
mc buy 0xYourTokenAddress -a 100 --chain base
```

## Commands

### `mc wallet`

Manage your wallet and check balances.

```bash
# Show wallet address and token balances
mc wallet

# Show balances on a specific chain
mc wallet --chain arbitrum

# Generate a new wallet (saves to ~/.mintclub/.env)
mc wallet --generate

# Import an existing private key
mc wallet --set-private-key 0xYourPrivateKey
```

### `mc info <token>`

Get detailed token information — name, supply, reserve, royalties, and bonding curve summary.

```bash
mc info 0xTokenAddress --chain base
```

```
🪙 Token: SIGNET (SIGNET)
📍 Address: 0xDF2B...79c9
👤 Creator: 0x980C...92E4
💰 Reserve Token: 0x37f0...064C
💎 Reserve Balance: 126819.23
📊 Supply: 517963.04 / 1000000
💸 Mint Royalty: 0.30%
🔥 Burn Royalty: 0.30%
📈 Bonding Curve: 500 steps, 0.01 → 99.99 per token (+10000x)
💱 Current Price: 1.17 reserve per 1 SIGNET
```

### `mc buy <token>`

Buy (mint) tokens by paying the reserve token along the bonding curve.

```bash
mc buy 0xTokenAddress -a 100            # Buy 100 tokens
mc buy 0xTokenAddress -a 100 -m 500     # Buy 100 tokens, max cost 500 reserve
mc buy 0xTokenAddress -a 100 --chain polygon
```

| Option | Description |
|--------|-------------|
| `-a, --amount <n>` | Number of tokens to buy (required) |
| `-m, --max-cost <n>` | Maximum reserve tokens to spend |
| `-c, --chain <chain>` | Target chain (default: `base`) |

### `mc sell <token>`

Sell (burn) tokens back to the bonding curve for reserve tokens.

```bash
mc sell 0xTokenAddress -a 50             # Sell 50 tokens
mc sell 0xTokenAddress -a 50 -m 10       # Sell 50 tokens, minimum refund 10
```

| Option | Description |
|--------|-------------|
| `-a, --amount <n>` | Number of tokens to sell (required) |
| `-m, --min-refund <n>` | Minimum reserve tokens to receive |
| `-c, --chain <chain>` | Target chain (default: `base`) |

### `mc create`

Create a new bonding curve token. Use a **curve preset** for easy setup, or define **custom steps** for full control.

#### Using curve presets (recommended)

```bash
mc create \
  -n "My Token" \
  -s MTK \
  -r 0xReserveTokenAddress \
  -x 1000000 \
  --curve exponential \
  --initial-price 0.01 \
  --final-price 100
```

Available curves:
- **`linear`** — price increases steadily from start to end
- **`exponential`** — slow start, accelerating growth (most common)
- **`logarithmic`** — fast early growth, flattens toward the end
- **`flat`** — constant price (initial and final price must match)

#### Using custom steps

```bash
mc create \
  -n "My Token" \
  -s MTK \
  -r 0xReserveTokenAddress \
  -x 1000000 \
  -t "500000:0.01,1000000:1.0"
```

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Token name (required) |
| `-s, --symbol <sym>` | Token symbol (required) |
| `-r, --reserve <addr>` | Reserve token address (required) |
| `-x, --max-supply <n>` | Maximum supply (required) |
| `--curve <type>` | Curve preset: `linear`, `exponential`, `logarithmic`, `flat` |
| `--initial-price <n>` | Starting price (required with `--curve`) |
| `--final-price <n>` | Final price (required with `--curve`) |
| `-t, --steps <s>` | Custom steps as `range:price,...` (alternative to `--curve`) |
| `--mint-royalty <bp>` | Mint royalty in basis points (default: 0) |
| `--burn-royalty <bp>` | Burn royalty in basis points (default: 0) |
| `-c, --chain <chain>` | Target chain (default: `base`) |

### `mc zap-buy <token>` ⚡

Buy tokens with **any** token — automatically swaps through Uniswap V3 into the reserve token, then mints. Currently available on **Base** only.

```bash
mc zap-buy 0xTokenAddress \
  -i 0xInputToken \
  -a 1.0 \
  -p "0xInputToken,3000,0xReserveToken"
```

| Option | Description |
|--------|-------------|
| `-i, --input-token <addr>` | Token you're paying with (use `0x0` for ETH) (required) |
| `-a, --input-amount <n>` | Amount of input token (required) |
| `-p, --path <p>` | Uniswap V3 swap path: `token,fee,token,...` (required) |
| `-m, --min-tokens <n>` | Minimum tokens to receive |
| `-c, --chain <chain>` | Target chain (default: `base`) |

### `mc zap-sell <token>` ⚡

Sell tokens and receive **any** token — burns tokens for reserve, then swaps to your desired output. Currently available on **Base** only.

```bash
mc zap-sell 0xTokenAddress \
  -a 100 \
  -o 0xOutputToken \
  -p "0xReserveToken,3000,0xOutputToken"
```

| Option | Description |
|--------|-------------|
| `-a, --amount <n>` | Tokens to sell (required) |
| `-o, --output-token <addr>` | Token you want to receive (required) |
| `-p, --path <p>` | Uniswap V3 swap path: `token,fee,token,...` (required) |
| `-m, --min-output <n>` | Minimum output tokens to receive |
| `-c, --chain <chain>` | Target chain (default: `base`) |

### `mc send <to>`

Send ETH, ERC-20 tokens, or ERC-1155 tokens to another wallet.

```bash
# Send ETH
mc send 0xRecipient -a 0.1

# Send ERC-20 tokens
mc send 0xRecipient -a 100 -t 0xTokenAddress

# Send ERC-1155 NFT
mc send 0xRecipient -a 1 -t 0xNFTAddress --token-id 42
```

| Option | Description |
|--------|-------------|
| `-a, --amount <n>` | Amount to send (required) |
| `-t, --token <addr>` | Token contract address (omit for ETH) |
| `--token-id <id>` | ERC-1155 token ID |
| `-c, --chain <chain>` | Target chain (default: `base`) |

## Configuration

Your private key is stored at `~/.mintclub/.env`:

```
PRIVATE_KEY=0xYourPrivateKeyHere
```

You can set it up via:
- `mc wallet --generate` — create a brand new wallet
- `mc wallet --set-private-key 0x...` — import an existing key

> ⚠️ **Back up your private key in a secure, encrypted location!** If you lose it, your funds are gone forever. If it's leaked, anyone can drain your wallet immediately.

## Supported Chains

| Chain | Name | Zap Support |
|-------|------|:-----------:|
| Base | `base` | ✅ |
| Ethereum | `mainnet` | — |
| Arbitrum | `arbitrum` | — |
| Optimism | `optimism` | — |
| Polygon | `polygon` | — |
| BNB Chain | `bsc` | — |
| Avalanche | `avalanche` | — |
| Blast | `blast` | — |
| Degen | `degen` | — |
| Kaia | `kaia` | — |
| Cyber | `cyber` | — |
| Ham | `ham` | — |
| Mode | `mode` | — |
| Zora | `zora` | — |

Default chain is `base`. Use `--chain <name>` on any command to switch.

## Swap Path Format

For zap commands, the `--path` flag uses Uniswap V3 path encoding:

```
tokenAddress,fee,tokenAddress,fee,tokenAddress
```

Common fee tiers: `100` (0.01%), `500` (0.05%), `3000` (0.3%), `10000` (1%)

Example multi-hop: `0xUSDC,500,0xWETH,3000,0xHUNT`

## Links

- **Mint Club App**: [mint.club](https://mint.club)
- **Documentation**: [docs.mint.club](https://docs.mint.club)
- **SDK**: [mint.club-v2-sdk](https://www.npmjs.com/package/mint.club-v2-sdk)
- **Smart Contracts**: [github.com/Steemhunt/mint.club-v2-contract](https://github.com/Steemhunt/mint.club-v2-contract)
- **Hunt Town**: [hunt.town](https://hunt.town) — the onchain co-op behind Mint Club

## License

MIT — built with 🏗️ by [Hunt Town](https://hunt.town)
