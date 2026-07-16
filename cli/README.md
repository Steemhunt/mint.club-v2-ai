# Mint Club V2 CLI

A command-line client for protocol-native [Mint Club V2](https://mint.club) operations and bounded local Uniswap routing across 11 mainnets plus Sepolia.

The CLI calls the official contracts directly:

- `MCV2_Bond.mint` / `burn` for reserve-token trades
- `MCV2_ZapV2.zapMint` / `zapBurn` for routed exact-input trades
- `MCV2_Bond.createToken` for token creation

It does **not** provide a general-purpose DEX swap command or use an external routing API.

## Install

```bash
npm install -g mint.club-cli
mc --help
```

## Wallet setup

```bash
mc wallet --generate
# or
mc wallet --set-private-key 0xYOUR_PRIVATE_KEY
```

The key is stored in `~/.mintclub/.env` with file mode `0600`; the directory is locked to `0700`. You can instead export `PRIVATE_KEY`.

> Never commit or share a private key. Use a dedicated wallet with limited funds.

## Chain selection

Base is the default. Put the global chain option before the command:

```bash
mc --chain base info SIGNET
mc --chain arbitrum info 0xTOKEN
mc --chain robinhood wallet
```

| Chain | CLI key | Chain ID | Known symbols |
|---|---|---:|---|
| Ethereum | `ethereum` | 1 | `ETH`, `WETH`, `USDC`, `USDT`, `DAI` |
| Optimism | `optimism` | 10 | `ETH`, `WETH`, `USDT` |
| Arbitrum One | `arbitrum` | 42161 | `ETH`, `WETH`, `USDT` |
| Avalanche C-Chain | `avalanche` | 43114 | `AVAX`, `WAVAX`, `USDT` |
| Base | `base` | 8453 | `ETH`, `WETH`, `USDC`, `HUNT`, `MT` |
| Polygon PoS | `polygon` | 137 | `POL`, `WPOL`, `USDT` |
| BNB Smart Chain | `bsc` | 56 | `BNB`, `WBNB`, `USDT` |
| Blast | `blast` | 81457 | `ETH`, `WETH`, `USDB` |
| Zora | `zora` | 7777777 | `ETH`, `WETH` |
| Unichain | `unichain` | 130 | `ETH`, `WETH`, `USDC` |
| Robinhood Chain | `robinhood` | 4663 | `ETH`, `WETH`, `USDG` |
| Sepolia | `sepolia` | 11155111 | `ETH`, `WETH` |

`NATIVE` resolves to the selected chain's native currency. Any ERC-20 or Mint Club token can also be supplied by contract address. Created and used Mint Club token addresses are tracked per chain in `~/.mintclub/tokens.json`.

The published [`chain-registry.json`](./chain-registry.json) is consumed by the CLI, MCP server, and Eliza plugin. The CLI validates its IDs and capability flags against the full runtime configuration at startup.

### RPC overrides

Each chain has public fallback RPC URLs. Override the first RPC without editing source:

```bash
export MINTCLUB_RPC_ARBITRUM=https://your-rpc.example
export MINTCLUB_RPC_ROBINHOOD=https://your-rpc.example
```

The variable format is `MINTCLUB_RPC_<UPPERCASE_CLI_KEY>`.

## Read operations

```bash
mc --chain base info SIGNET
mc --chain ethereum price 0xTOKEN
mc --chain robinhood wallet
```

USD pricing uses chain-specific DefiLlama feeds where available. This is independent of routing; route quotes use RPC calls only.

## Bond mint and burn

Use these commands when paying or receiving the token's configured reserve ERC-20.

```bash
# Mint an exact Mint Club token amount
mc --chain base buy SIGNET --amount 100
mc --chain arbitrum buy 0xTOKEN --amount 100 --max-cost 25

# Burn an exact Mint Club token amount
mc --chain base sell SIGNET --amount 100
mc --chain arbitrum sell 0xTOKEN --amount 100 --min-refund 20
```

`--max-cost` and `--min-refund` are denominated in the reserve token and respect its on-chain decimals. If omitted, the current quote is used as the exact on-chain limit; provide an explicit limit to tolerate price movement before inclusion.

## ZapV2 routed mint and burn

### Mint from an exact input amount

```bash
mc --chain arbitrum zap-buy 0xMINT_CLUB_TOKEN \
  --input-token USDT \
  --input-amount 10 \
  --slippage 1

mc --chain base zap-buy SIGNET \
  --input-token 0xARBITRARY_ERC20 \
  --input-amount 250 \
  --min-tokens 100 \
  --slippage 0.5
```

`--input-amount` is exact. If `--min-tokens` is omitted, the CLI performs a read-only `zapMint` preview with zero token minimum, applies the requested slippage to the preview result, and simulates the final protected call before sending.

Native input is supported with `--input-token NATIVE` (or the native symbol such as `ETH`, `AVAX`, `POL`, or `BNB`). ERC-20 input is approved to ZapV2 only after an executable route has been found.

### Burn an exact Mint Club token amount

```bash
mc --chain unichain zap-sell 0xMINT_CLUB_TOKEN \
  --amount 100 \
  --output-token USDC \
  --slippage 1

mc --chain robinhood zap-sell 0xMINT_CLUB_TOKEN \
  --amount 100 \
  --output-token NATIVE \
  --min-output 0.02
```

`--amount` is the exact Mint Club token amount to burn. If `--min-output` is omitted, the selected route quote is reduced by the requested slippage. When the reserve token already equals the requested output token, no router command is emitted and the exact burn refund becomes the default minimum.

### Deployment status

**Every `MCV2_ZapV2` address is currently `null`.** Zap commands fail closed before wallet setup, approvals, or transaction construction. Add only an official deployed address to `src/config/chains.ts` and set the matching `zapV2Configured` flag in `chain-registry.json`; startup validation rejects one-sided updates. Do not guess an address. Bond operations, route quoting, and command encoding remain testable without a Zap deployment.

## Local route discovery

The route engine:

1. Enumerates a direct path and paths through at most one configured wrapped-native or stablecoin intermediary.
2. Quotes homogeneous Uniswap V2, V3, and V4 paths by RPC.
3. Computes V2 output from factory/pair reserves, calls Quoter/QuoterV2 for V3, and calls V4Quoter for V4.
4. Ignores expected missing-pool reverts independently, but surfaces RPC/transport failures.
5. Chooses the greatest exact-input output; ties prefer fewer hops and then `V2 → V3 → V4` deterministically.
6. Uses `@uniswap/universal-router-sdk` only to encode the selected route.

Universal Router encoding is pinned to V2.0 command semantics, uses router-held input (`payerIsUser = false`), sends swap output to ZapV2, and rejects Permit2 ingress commands.

Deliberate limits:

- no split routes;
- no mixed-protocol path;
- no path longer than one intermediary;
- no arbitrary liquidity-graph search;
- no V4 hooks or dynamic-fee pools;
- V4 discovery checks hookless `(fee, tick spacing)` pairs `(100,1)`, `(500,10)`, `(3000,60)`, and `(10000,200)` only.

The selected result is the best **among enumerated candidates**, not a claim of global optimality.

## Create a token

```bash
mc --chain robinhood create \
  --name "My Token" \
  --symbol MYT \
  --reserve USDG \
  --max-supply 1000000 \
  --curve exponential \
  --initial-price 0.01 \
  --final-price 10
```

Curve presets: `linear`, `exponential`, `logarithmic`, and `flat`.

For a custom curve:

```bash
mc --chain base create \
  --name "My Token" \
  --symbol MYT \
  --reserve USDC \
  --max-supply 1000000 \
  --steps "100000:0.01,500000:0.05,1000000:0.1"
```

Prices are encoded using the reserve token's actual decimals. Non-flat presets require the final price to exceed the initial price and automatically reduce the nominal 500 steps when reserve precision cannot represent 500 strictly increasing prices.

## Transfer and balances

```bash
mc --chain avalanche send 0xRECIPIENT --amount 0.01
mc --chain robinhood send 0xRECIPIENT --amount 100 --token USDG
mc --chain polygon wallet
```

## Mint Club contract configuration

| Chain(s) | MCV2 Bond | ERC-20 implementation | MCV2 ZapV2 |
|---|---|---|---|
| Ethereum, Optimism, Arbitrum, Base, Polygon, BSC, Zora, Unichain | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | not configured |
| Avalanche | `0x3Fd5B4DcDa968C8e22898523f5343177F94ccfd1` | `0x5DaE94e149CF2112Ec625D46670047814aA9aC2a` | not configured |
| Blast | `0x621c335b4BD8f2165E120DC70d3AfcAfc6628681` | `0x1349A9DdEe26Fe16D0D44E35B3CB9B0CA18213a4` | not configured |
| Robinhood Chain | `0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa` | `0xEb54dACB4C2ccb64F8074eceEa33b5eBb38E5387` | not configured |
| Sepolia | `0x8dce343A86Aa950d539eeE0e166AFfd0Ef515C0c` | `0x749bA94344521727f55a3007c777FbeB5F52C2Eb` | not configured |

Uniswap factory/quoter addresses and intermediary tokens are kept in `src/config/chains.ts` and capability summaries in `chain-registry.json`.

## Development

From the repository root:

```bash
npm ci
npm run check --workspace mint.club-cli
npm test --workspace mint.club-cli
npm run build --workspace mint.club-cli
```

The default suite includes unit tests and read-only Base/Robinhood deployment checks. Optional Anvil write tests exercise direct Bond operations when Anvil is installed. Mainnet transactions are never part of automated verification.

## License

MIT
