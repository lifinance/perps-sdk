import { readFile, writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function run() {
  const packagePath = join(process.cwd(), './package.json')

  readFile(packagePath, 'utf8', (_err, data) => {
    const { version, name } = JSON.parse(data)

    const file = `/**
 * Package name used in SDK telemetry and request metadata.
 *
 * @public
 */
export const name = '${name}'

/**
 * Published SDK version sent in the \`x-lifi-perps-sdk\` request header.
 *
 * @public
 */
export const version = '${version}'
`

    writeFileSync(`${process.cwd()}/src/version.ts`, file)
  })
}

run()
