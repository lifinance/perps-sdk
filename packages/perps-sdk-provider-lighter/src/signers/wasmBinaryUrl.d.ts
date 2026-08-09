/**
 * URL of the Go signer binary shipped with this package: an emitted asset URL
 * under a bundler, a `file://` path under Node.
 *
 * @internal
 */
export declare const lighterWasmBinaryUrl: URL

/**
 * URL a bundler emitted for the packaged binary, for the case where it relocated
 * this module and {@link lighterWasmBinaryUrl} therefore points somewhere the
 * binary is not. `undefined` when the module system has no asset pipeline to ask.
 *
 * @internal
 */
export declare function resolveEmittedBinaryUrl(): Promise<URL | undefined>
