import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

interface TsBuildConfig {
  references?: { path: string }[]
}

/**
 * Test-only aliases so workspace `@lifi/*` deps resolve to a sibling's
 * `src/index.ts` instead of its published `dist` exports, which don't exist
 * until `pnpm build` runs. Derived from `packageDir`'s own
 * `tsconfig.build.json` project references so the alias set tracks the real
 * dependency graph instead of a hand-maintained list.
 */
export function workspaceSrcAliases(
  packageDir: string
): Record<string, string> {
  const buildConfigPath = join(packageDir, 'tsconfig.build.json')
  if (!existsSync(buildConfigPath)) {
    return {}
  }

  const { references = [] }: TsBuildConfig = JSON.parse(
    readFileSync(buildConfigPath, 'utf8')
  )

  const aliases: Record<string, string> = {}
  for (const { path: refPath } of references) {
    const refDir = dirname(resolve(packageDir, refPath))
    const refPackageJsonPath = join(refDir, 'package.json')
    if (!existsSync(refPackageJsonPath)) {
      continue
    }
    const { name } = JSON.parse(readFileSync(refPackageJsonPath, 'utf8'))
    aliases[name] = join(refDir, 'src/index.ts')
  }
  return aliases
}
