// The package's CommonJS build resolves the binary relative to `__filename`.
// `probe.js` is ESM, so this entry reaches it through a dynamic import.
const run = async () => {
  const { probeLighterSigner } = await import('./probe.js')
  console.log(JSON.stringify(await probeLighterSigner()))
}

void run()
