# Security Policy

## Supported versions

Security fixes target the latest release line and the `main` branch. Consumers should use the newest published `@mint.club/v2-*` packages.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through the repository's GitHub Security Advisory interface. Do not include private keys, wallet files, RPC credentials, or live exploit transactions in a public issue.

## Transaction safety boundaries

- CLI financial writes require explicit confirmation (`--yes`), except `create`, which keeps its interactive prompt and also supports `--yes`.
- MCP write tools require an explicit chain, explicit assets, and the structured input `confirm: true`; this is an omission guard, while user authorization remains the MCP host's destructive-tool approval boundary.
- Eliza writes require one affirmative, non-question original-user `Confirm:` statement with exactly one explicit chain and all effective limits, slippage, assets, and royalties; non-ASCII whitespace, control/format/Bidi characters, transaction-like token names, negation, cancellation, multiple clauses, defaults, and unmatched text fail closed.
- ERC-20 `transfer` and `approve` calls are simulated before broadcast; an explicit `false` return is rejected. Legacy no-return ERC-20s remain supported.
- Private keys are accepted through `PRIVATE_KEY` or the protected CLI wallet file, never through a command-line key argument.

## Dependency audit policy

CI blocks on:

1. `npm audit --omit=dev` with zero production findings,
2. a full dependency audit that rejects every critical finding and every untriaged high package or advisory,
3. clean install, script-policy tests, typecheck, unit tests, build, complete Bun-metafile-to-notice coverage, Uniswap artifact-bytecode exclusion, package-version alignment, and packed-artifact verification.

The full development audit is also run on a weekly schedule. As triaged on 2026-07-19, the remaining high package entries are:

- `@openzeppelin/contracts`
- `@uniswap/universal-router-sdk` (the propagated parent entry)

These findings come from Solidity source packages pinned inside `@uniswap/universal-router-sdk@5.9.0`. The CLI bundles the SDK's JavaScript route encoder and ABI-only views of imported contract artifacts; it does not include, execute, or deploy the affected Solidity sources or artifact bytecode. npm's proposed remediation is a breaking downgrade to `@uniswap/universal-router-sdk@3.0.3`, which would remove APIs required by the V2/V3/V4 routing implementation. npm can also report `@uniswap/swap-router-contracts` as a propagated parent of the same OpenZeppelin findings, so that exact package identity is triaged as well. The exact known high advisory URLs remain a separate allowlist boundary; a new advisory on any allowed package still fails until explicitly reviewed and added.

Fixable toolchain paths are pinned to patched versions through root-only development dependencies and overrides (`adm-zip`, `vite`, `serialize-javascript`, `tmp`, `undici`, and `ws`). In particular, Hardhat 2's stale `adm-zip ^0.4.16` range is overridden to patched `0.6.0`; the lock-policy regression test also requires the patched `undici 6.27.0` already used by that dev-only tool path. Hardhat, its watcher, `adm-zip`, and `undici` are absent from the Bun CLI bundle and are not published as package runtime dependencies. These pins are exercised by clean install, audit, test, and build gates.
