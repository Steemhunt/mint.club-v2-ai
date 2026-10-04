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

The full development audit is also run on a weekly schedule. The existing high-severity exception covers only these package identities and the exact advisory URLs in `scripts/check-full-audit.mjs`:

- `@openzeppelin/contracts`
- `@uniswap/swap-router-contracts` (a propagated parent entry)
- `@uniswap/universal-router-sdk` (a propagated parent entry)

These findings come from Solidity source packages pinned inside `@uniswap/universal-router-sdk@5.15.0`. The CLI bundles the SDK's JavaScript route encoder and ABI-only views of imported contract artifacts; it does not include, execute, or deploy the affected Solidity sources or artifact bytecode. npm's proposed remediation is a breaking downgrade to `@uniswap/universal-router-sdk@3.0.3`, which would remove APIs required by the V2/V3/V4 routing implementation. npm can also report `@uniswap/swap-router-contracts` as a propagated parent of the same OpenZeppelin findings, so that exact package identity is triaged as well. The exact known high advisory URLs remain a separate allowlist boundary; a new advisory on any allowed package still fails until explicitly reviewed and added.

Fixable toolchain paths are pinned to patched versions through exact root overrides (`adm-zip`, `vite`, `serialize-javascript`, `tmp`, `undici`, and `ws`). Hardhat 2's stale `adm-zip` range uses patched `0.6.1`, and its Undici path uses patched `6.29.0`. The lock-policy regression test verifies these pins. A scoped `@elizaos/core` override updates its unused PDF.js dependency to `6.4.299`; the core's published JavaScript has no PDF.js import, and the override preserves its Node 22.13 minimum. Hardhat, its watcher, PDF.js, and Undici are absent from the CLI/MCP bundles and are not published as direct package runtime dependencies.

### Current upstream release blocker

The dependency refresh checked on 2026-10-04 has zero production audit findings. The full audit still fails, intentionally, on `braces`, `chokidar`, and `hardhat-watcher` because of [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The affected path is:

`@uniswap/universal-router-sdk` → `@uniswap/router-sdk` / `@uniswap/v3-sdk` → `@uniswap/swap-router-contracts@1.3.1` → `hardhat-watcher@2.5.0` → `chokidar@3.6.0` → `braces@3.0.3`.

Both the watcher and Braces are already at their latest stable releases. This repository never invokes the watcher or passes untrusted patterns to it. Forcing Chokidar 4 or 5 would remove the glob-pattern behavior that the upstream watcher supports, so that incompatible override is not applied. These JavaScript findings are not part of the Solidity-source exception above. CI and release publishing remain blocked until the upstream path is repaired or a separate compatible remediation is approved; no audit rule has been relaxed.

### Supported-version limits

The CLI uses Commander 13.1.0 because newer majors require Node 20 or 22, while CLI/MCP still support Node 18. MCP SDK stays on `~1.29.0`: releases 1.30 and later allow `@hono/node-server` 2, which requires Node 20 and breaks Node 18 installs with `engine-strict`. Node type definitions track the latest Node 22 line used by the development workspace. Undici stays on patched 6.29.0: a local Hardhat HTTP-provider smoke test fails with Undici 7 because Hardhat passes the removed `maxRedirections` option; Undici 8 also requires Node 22.19. TypeScript 7, Vitest 5, Bun 1.4, and the other compatible direct dependencies use current stable releases; Eliza remains on its current stable 1.7.2 rather than an alpha/beta release.
