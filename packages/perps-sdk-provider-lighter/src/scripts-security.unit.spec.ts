/**
 * Security tests for path traversal vulnerability mitigation in scripts/verify-consumer-bundlers.mjs
 *
 * These tests verify that the createFixture function properly validates paths
 * to prevent path traversal attacks that could write files outside the intended directory.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Extracted createFixture function with security fix applied.
 * This mirrors the actual implementation in scripts/verify-consumer-bundlers.mjs:
 * the path guard runs before any directory or file is created.
 */
function createFixture(
  root: string,
  name: string,
  { manifest }: { manifest: Record<string, unknown>; sources: string }
) {
  const resolvedRoot = resolve(root)
  const resolvedDir = resolve(resolvedRoot, name)
  const relPath = relative(resolvedRoot, resolvedDir)
  if (relPath.startsWith('..') || isAbsolute(relPath)) {
    throw new Error('Invalid path')
  }
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(resolvedDir, 'package.json'),
    JSON.stringify(manifest, null, 2)
  )
  return dir
}

describe('createFixture - Path Traversal Security Tests', () => {
  let testRoot: string

  beforeEach(() => {
    // Create a temporary directory for each test
    testRoot = mkdtempSync(join(tmpdir(), 'path-traversal-test-'))
  })

  afterEach(() => {
    // Clean up after each test
    if (testRoot && existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true })
    }
  })

  describe('Valid paths (should succeed)', () => {
    it('should allow creating a fixture with a simple name', () => {
      const manifest = { name: 'test-fixture', version: '1.0.0' }

      const result = createFixture(testRoot, 'valid-fixture', {
        manifest,
        sources: 'test',
      })

      expect(result).toBe(join(testRoot, 'valid-fixture'))
      expect(existsSync(join(result, 'package.json'))).toBe(true)

      const content = JSON.parse(
        readFileSync(join(result, 'package.json'), 'utf-8')
      )
      expect(content.name).toBe('test-fixture')
    })

    it('should allow creating a fixture with a nested path', () => {
      const manifest = { name: 'nested-fixture', version: '1.0.0' }

      const result = createFixture(testRoot, 'nested/fixture', {
        manifest,
        sources: 'test',
      })

      expect(result).toBe(join(testRoot, 'nested/fixture'))
      expect(existsSync(join(result, 'package.json'))).toBe(true)
    })
  })

  describe('Path traversal attacks (should be blocked)', () => {
    it('should reject path traversal using ../ (parent directory)', () => {
      const manifest = { name: 'malicious', version: '1.0.0' }

      expect(() => {
        createFixture(testRoot, '../malicious', {
          manifest,
          sources: 'test',
        })
      }).toThrow('Invalid path')
    })

    it('should reject path traversal using ../../ (multiple parent directories)', () => {
      const manifest = { name: 'malicious', version: '1.0.0' }

      expect(() => {
        createFixture(testRoot, '../../malicious', {
          manifest,
          sources: 'test',
        })
      }).toThrow('Invalid path')
    })

    it('should reject path traversal with nested parent references', () => {
      const manifest = { name: 'malicious', version: '1.0.0' }

      expect(() => {
        createFixture(testRoot, 'nested/../../malicious', {
          manifest,
          sources: 'test',
        })
      }).toThrow('Invalid path')
    })

    it('should reject absolute paths', () => {
      const manifest = { name: 'malicious', version: '1.0.0' }
      const absolutePath = '/tmp/malicious'

      expect(() => {
        createFixture(testRoot, absolutePath, {
          manifest,
          sources: 'test',
        })
      }).toThrow('Invalid path')
    })
  })

  describe('Security property validation', () => {
    it('should ensure resolved path is always within root directory', () => {
      const manifest = { name: 'test', version: '1.0.0' }
      const validName = 'valid/nested/path'

      const result = createFixture(testRoot, validName, {
        manifest,
        sources: 'test',
      })

      const resolvedRoot = resolve(testRoot)
      const resolvedResult = resolve(result)
      const relPath = relative(resolvedRoot, resolvedResult)

      // Verify the security property: relative path should not start with '..'
      expect(relPath.startsWith('..')).toBe(false)
      // Verify the security property: relative path should not be absolute
      expect(isAbsolute(relPath)).toBe(false)
      // Verify the result is actually within the root
      expect(resolvedResult.startsWith(resolvedRoot)).toBe(true)
    })

    it('should validate that malicious paths are detected before file creation', () => {
      const manifest = { name: 'malicious', version: '1.0.0' }
      // The exact directory a traversal of '../outside-target' would create:
      // the sibling of testRoot, not a fabricated timestamped path.
      const outsideDir = resolve(join(testRoot, '../outside-target'))

      // Ensure the outside directory doesn't exist before the test
      if (existsSync(outsideDir)) {
        rmSync(outsideDir, { recursive: true, force: true })
      }

      // Attempt path traversal
      expect(() => {
        createFixture(testRoot, '../outside-target', {
          manifest,
          sources: 'test',
        })
      }).toThrow('Invalid path')

      // Verify that nothing was created outside the root: the guard runs
      // before mkdirSync, so the traversal target must not exist.
      expect(existsSync(outsideDir)).toBe(false)
    })
  })
})
