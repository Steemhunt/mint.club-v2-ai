# mint.club-cli

CLI for [Mint Club V2](https://mint.club) bonding curve tokens across 15 EVM chains.

## Install

```bash
npm install -g mint.club-cli
```

## Usage

```bash
# Get token info
mc info <token-address> --chain base

# Buy (mint) tokens
mc buy <token-address> -a 100 --chain base

# Sell (burn) tokens
mc sell <token-address> -a 50 --chain base

# Create a new bonding curve token
mc create -n "MyToken" -s MTK -r <reserve-token> -x 1000000 -t "500000:0.01,1000000:1.0"

# Zap buy (swap any token → reserve → mint, Base only)
mc zap-buy <token> -i <input-token> -a 1.0 -p "<token0>,<fee>,<token1>"

# Zap sell (burn → reserve → swap to any token, Base only)
mc zap-sell <token> -a 100 -o <output-token> -p "<token0>,<fee>,<token1>"
```

## Configuration

Set `PRIVATE_KEY` in `.env` for write operations (buy/sell/create/zap).

## Supported Chains

Ethereum, Base, Optimism, Arbitrum, Avalanche, Polygon, BNB Chain, Blast, Degen, Ham, Cyber, Kaia, Mode, Zora, and more.

## License

MIT
