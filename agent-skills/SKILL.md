# Mint Club V2 — Agent Skill

Use the `mc` CLI for protocol-native Mint Club V2 Bond operations and bounded local Uniswap ZapV2 routing.

## Setup

```bash
npm install -g mint.club-cli
mc wallet --set-private-key 0x...
# or export PRIVATE_KEY=0x...
```

## Chain selection

Base is the default. Put the global chain option before the command:

```bash
mc --chain base info SIGNET
mc --chain arbitrum info 0xTOKEN
mc --chain robinhood wallet
```

Canonical chain values:

`ethereum`, `optimism`, `arbitrum`, `avalanche`, `base`, `polygon`, `bsc`, `blast`, `zora`, `unichain`, `robinhood`, `sepolia`.

Aliases and capabilities come from `mint.club-cli/chain-registry.json`.

## Read operations

```bash
mc --chain base info <token>
mc --chain arbitrum price <token>
mc --chain polygon wallet
```

## Bond mint and burn

Use direct Bond operations when the user wants the token's configured reserve ERC-20:

```bash
mc --chain base buy <token> --amount 100 --max-cost 25
mc --chain base sell <token> --amount 100 --min-refund 20
```

`amount` is the exact Mint Club token amount. `max-cost` and `min-refund` are denominated in the reserve token. If a limit is omitted, the CLI uses the current quote as the exact on-chain limit.

## ZapV2 routed mint

Use an exact input amount and name the input asset explicitly:

```bash
mc --chain arbitrum zap-buy <mint-club-token> \
  --input-token USDT \
  --input-amount 10 \
  --slippage 1

mc --chain base zap-buy <mint-club-token> \
  --input-token 0xERC20 \
  --input-amount 250 \
  --min-tokens 100 \
  --slippage 0.5
```

Use `NATIVE` for the selected chain's native currency. Never reinterpret “Buy 10 TOKEN with ETH” as a ZapV2 request: ask for the exact ETH input in the unambiguous form “Buy TOKEN with 0.1 ETH.”

## ZapV2 routed burn

```bash
mc --chain unichain zap-sell <mint-club-token> \
  --amount 100 \
  --output-token USDC \
  --slippage 1

mc --chain robinhood zap-sell <mint-club-token> \
  --amount 100 \
  --output-token NATIVE \
  --min-output 0.02
```

`amount` is the exact Mint Club token burn amount. `min-output` is denominated in the output asset.

## Routing limits

The CLI uses RPC-only quotes and selects the highest output among enumerated candidates:

- direct path or one wrapped-native/stablecoin intermediary;
- homogeneous Uniswap V2, V3, or V4 path;
- hookless canonical V4 fee/tick-spacing pairs only.

It does not use an external route API and does not support split, mixed-protocol, arbitrary-length, dynamic-fee, or hooked V4 paths. Do not describe the result as globally optimal; say “best among enumerated candidates.”

Universal Router encoding uses router-held input (`payerIsUser = false`) and ZapV2 as the output recipient.

## Current Zap deployment status

Every ZapV2 address is currently unconfigured. Zap commands intentionally fail before wallet setup, approvals, or transaction construction. Do not guess or substitute an address. Direct Bond/read/create/send operations remain available.

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

Curve presets: `linear`, `exponential`, `logarithmic`, `flat`.

## Transfer

```bash
mc --chain avalanche send <address> --amount 0.01
mc --chain robinhood send <address> --amount 100 --token USDG
```

## Safety

- Before a write, state the chain, token, exact amount, input/output asset, and max/min limit.
- Use `info` or `price` first when the token or reserve is unclear.
- Never print or expose `PRIVATE_KEY`.
- Do not invent a route, ZapV2 address, or general-purpose `swap` command.
- Distinguish “best among bounded candidates” from global optimization.
- Token addresses are tracked per chain in `~/.mintclub/tokens.json`.
