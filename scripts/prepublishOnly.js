import pkg from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const { outputFileSync, readJsonSync, writeJsonSync } = pkg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

generatePackageJson()

// Generates a package.json to be published to NPM with only the necessary fields.
function generatePackageJson() {
  const packageJsonPath = path.join(__dirname, '../package.json')
  const tmpPackageJson = readJsonSync(packageJsonPath)

  writeJsonSync(`${packageJsonPath}.tmp`, tmpPackageJson, { spaces: 2 })

  const {
    name,
    description,
    dependencies,
    peerDependencies,
    peerDependenciesMeta,
    version,
    files,
    exports: exports_,
    // NOTE: We explicitly don't want to publish the type field. We create a separate package.json for `src/cjs` and `src/esm` that has the type field.
    // type,
    main,
    module,
    types,
    typings,
    typesVersions,
    sideEffects,
    license,
    repository,
    authors,
    keywords,
  } = tmpPackageJson

  // Generate proxy packages for each export.
  // These proxy package.json files allow moduleResolution: "node" (node10)
  // to resolve subpath imports like "@lifi/perps-types/providers/hyperliquid".
  const files_ = [...files]
  for (const [key, value] of Object.entries(exports_)) {
    if (typeof value === 'string') {
      continue
    }
    if (key === '.') {
      continue
    }

    // Compute the correct relative prefix to get back to the package root.
    // e.g. "./providers/hyperliquid" → depth 2 → "../../"
    const subpath = key.replace('./', '')
    const depth = subpath.split('/').length
    const prefix = '../'.repeat(depth)

    // Extract paths from nested export conditions (import/require with types/default).
    const typesPath = value.import?.types ?? value.require?.types
    const modulePath = value.import?.default ?? value.import
    const mainPath = value.require?.default ?? value.default

    if (!modulePath || !mainPath) {
      throw new Error(`Export "${key}": both import and require/default paths are required.`)
    }

    const entries = []
    if (typesPath) {
      entries.push(`"types": "${typesPath.replace('./', prefix)}"`)
    }
    entries.push(`"module": "${(typeof modulePath === 'string' ? modulePath : '').replace('./', prefix)}"`)
    entries.push(`"main": "${(typeof mainPath === 'string' ? mainPath : '').replace('./', prefix)}"`)

    outputFileSync(
      `${key}/package.json`,
      `{\n  ${entries.join(',\n  ')}\n}`
    )
    files_.push(subpath)
  }

  writeJsonSync(
    packageJsonPath,
    {
      name,
      description,
      dependencies,
      peerDependencies,
      peerDependenciesMeta,
      version,
      files: files_,
      exports: exports_,
      // type,
      main,
      module,
      types,
      typings,
      typesVersions,
      sideEffects,
      license,
      repository,
      authors,
      keywords,
    },
    { spaces: 2 }
  )
}
