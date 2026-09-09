/**
 * Call sites a `script-src` without 'unsafe-eval' blocks: the `Function`
 * constructor with or without `new` and reached through any object, direct
 * and comma-indirect `eval`, and the string form of the two timers. An `eval`
 * bound to another name first is beyond a text scan.
 */
export const SCRIPT_TEXT_EVALUATION =
  /\bFunction\s*\(|\beval\s*\(|\beval\s*\)\s*\(|\b(?:setTimeout|setInterval)\s*\(\s*['"`]/
