# Mint Club V2 CLI

A command-line client for protocol-native [Mint Club V2](https://mint.club) operations and bounded local Uniswap routing across ten mainnets and two testnets.

[npm package](https://www.npmjs.com/package/@mint.club/v2-cli) · [repository](https://github.com/Steemhunt/mint.club-v2-ai) · [MCP server](../mcp) · [ElizaOS plugin](../eliza-plugin)

The CLI calls the official contracts directly:

- `MCV2_Bond.mint` / `burn` for reserve-token trades
- `MCV2_ZapV2.zapMint` / `zapBurn` for routed exact-input trades
- `MCV2_Bond.createToken` for ERC-20 token creation

It does **not** provide a general-purpose DEX swap command or use an external routing API.

## Install

```bash
npm install -g @mint.club/v2-cli
mc --help
```

Requires Node.js 18 or later. The installed executable is `mc`.

## Wallet setup

```bash
mc wallet --generate
```

Generated keys are stored in `~/.mintclub/.env` with file mode `0600`; the directory is locked to `0700`. To use an existing key, provide `PRIVATE_KEY` through a trusted secret manager or place it in that file yourself with the same permissions. The CLI also loads `.env` from the current directory.

> Never put a private key in a command argument, commit it, or paste it into an agent conversation. Use a dedicated wallet with limited funds.

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
| Zora | `zora` | 7777777 | `ETH`, `WETH` |
| Unichain | `unichain` | 130 | `ETH`, `WETH`, `USDC` |
| Robinhood Chain | `robinhood` | 4663 | `ETH`, `WETH`, `USDG` |
| Sepolia | `sepolia` | 11155111 | `ETH`, `WETH` |
| Base Sepolia | `base-sepolia` | 84532 | `ETH`, `WETH` |

`NATIVE` resolves to the selected chain's native currency. Any ERC-20 or Mint Club token can also be supplied by contract address. Created and successfully transacted Mint Club token addresses are tracked per chain in `~/.mintclub/tokens.json`.

The published [`chain-registry.json`](./chain-registry.json) is consumed by the CLI, MCP server, and Eliza plugin. The CLI validates its IDs and capability flags against the full runtime configuration at startup.

### RPC overrides

Each chain has public fallback RPC URLs. Override the first RPC without editing source:

```bash
export MINTCLUB_RPC_ARBITRUM=https://your-rpc.example
export MINTCLUB_RPC_ROBINHOOD=https://your-rpc.example
export MINTCLUB_RPC_BASE_SEPOLIA=https://your-rpc.example
```

The variable format is `MINTCLUB_RPC_<UPPERCASE_CLI_KEY>`, with non-alphanumeric separators replaced by underscores (`base-sepolia` becomes `BASE_SEPOLIA`).

## Wallet and private-key safety

The CLI writes generated keys with file mode `0600`. Never commit `~/.mintclub/.env`, paste a funded key into an agent conversation, or place a key directly in a command argument.

### Migrating from `wallet --set-private-key <key>`

The argv-based import option was removed because shells and process inspectors can retain its value. For automation, inject `PRIVATE_KEY` from your secret manager into the `mc` process environment. To migrate an existing key into the CLI wallet file without putting it in argv or shell history, use a hidden Bash prompt:

```bash
mkdir -p ~/.mintclub
umask 077
read -rsp 'Private key: ' PRIVATE_KEY; printf '\n'
printf 'PRIVATE_KEY=%s\n' "$PRIVATE_KEY" > ~/.mintclub/.env
unset PRIVATE_KEY
chmod 600 ~/.mintclub/.env
```

Do not replace `<key>` inline in any command. Existing scripts should read from a protected file descriptor or secret manager, export `PRIVATE_KEY` only for the child process, and unset it immediately afterward.

## Read operations

```bash
mc --chain base info SIGNET
mc --chain ethereum price 0xTOKEN
mc --chain robinhood wallet
```

USD pricing uses chain-specific DefiLlama feeds where available. This is independent of routing; route quotes use RPC calls only.

## Confirm write operations

`buy`, `sell`, `zap-buy`, `zap-sell`, and `send` refuse to broadcast unless `--yes` is present. Review the chain, assets, exact amounts, and max/min limits before adding it. `create` keeps an interactive confirmation prompt; use `--yes` only after reviewing the complete curve and royalty summary or from an already-confirmed non-interactive adapter.

## Bond mint and burn

Use these commands when paying or receiving the token's configured reserve ERC-20.

```bash
# Mint an exact Mint Club token amount
mc --chain base buy SIGNET --amount 100 --yes
mc --chain arbitrum buy 0xTOKEN --amount 100 --max-cost 25 --yes

# Burn an exact Mint Club token amount
mc --chain base sell SIGNET --amount 100 --yes
mc --chain arbitrum sell 0xTOKEN --amount 100 --min-refund 20 --yes
```

`--max-cost` and `--min-refund` are denominated in the reserve token and respect its on-chain decimals. If omitted, the current quote is used as the exact on-chain limit; provide an explicit limit to tolerate price movement before inclusion.

The Mint Club token may use the ERC-20 or ERC-1155 implementation. ERC-1155 Mint Club tokens have zero decimals, so their `--amount` must be a whole number.

## ZapV2 routed mint and burn

### Mint from an exact input amount

```bash
mc --chain arbitrum zap-buy 0xMINT_CLUB_TOKEN \
  --input-token USDT \
  --input-amount 10 \
  --slippage 1 \
  --yes

mc --chain base zap-buy SIGNET \
  --input-token 0xARBITRARY_ERC20 \
  --input-amount 250 \
  --min-tokens 100 \
  --slippage 0.5 \
  --yes
```

`--input-amount` is exact. If `--min-tokens` is omitted, the CLI performs a read-only `zapMint` preview with zero token minimum, applies the requested slippage to the preview result, and simulates the final protected call before sending.

Native input is supported with `--input-token NATIVE` (or the native symbol such as `ETH`, `AVAX`, `POL`, or `BNB`). Routed input assets must be native currency or ERC-20 tokens; the Mint Club token being minted may be ERC-20 or ERC-1155. ERC-20 input is approved to ZapV2 only after an executable route has been found.

### Burn an exact Mint Club token amount

```bash
mc --chain unichain zap-sell 0xMINT_CLUB_TOKEN \
  --amount 100 \
  --output-token USDC \
  --slippage 1 \
  --yes

mc --chain robinhood zap-sell 0xMINT_CLUB_TOKEN \
  --amount 100 \
  --output-token NATIVE \
  --min-output 0.02 \
  --yes
```

`--amount` is the exact Mint Club token amount to burn. The target may be an ERC-20 or ERC-1155 Mint Club token; use whole-number amounts for ERC-1155. The routed output must be native currency or an ERC-20 token. If `--min-output` is omitted, the selected route quote is reduced by the requested slippage. When the reserve token already equals the requested output token, no router command is emitted and the exact burn refund becomes the default minimum.

### Deployment status

`MCV2_ZapV2` is deployed on all supported chains in this document. Blast is intentionally unsupported by this integration.

## Local route discovery

The route engine:

1. Enumerates a direct path and paths through at most one configured wrapped-native or stablecoin intermediary.
2. Quotes homogeneous Uniswap V2, V3, and V4 paths by RPC where configured for the selected chain.
3. Computes V2 output from factory/pair reserves, calls Quoter/QuoterV2 for V3, and calls V4Quoter for V4.
4. Ignores expected missing-pool reverts independently, but surfaces RPC/transport failures.
5. Chooses the greatest exact-input output; ties prefer fewer hops and then `V2 → V3 → V4` deterministically.
6. Uses `@uniswap/universal-router-sdk` only to encode the selected route.

Universal Router encoding is pinned to V2.0 command semantics, uses router-held input (`payerIsUser = false`), sends swap output to ZapV2, rejects Permit2 ingress commands, and settles unused routed input directly back to the caller. Native V2/V3 refunds are unwrapped before delivery.

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

`create` deploys the configured ERC-20 implementation. Mint and burn royalties default to 100 basis points (1%) each; set them explicitly with `--mint-royalty` and `--burn-royalty` when different values are intended.

## Transfer and balances

```bash
mc --chain avalanche send 0xRECIPIENT --amount 0.01 --yes
mc --chain robinhood send 0xRECIPIENT --amount 100 --token USDG --yes
mc --chain base send 0xRECIPIENT --amount 3 \
  --token 0xERC1155_CONTRACT \
  --token-id 0 \
  --yes
mc --chain polygon wallet
```

Native and ERC-20 amounts use their token decimals. ERC-1155 `--amount` is an integer quantity and requires both the contract address and `--token-id`.

## Mint Club contract configuration

| Chain | MCV2 Bond | ERC-20 implementation | MCV2 ZapV2 |
|---|---|---|---|
| Ethereum | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | `0xf7e2cDe9E603F15118E6E389cF14f11f19C1afbc` |
| Optimism | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | `0x7B09b728ee8c6a714dC3F10367b5DF9b217FE633` |
| Arbitrum One | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | `0x3a8a4BFCC487d0FE9D342B6180bf0323989f251B` |
| Avalanche C-Chain | `0x3Fd5B4DcDa968C8e22898523f5343177F94ccfd1` | `0x5DaE94e149CF2112Ec625D46670047814aA9aC2a` | `0xD0586d5F4ae18650340fFc6f3b1307AB2Ca334f4` |
| Base | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | `0x96282046C0e19F727a92728198c0Dc4E260Ebe0b` |
| Polygon PoS | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | `0x664f626516c82772F0F492Ff64f6FA826C86F5e1` |
| BNB Smart Chain | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | `0x68f54a53d3E69e2191bCF586fB507c81E5353413` |
| Zora | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | `0x5b64cECC5cF3E4B1A668Abd895D16BdDC0c77a17` |
| Unichain | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` | `0x06FD26c092Db44E5491abB7cDC580CE24D93030c` |
| Robinhood Chain | `0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa` | `0xEb54dACB4C2ccb64F8074eceEa33b5eBb38E5387` | `0x621c335b4BD8f2165E120DC70d3AfcAfc6628681` |
| Sepolia | `0x8dce343A86Aa950d539eeE0e166AFfd0Ef515C0c` | `0x749bA94344521727f55a3007c777FbeB5F52C2Eb` | `0x69c94AF858FeCA41f97ff7888e3B5104b95D66D9` |
| Base Sepolia | `0x5dfA75b0185efBaEF286E80B847ce84ff8a62C2d` | `0x37F540de37afE8bDf6C722d87CB019F30e5E406a` | `0x60432191893c4F742205a2C834817a1891feC435` |

Uniswap factory/quoter addresses and intermediary tokens are kept in `src/config/chains.ts` and capability summaries in `chain-registry.json`.

## Development

From the repository root:

```bash
npm ci
npm run check
npm test
npm run test:integration
npm run test:fork
npm run build
```

The default suite runs without external RPC dependencies. `npm run test:integration` runs the gated, read-only deployment and immutable checks on all supported networks.

`npm run test:fork` is an explicit, deterministic Base fork suite pinned to block `48,705,797`. It exercises direct Bond writes plus ZapV2 native/WETH, ERC-20, ERC-1155, routed buy/sell, and refund-sweep flows without changing live chain state.

The fork suite requires Anvil. It resolves `ANVIL_PATH` first and then `anvil` from `PATH`; an explicit run fails if neither is available. Override the public Base RPC when needed:

```bash
BASE_FORK_RPC_URL=https://your-archive-base-rpc.example npm run test:fork
```

## License

MIT
