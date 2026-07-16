# Mint Club V2 — Agent Skill

Use the `mc` CLI for protocol-native Mint Club V2 operations on Base and Robinhood Chain.

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
mc --chain robinhood info 0xTOKEN
```

Supported chain values: `base`, `robinhood`.

## Read operations

```bash
mc --chain base info <token>
mc --chain robinhood price <token>
mc --chain robinhood wallet
```

## Bond mint and burn

Use direct Bond operations when the user already holds the token's reserve ERC-20:

```bash
mc --chain base buy <token> --amount 100 --max-cost 25
mc --chain base sell <token> --amount 100 --min-refund 20
mc --chain robinhood buy <token> --amount 100 --max-cost 25
mc --chain robinhood sell <token> --amount 100 --min-refund 20
```

If `--max-cost` or `--min-refund` is omitted, the CLI uses the current quote as the exact on-chain limit.


`amount` is the exact Mint Club token amount. `max-cost` and `min-refund` are denominated in the reserve token.

## Native ETH ZapV1

Use only for WETH-reserve Mint Club tokens:

```bash
# MCV2_ZapV1.mintWithEth
mc --chain robinhood zap-buy <token> --amount 100
mc --chain robinhood zap-buy <token> --amount 100 --max-cost 0.02

# MCV2_ZapV1.burnToEth
mc --chain robinhood zap-sell <token> --amount 100
mc --chain robinhood zap-sell <token> --amount 100 --min-refund 0.01
```

Default quote slippage is 1%; override with `--slippage <percent>`. Zap is not an arbitrary-token or DEX swap.

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
mc --chain robinhood send <address> --amount 0.01
mc --chain robinhood send <address> --amount 100 --token USDG
```

## Known symbols

| Chain | Symbols |
|---|---|
| Base | `ETH`, `WETH`, `USDC`, `HUNT`, `MT` |
| Robinhood Chain | `ETH`, `WETH`, `USDG` |

Addresses are accepted on both chains.

## Safety

- Before a write, state the chain, token, exact amount, and max/min limit.
- Use `info` or `price` first when the token or reserve is unclear.
- Never print or expose `PRIVATE_KEY`.
- Do not invent a DEX route or use a `swap` command; none exists.
- Token addresses are tracked per chain in `~/.mintclub/tokens.json`.
