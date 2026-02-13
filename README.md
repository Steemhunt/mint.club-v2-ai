# mint.club-cli

CLI for [Mint Club V2](https://mint.club) bonding curve tokens across 15 EVM chains.

## Install

```bash
npm install -g mint.club-cli
```

## Setup

Generate a new wallet:

```bash
mc wallet --generate
```

This creates `~/.mintclub/.env` with a new private key and shows your wallet address. Fund it to start trading.

Or if you already have a key, create the config manually:

```bash
mkdir -p ~/.mintclub
echo 'PRIVATE_KEY=0xyour_key_here' > ~/.mintclub/.env
```

Check your wallet address anytime:

```bash
mc wallet
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

## Supported Chains

Ethereum, Base, Optimism, Arbitrum, Avalanche, Polygon, BNB Chain, Blast, Degen, Ham, Cyber, Kaia, Mode, Zora, and more.

Default chain is `base`. Use `--chain <name>` to switch.

## License

MIT
