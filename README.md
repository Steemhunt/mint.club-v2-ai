<p align="center">
  <img src="https://mint.club/logo.png" alt="Mint Club" width="80" />
</p>

<h1 align="center">Mint Club V2 — AI Tools</h1>

<p align="center">
  Trade, create, and manage <a href="https://github.com/Steemhunt/mint.club-v2-contract#design-choices-">bonding curve tokens</a> across supported Uniswap chains — from the terminal, AI assistants, or autonomous agents.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mint.club/v2-cli"><img src="https://badgen.net/npm/v/@mint.club/v2-cli?label=CLI&color=0ea5e9" alt="CLI npm" /></a>
  <a href="https://www.npmjs.com/package/@mint.club/v2-cli"><img src="https://badgen.net/npm/dm/@mint.club/v2-cli?label=downloads&color=14b8a6" alt="CLI downloads" /></a>
  <a href="https://packagephobia.com/result?p=%40mint.club%2Fv2-cli"><img src="https://badgen.net/packagephobia/install/@mint.club/v2-cli?color=8b5cf6" alt="CLI install size" /></a>
  <br />
  <a href="https://www.npmjs.com/package/@mint.club/v2-mcp"><img src="https://badgen.net/npm/v/@mint.club/v2-mcp?label=MCP&color=0ea5e9" alt="MCP npm" /></a>
  <a href="https://www.npmjs.com/package/@mint.club/v2-mcp"><img src="https://badgen.net/npm/dm/@mint.club/v2-mcp?label=downloads&color=14b8a6" alt="MCP downloads" /></a>
  <a href="https://packagephobia.com/result?p=%40mint.club%2Fv2-mcp"><img src="https://badgen.net/packagephobia/install/@mint.club/v2-mcp?color=8b5cf6" alt="MCP install size" /></a>
  <br />
  <a href="https://www.npmjs.com/package/@mint.club/v2-eliza-plugin"><img src="https://badgen.net/npm/v/@mint.club/v2-eliza-plugin?label=Eliza&color=0ea5e9" alt="Eliza plugin npm" /></a>
  <a href="https://www.npmjs.com/package/@mint.club/v2-eliza-plugin"><img src="https://badgen.net/npm/dm/@mint.club/v2-eliza-plugin?label=downloads&color=14b8a6" alt="Eliza plugin downloads" /></a>
  <br />
  <a href="https://github.com/Steemhunt/mint.club-v2-ai"><img src="https://badgen.net/github/stars/Steemhunt/mint.club-v2-ai?icon=github&label=stars&color=3b82f6" alt="GitHub stars" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://badgen.net/badge/license/MIT/3b82f6" alt="MIT" /></a>
</p>

---

Protocol-native [Mint Club V2](https://mint.club) tooling for humans and agents. Reads and direct Bond operations use the configured Mint Club contracts; routed trades use local RPC quotes and `MCV2_ZapV2`.

## Tooling

| Package | Purpose |
|---|---|
| [`@mint.club/v2-cli`](./cli) | Direct CLI for Bond, bounded local Uniswap routing, ZapV2, token creation, transfers, prices, and balances |
| [`@mint.club/v2-mcp`](./mcp) | MCP tools backed by the CLI |
| [`@mint.club/v2-eliza-plugin`](./eliza-plugin) | ElizaOS actions backed by the CLI |
| [`SKILL.md`](./SKILL.md) | Agent instructions for using `mc` safely |

All three adapters consume the published [`chain-registry.json`](./cli/chain-registry.json) from `@mint.club/v2-cli`. The registry is the shared source for chain keys, aliases, IDs, and capability flags; the CLI validates it against its full contract/token/RPC configuration at startup.

For application development, use the separate [`@mint.club/v2-sdk`](https://www.npmjs.com/package/@mint.club/v2-sdk) package and [SDK documentation](https://sdk.mint.club).

## Package migration

Version 2.0 consolidates the public packages under the `@mint.club` npm organization:

| Previous package | 2.0 package |
|---|---|
| `mint.club-v2-sdk` | `@mint.club/v2-sdk` |
| `mint.club-cli` | `@mint.club/v2-cli` |
| `mintclub-mcp` | `@mint.club/v2-mcp` |

The scoped names supersede the legacy SDK, CLI, and MCP package names. Existing users should migrate their install and configuration commands; package binaries remain `mc` and `mintclub-mcp`. `@mint.club/v2-eliza-plugin` is new—the earlier `@elizaos/plugin-mintclub` name was never published.

## Quick start

```bash
npm install -g @mint.club/v2-cli
mc wallet --generate

mc --chain base info SIGNET
mc --chain arbitrum price 0xTOKEN
mc --chain robinhood wallet
```

Requires Node.js 18 or later. Generate a dedicated wallet with limited funds, or provide `PRIVATE_KEY` through a trusted secret manager; never paste a key into an agent conversation.

Financial writes are fail-closed: CLI writes require `--yes` (while `create` keeps its interactive prompt), MCP write tools require `confirm: true`, and Eliza writes require one affirmative original-user `Confirm:` statement with exactly one explicit chain and all effective limits, slippage, assets, and royalties.

## Protocol operations

| Operation | Contract path |
|---|---|
| Buy with the configured reserve ERC-20 | `MCV2_Bond.mint` |
| Sell for the configured reserve ERC-20 | `MCV2_Bond.burn` |
| Buy from a routed native/ERC-20 asset | local Uniswap quote + `MCV2_ZapV2.zapMint` |
| Sell into a routed native/ERC-20 asset | `MCV2_ZapV2.zapBurn` + local Uniswap quote |
| Create an ERC-20 bonding curve token | `MCV2_Bond.createToken` |

Example ZapV2 syntax:

```bash
mc --chain arbitrum zap-buy 0xMINT_CLUB_TOKEN \
  --input-token USDT \
  --input-amount 10 \
  --slippage 1 \
  --yes

mc --chain unichain zap-sell 0xMINT_CLUB_TOKEN \
  --amount 100 \
  --output-token USDC \
  --slippage 1 \
  --yes
```

Both ERC-20 and ERC-1155 Mint Club tokens can be direct Bond or Zap targets. Routed input and output assets must be native currency or ERC-20 tokens. ZapV2 is deployed on every supported chain listed below. Blast is intentionally unsupported because it is outside the official Uniswap deployment set used by this integration.

## Local routing model

Routing does not call the Uniswap Trading API, Smart Order Router, Mint Club route services, or any API-key quote service. It uses chain RPC calls only:

1. Enumerate direct paths and paths with one configured wrapped-native or stablecoin intermediary.
2. Quote homogeneous Uniswap V2, V3, and V4 candidates where configured for the selected chain.
3. Isolate expected missing-pool reverts while surfacing transport failures.
4. Choose the highest exact-input output with deterministic tie-breaking.
5. Encode only the selected path with `@uniswap/universal-router-sdk`.

The encoder uses Universal Router V2.0 commands with router-balance payment (`payerIsUser = false`) and the ZapV2 contract as recipient. It rejects Permit2 ingress commands and settles any unused routed input directly back to the caller.

Deliberate limits: no split routes, mixed-protocol paths, arbitrary-length graph search, dynamic-fee V4 pools, or hooked V4 pools. V4 discovery checks only canonical hookless fee/tick-spacing pairs. This repository does not expose a general-purpose swap command.

## MCP tools

The MCP server exposes nine tools:

`token_info` · `token_price` · `wallet_balance` · `buy_token` · `sell_token` · `zap_buy` · `zap_sell` · `send_token` · `create_token`

Every tool accepts an optional canonical `chain` key from the table below. Base is the default. See the [MCP reference](./mcp/README.md) for schemas and safe client configuration.

## Architecture

```text
AI agent / user
      │
      ├── mc CLI
      ├── MCP server ────── argv ──┐
      ├── ElizaOS plugin ── argv ──┤
      └── Agent skill ─────────────┤
                                   ▼
                          @mint.club/v2-cli
                                   │
                  ┌────────────────┼─────────────────┐
                  ▼                ▼                 ▼
             MCV2_Bond        local RPC quotes   DefiLlama API
            mint/burn/create   V2 / V3 / V4       USD pricing
                                   │
                                   ▼
                        Universal Router encoding
                                   │
                                   ▼
                              MCV2_ZapV2
```

MCP and Eliza invoke the CLI with argument arrays rather than shell-interpolated commands.

## Supported chains

| Chain | CLI key | Chain ID |
|---|---|---:|
| Ethereum | `ethereum` | 1 |
| Optimism | `optimism` | 10 |
| Arbitrum One | `arbitrum` | 42161 |
| Avalanche C-Chain | `avalanche` | 43114 |
| Base | `base` | 8453 |
| Polygon PoS | `polygon` | 137 |
| BNB Smart Chain | `bsc` | 56 |
| Zora | `zora` | 7777777 |
| Unichain | `unichain` | 130 |
| Robinhood Chain | `robinhood` | 4663 |
| Sepolia | `sepolia` | 11155111 |
| Base Sepolia | `base-sepolia` | 84532 |

See the [CLI reference](./cli/README.md) for command options, routing details, and contract configuration.

## Development

The three publishable packages share one npm workspace lockfile:

```bash
npm ci
npm run check
npm test
npm run test:integration
npm run test:fork
npm run build
npm run audit:production
npm run audit:full
npm run test:release
```

The default tests are deterministic and offline. `test:integration` performs read-only deployment and immutable checks across all supported networks plus live route quotes where a stable intermediary is configured. `test:fork` runs write flows against a pinned local Base fork and requires Anvil.

For registry releases, publish the CLI first so the other packages can resolve their `^2.0.0` runtime dependency and registry subpath:

```bash
npm publish --workspace cli
npm publish --workspace mcp
npm publish --workspace eliza-plugin
```

## License

MIT. Published packages include the project `LICENSE`; the bundled CLI also includes generated `THIRD_PARTY_NOTICES.md`. See [SECURITY.md](./SECURITY.md) for the dependency audit policy.
