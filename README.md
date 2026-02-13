# Mint Club V2 CLI

A command-line interface for interacting with Mint Club V2 bonding curve tokens across multiple blockchains.

## Features

- 🪙 **Token Creation** — Create new bonding curve ERC20 tokens
- 🛒 **Buy/Mint** — Purchase tokens using reserve tokens or any token via ZapV2
- 🔥 **Sell/Burn** — Sell tokens back to reserve tokens or any token via ZapV2  
- 📊 **Token Info** — Get detailed token information, pricing, and bonding curve data
- ⚡ **Multi-chain** — Support for 14+ blockchains with fallback RPC endpoints
- 🔄 **Zap Trading** — Swap any token directly for Mint Club tokens (Base only)

## Installation

```bash
git clone https://github.com/Steemhunt/mint.club-v2-ai.git
cd mint.club-v2-ai
bun install
bun run build
```

### Environment Setup

Create a `.env` file with your private key:

```bash
cp .env.example .env
# Edit .env and add your private key
PRIVATE_KEY=0x...
```

## Usage

### Token Information

Get detailed information about any Mint Club token:

```bash
bun src/index.ts info 0xDF2B673Ec06d210C8A8Be89441F8de60B5C679c9 --chain base
```

### Buy Tokens

Purchase tokens with reserve tokens:

```bash
bun src/index.ts buy 0xToken... --amount 1.5 --max-cost 0.01 --chain base
```

### Sell Tokens  

Sell tokens back to reserve tokens:

```bash
bun src/index.ts sell 0xToken... --amount 1.0 --min-refund 0.008 --chain base
```

### Create New Token

Deploy a new bonding curve token:

```bash
bun src/index.ts create \
  --name "My Token" \
  --symbol "MTK" \
  --reserve 0x4200000000000000000000000000000000000006 \
  --max-supply 1000000 \
  --steps "100:0.001,1000:0.01,10000:0.1" \
  --chain base
```

### Zap Trading (Base Only)

Buy tokens with any input token via Uniswap:

```bash
bun src/index.ts zap-buy 0xToken... \
  --input-token 0xA0b86a33E6441Eb8F2F2d5F4B7c5c5c5c5c5c5c5 \
  --input-amount 0.1 \
  --path "0xA0b86a...,3000,0x4200000...,500,0x833589..." \
  --min-tokens 10 \
  --chain base
```

Sell tokens for any output token:

```bash
bun src/index.ts zap-sell 0xToken... \
  --amount 50 \
  --output-token 0xA0b86a33E6441Eb8F2F2d5F4B7c5c5c5c5c5c5c5 \
  --path "0x833589...,500,0x4200000...,3000,0xA0b86a..." \
  --min-output 0.05 \
  --chain base
```

## Supported Chains

The CLI supports the following mainnet chains:

- **base** (default)
- **mainnet** (Ethereum)  
- **arbitrum**
- **optimism**
- **polygon**
- **bsc** 
- **avalanche**
- **blast**
- **degen**
- **zora**
- **kaia**
- **cyber**
- **apeChain**
- **shibarium**
- **unichain**

Each chain is configured with multiple fallback RPC endpoints for reliability.

## Contract Addresses

The CLI uses the official Mint Club V2 contracts:

- **Bond Contract**: `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` (most chains)
- **ZapV2 Contract**: `0x7d999874eAe10f170C4813270173363468A559cD` (Base only)

Some chains use different addresses - see `src/config/contracts.ts` for the full mapping.

## Command Reference

### Global Options

- `--chain <chain>` - Specify blockchain (default: base)

### Commands

#### `info <token>`
Get token information including bonding curve details and current pricing.

#### `buy <token> --amount <tokens>`
- `--amount <tokens>` - Number of tokens to purchase
- `--max-cost <amount>` - Maximum cost in reserve tokens (optional)

#### `sell <token> --amount <tokens>`  
- `--amount <tokens>` - Number of tokens to sell
- `--min-refund <amount>` - Minimum refund in reserve tokens (optional)

#### `create`
- `--name <name>` - Token name
- `--symbol <symbol>` - Token symbol  
- `--reserve <address>` - Reserve token contract address
- `--max-supply <amount>` - Maximum token supply
- `--steps <steps>` - Bonding curve steps (format: "range1:price1,range2:price2")
- `--mint-royalty <bp>` - Mint royalty in basis points (default: 0)
- `--burn-royalty <bp>` - Burn royalty in basis points (default: 0)

#### `zap-buy <token>` (Base only)
- `--input-token <address>` - Input token address (use 0x0 for ETH)
- `--input-amount <amount>` - Amount of input tokens
- `--path <path>` - Uniswap V3 swap path  
- `--min-tokens <amount>` - Minimum tokens to receive (optional)

#### `zap-sell <token>` (Base only)
- `--amount <tokens>` - Number of tokens to sell
- `--output-token <address>` - Output token address (use 0x0 for ETH)
- `--path <path>` - Uniswap V3 swap path
- `--min-output <amount>` - Minimum output to receive (optional)

## Examples

Check the SIGNET token on Base:
```bash
bun src/index.ts info 0xDF2B673Ec06d210C8A8Be89441F8de60B5C679c9 --chain base
```

Buy 10 SIGNET tokens:
```bash
bun src/index.ts buy 0xDF2B673Ec06d210C8A8Be89441F8de60B5C679c9 --amount 10 --chain base
```

## Development

```bash
# Install dependencies
bun install

# Type check
bun run check

# Build
bun run build

# Run directly
bun src/index.ts --help
```

## Architecture

- **TypeScript** - Full type safety
- **Viem** - Ethereum interactions
- **Bun** - Fast runtime and package manager  
- **Commander.js** - CLI argument parsing
- **Fallback RPCs** - Multiple RPC endpoints per chain for reliability

## License

MIT