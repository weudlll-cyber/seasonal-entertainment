# Mining

Seasonal Tokens are produced by Proof-of-Work mining, like Bitcoin. New tokens can only come into existence through mining.

## How mining works

- Miners earn rewards of newly mined tokens every ten minutes on average.
- Mining uses the Keccak hashing algorithm. The official site describes it as ASIC-friendly.
- Mining difficulty adjusts to keep the average time between rewards close to 10 minutes.
- Each token needs different work, so the four tokens can have independent prices.
- To lower gas costs, miners can claim several rewards in one transaction, up to a limit of 72 rewards per batch.
- The tokens follow the ERC-918 standard, so existing mining software for similar mineable tokens can be used.

## Hardware

The mining page says you can mine with a graphics card, but that it "isn't economical, because it's cheaper to buy the tokens than to pay for the electricity". Most mining today uses FPGAs, which are more competitive than graphics cards.

## Getting started

The official [mining page](https://seasonaltokens.org/mining) names mining software for Nvidia cards (Cosmic Miner) and for AMD cards (SoliditySHA3Miner), with download links, and one mining pool address for each token. Please get the software and the current pool addresses from that page.

## Withdrawing mined tokens

On the mining page, you connect your wallet to see your mining stats and withdraw each token. You need enough ETH to pay the gas fees. The page asks you to let each withdrawal complete before you start another one.

## Sources

- [Seasonal Tokens mining page](https://seasonaltokens.org/mining)
- [Technical whitepaper](https://github.com/seasonaltokens/seasonaltokens/blob/main/whitepaper/whitepaper.md)
- [Seasonal Tokens home page and FAQ](https://seasonaltokens.org/)
