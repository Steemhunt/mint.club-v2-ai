import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [workspace, outdirArg, metafileArg] = process.argv.slice(2);

if (!['cli', 'mcp'].includes(workspace) || !outdirArg) {
  throw new Error(
    'Usage: bun scripts/build-package.mjs <cli|mcp> <outdir> [metafile.json]',
  );
}

const workspaceRoot = resolve(root, workspace);
const manifest = JSON.parse(
  readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
);

const uniswapArtifacts = {
  name: 'uniswap-artifact-abi-only',
  setup(build) {
    build.onLoad(
      {
        filter:
          /[\\/]node_modules[\\/]@uniswap[\\/][^\\/]+[\\/]artifacts[\\/].+\.json$/,
      },
      async ({ path }) => {
        const artifact = await Bun.file(path).json();
        if (!Array.isArray(artifact.abi)) {
          throw new Error(`Uniswap artifact has no ABI array: ${path}`);
        }
        const abi = JSON.stringify(artifact.abi);
        return {
          contents: `export const abi = ${abi};\nexport default { abi };\n`,
          loader: 'js',
        };
      },
    );
  },
};

const result = await Bun.build({
  entrypoints: [resolve(workspaceRoot, 'src/index.ts')],
  outdir: resolve(outdirArg),
  target: 'node',
  format: 'esm',
  packages: 'bundle',
  metafile: true,
  define: { __VERSION__: JSON.stringify(manifest.version) },
  plugins: workspace === 'cli' ? [uniswapArtifacts] : [],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error(`Failed to build ${workspace}`);
}

if (metafileArg) {
  writeFileSync(resolve(metafileArg), `${JSON.stringify(result.metafile)}\n`);
}
