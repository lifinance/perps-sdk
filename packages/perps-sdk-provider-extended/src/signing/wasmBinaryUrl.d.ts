/**
 * URL of the Stark signer binary shipped with this package: an emitted asset
 * URL under a bundler, a `file://` path under Node.
 *
 * @internal
 */
export declare const starkWasmBinaryUrl: URL

/**
 * URL a bundler emitted for the binary after it relocated this module.
 * `undefined` when there is no asset pipeline to ask.
 *
 * @internal
 */
export declare function resolveEmittedBinaryUrl(): Promise<URL | undefined>
