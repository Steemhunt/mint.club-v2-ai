---
name: mintclub
description: "Operate Mint Club V2 with the mc CLI: inspect tokens and balances, mint or burn ERC-20/1155 bonding-curve tokens, route exact-input ZapV2 trades, transfer assets, and create ERC-20 curves across supported chains. Use for Mint Club terminal workflows that need protocol-native transactions or local Uniswap route discovery."
---

# Mint Club V2

Use the `mc` CLI for Mint Club V2 Bond operations and bounded local Uniswap ZapV2 routing. Treat the CLI output and the published chain registry as authoritative.

## Setup

```bash
npm install -g @mint.club/v2-cli
mc --help
```

Require Node.js 18 or later. Ask the user to configure `PRIVATE_KEY` themselves outside the agent, following the CLI wallet setup. Do not run or construct a wallet import command. Never request, print, log, or pass a private key through agent/tool arguments. Recommend a dedicated wallet with limited funds.

## Chain selection

Base is the default. Put the global chain option before the command:

```bash
mc --chain base info SIGNET
mc --chain arbitrum info 0xTOKEN
mc --chain base-sepolia wallet
```

Canonical chain values:

`ethereum`, `optimism`, `arbitrum`, `avalanche`, `base`, `polygon`, `bsc`, `zora`, `unichain`, `robinhood`, `sepolia`, `base-sepolia`.

Aliases and capabilities come from `@mint.club/v2-cli/chain-registry.json`. Blast is unsupported by this integration.

## Read operations

```bash
mc --chain base info <token>
mc --chain arbitrum price <token>
mc --chain polygon wallet
```

USD pricing uses chain-specific DefiLlama feeds where available. This is separate from RPC-only route discovery.

## Write confirmation

Never append `--yes` merely because the user requested a write earlier in the conversation. First present the complete chain, assets, exact amounts, limits/slippage, recipient or curve/royalties, and the exact command without executing it. Only after the user explicitly confirms those details may you run the command with `--yes`. A changed amount, chain, asset, recipient, limit, or curve invalidates the prior confirmation.

## Bond mint and burn

Use direct Bond operations when the user wants the token's configured reserve ERC-20:

```bash
mc --chain base buy <token> --amount 100 --max-cost 25 --yes
mc --chain base sell <token> --amount 100 --min-refund 20 --yes
```

Treat `amount` as the exact Mint Club token amount. Treat `max-cost` and `min-refund` as reserve-token amounts. If a limit is omitted, explain that the CLI uses the current quote as the exact on-chain limit. Use whole-number amounts for ERC-1155 Mint Club tokens.

## ZapV2 routed mint

Use an exact input amount and name the input asset explicitly:

```bash
mc --chain arbitrum zap-buy <mint-club-token> \
  --input-token USDT \
  --input-amount 10 \
  --slippage 1 \
  --yes

mc --chain base zap-buy <mint-club-token> \
  --input-token 0xERC20 \
  --input-amount 250 \
  --min-tokens 100 \
  --slippage 0.5 \
  --yes
```

Use `NATIVE` for the selected chain's native currency. Require the routed input to be native currency or ERC-20; allow the Mint Club target to be ERC-20 or ERC-1155. Never reinterpret “Buy 10 TOKEN with ETH” as a ZapV2 request: ask for the exact ETH input in the unambiguous form “Buy TOKEN with 0.1 ETH.”

If `min-tokens` is omitted, explain that the CLI previews `zapMint`, applies the requested slippage, and simulates the protected call. Treat omitted `slippage` as 1%.

## ZapV2 routed burn

```bash
mc --chain unichain zap-sell <mint-club-token> \
  --amount 100 \
  --output-token USDC \
  --slippage 1 \
  --yes

mc --chain robinhood zap-sell <mint-club-token> \
  --amount 100 \
  --output-token NATIVE \
  --min-output 0.02 \
  --yes
```

Treat `amount` as the exact Mint Club token burn amount and `min-output` as an output-asset amount. Require the routed output to be native currency or ERC-20. Use whole-number burn amounts for ERC-1155 Mint Club tokens.

If `min-output` is omitted, explain that the CLI applies slippage to the selected route quote. Treat omitted `slippage` as 1%; for a direct reserve output, use the exact burn refund as the default minimum.

## Routing limits

The CLI uses RPC-only quotes and selects the highest output among enumerated candidates:

- direct path or one wrapped-native/stablecoin intermediary;
- homogeneous Uniswap V2, V3, or V4 path where configured;
- hookless canonical V4 fee/tick-spacing pairs only.

It does not use an external routing API and does not support split, mixed-protocol, arbitrary-length, dynamic-fee, or hooked V4 paths. Describe the result as “best among enumerated candidates,” not globally optimal.

Universal Router encoding uses router-held input (`payerIsUser = false`) and ZapV2 as the output recipient.

## Create a token

```bash
mc --chain robinhood create \
  --name "My Token" \
  --symbol MYT \
  --reserve USDG \
  --max-supply 1000000 \
  --curve exponential \
  --initial-price 0.01 \
  --final-price 10 \
  --mint-royalty 100 \
  --burn-royalty 100 \
  --yes
```

Use `linear`, `exponential`, `logarithmic`, or `flat`. Treat royalty values as basis points. State that omitted royalties default to 100 basis points (1%) each, and confirm any different values before creating the ERC-20 token.

## Transfer

```bash
mc --chain avalanche send <address> --amount 0.01 --yes
mc --chain robinhood send <address> --amount 100 --token USDG --yes
mc --chain base send <address> --amount 3 --token <erc1155> --token-id 0 --yes
```

Require an integer `amount`, contract address, and `token-id` for ERC-1155 transfers.

## Safety

- Before a trade or transfer, state the chain, token, exact amount, input/output asset, and max/min limit.
- Add `--yes` only after explicit confirmation of those exact details; never reuse confirmation after any field changes.
- Before token creation, state the chain, implementation type, reserve, maximum supply, curve range, and both royalties.
- Use `info` or `price` first when the token or reserve is unclear.
- Never print or expose `PRIVATE_KEY`.
- Do not invent a route or a general-purpose `swap` command.
- Distinguish “best among bounded candidates” from global optimization.
- Token addresses are tracked per chain in `~/.mintclub/tokens.json`.
