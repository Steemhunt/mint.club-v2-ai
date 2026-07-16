# Mint Club V2 CLI

A command-line client for protocol-native [Mint Club V2](https://mint.club) operations on **Base** and **Robinhood Chain**.

The CLI calls the official contracts directly:

- `MCV2_Bond.mint` / `burn` for reserve-token trades
- `MCV2_ZapV1.mintWithEth` / `burnToEth` for native ETH trades on WETH-reserve tokens
- `MCV2_Bond.createToken` for token creation

It does **not** provide a general-purpose DEX swap command.

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

Base is the default. Select Robinhood Chain with the global option:

```bash
mc --chain base info SIGNET
mc --chain robinhood info 0xTOKEN
```

| Chain | CLI value | Chain ID | Known symbols |
|---|---|---:|---|
| Base | `base` | 8453 | `ETH`, `WETH`, `USDC`, `HUNT`, `MT` |
| Robinhood Chain | `robinhood` | 4663 | `ETH`, `WETH`, `USDG` |

Any ERC-20 or Mint Club token can also be supplied by contract address. Created and used Mint Club token addresses are tracked per chain in `~/.mintclub/tokens.json`.

## Read operations

```bash
mc --chain base info SIGNET
mc --chain base price SIGNET
mc --chain robinhood wallet
```

USD pricing uses chain-specific DefiLlama price feeds with fixed $1 handling for USDC and USDG.

## Bond mint and burn

Use these commands when paying or receiving the token's configured reserve ERC-20.

```bash
# Mint an exact token amount
mc --chain base buy SIGNET --amount 100
mc --chain robinhood buy 0xTOKEN --amount 100 --max-cost 25

# Burn an exact token amount
mc --chain base sell SIGNET --amount 100
mc --chain robinhood sell 0xTOKEN --amount 100 --min-refund 20
```

`--max-cost` and `--min-refund` are denominated in the reserve token and respect its decimals. If omitted, the current quote is used as the exact on-chain limit; provide an explicit limit to tolerate price movement before inclusion.

## Native ETH ZapV1 mint and burn

ZapV1 applies only to Mint Club tokens whose reserve token is WETH.

```bash
# MCV2_ZapV1.mintWithEth
mc --chain base zap-buy 0xWETH_RESERVE_TOKEN --amount 100
mc --chain robinhood zap-buy 0xTOKEN --amount 100 --slippage 0.5
mc --chain robinhood zap-buy 0xTOKEN --amount 100 --max-cost 0.02

# MCV2_ZapV1.burnToEth
mc --chain base zap-sell 0xWETH_RESERVE_TOKEN --amount 100
mc --chain robinhood zap-sell 0xTOKEN --amount 100 --slippage 0.5
mc --chain robinhood zap-sell 0xTOKEN --amount 100 --min-refund 0.01
```

The amount is always the exact Mint Club token amount to mint or burn. `max-cost` and `min-refund` are native ETH amounts. Default slippage is 1%.

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

Prices are encoded using the reserve token's actual decimals, including 6-decimal USDC and USDG. Non-flat presets require the final price to exceed the initial price and automatically reduce the nominal 500 steps when reserve precision cannot represent 500 strictly increasing prices.

## Transfer and balances

```bash
mc --chain robinhood send 0xRECIPIENT --amount 0.01
mc --chain robinhood send 0xRECIPIENT --amount 100 --token USDG
mc --chain robinhood wallet
```

## Official contract addresses

| Chain | MCV2 Bond | MCV2 ZapV1 | ERC-20 implementation |
|---|---|---|---|
| Base | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` | `0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa` | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` |
| Robinhood Chain | `0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa` | `0xA3dCf3Ca587D9929d540868c924f208726DC9aB6` | `0xEb54dACB4C2ccb64F8074eceEa33b5eBb38E5387` |

Robinhood canonical tokens:

- WETH: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`
- USDG: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`

## Development

From the repository root:

```bash
npm ci
npm run check --workspace mint.club-cli
npm test --workspace mint.club-cli
npm run build --workspace mint.club-cli
```

The default test suite includes unit tests and read-only Base/Robinhood mainnet integration checks. Anvil write tests run automatically when `~/.foundry/bin/anvil` is installed.

## License

MIT
