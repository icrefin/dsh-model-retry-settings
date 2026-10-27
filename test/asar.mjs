/**
 * Minimal asar reader for the verification harness.
 *
 * The dsh installation ships its runtime as an Electron `app.asar`, which only
 * Electron's patched `fs` can read. The harness needs a handful of
 * `@deepseek-ai/*` packages out of it to exercise this plugin against the real
 * SDK instead of a hand-written stand-in, so this module parses the archive
 * index once and extracts a directory at a time.
 *
 * The asar layout: a pickle header whose second `uint32` is the JSON directory's
 * byte length, then that JSON, then every file's bytes back to back.
 */

import fs from 'node:fs'
import path from 'node:path'

/** Default archive of a macOS installation. */
export const DEFAULT_ASAR = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'

/**
 * Open an asar archive.
 * @param archive - absolute path to the `app.asar` file.
 * @returns an index of every entry and an `extract` operation over it.
 */
export function openAsar(archive = process.env.DSH_ASAR ?? DEFAULT_ASAR) {
  const fd = fs.openSync(archive, 'r')
  const head = Buffer.alloc(16)
  fs.readSync(fd, head, 0, 16, 0)
  const headerSize = head.readUInt32LE(4)
  const raw = Buffer.alloc(headerSize)
  fs.readSync(fd, raw, 0, headerSize, 8)

  // The JSON directory starts at the first `{` and ends at its matching brace.
  const start = raw.indexOf(0x7b)
  const text = raw.toString('utf8', start)
  let depth = 0
  let end = -1
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1
    else if (text[index] === '}') {
      depth -= 1
      if (depth === 0) {
        end = index + 1
        break
      }
    }
  }
  if (end < 0) throw new Error(`asar: the directory JSON in ${archive} is truncated`)

  const tree = JSON.parse(text.slice(0, end))
  const baseOffset = 8 + headerSize
  const entries = []
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node.files ?? {})) {
      const entryPath = `${prefix}/${name}`
      if (value.files) walk(value, entryPath)
      else entries.push({ path: entryPath, size: value.size, offset: Number(value.offset) })
    }
  }
  walk(tree, '')

  /**
   * Read one file out of the archive.
   * @param entryPath - exact archive path, e.g. `/dsh/package.json`.
   * @returns the file's bytes.
   */
  function readFile(entryPath) {
    const entry = entries.find((item) => item.path === entryPath)
    if (entry === undefined) throw new Error(`asar: no entry at ${entryPath} in ${archive}`)
    const buffer = Buffer.alloc(entry.size)
    fs.readSync(fd, buffer, 0, entry.size, baseOffset + entry.offset)
    return buffer
  }

  /**
   * Extract every entry under one prefix.
   * @param prefix - archive path prefix, e.g. `/dsh/node_modules/react/`.
   * @param destination - directory the prefix's contents are written under.
   * @returns the number of files written.
   */
  function extract(prefix, destination) {
    let written = 0
    for (const entry of entries) {
      if (!entry.path.startsWith(prefix)) continue
      const relative = entry.path.slice(prefix.length).replace(/^\//, '')
      if (relative === '') continue
      const target = path.join(destination, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      const buffer = Buffer.alloc(entry.size)
      fs.readSync(fd, buffer, 0, entry.size, baseOffset + entry.offset)
      fs.writeFileSync(target, buffer)
      written += 1
    }
    if (written === 0) throw new Error(`asar: no entry under ${prefix} in ${archive}`)
    return written
  }

  /** Archive paths matching one regular expression. */
  function list(pattern) {
    return entries.filter((entry) => pattern.test(entry.path)).map((entry) => entry.path)
  }

  return { archive, entries, readFile, extract, list, close: () => fs.closeSync(fd) }
}
