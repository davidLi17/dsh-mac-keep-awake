import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const tarballName = `${packageJson.name}-${packageJson.version}.tgz`

function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'keep-awake-install-'))
  t.after(() => rmSync(temporary, { recursive: true, force: true }))
  const project = join(temporary, 'workspace with spaces')
  const home = join(temporary, 'isolated home')
  mkdirSync(project, { recursive: true })
  mkdirSync(home)
  for (const path of ['package.json', 'index.js', 'src', 'scripts', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.en.md']) {
    cpSync(join(root, path), join(project, path), { recursive: true })
  }
  const run = (...args) => execFileSync(process.execPath, [join(project, 'scripts/install.mjs'), ...args], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  return { project, home, run }
}

test('the staged installation archive includes the MIT notice, guides and runtime files', (t) => {
  const { project, home, run } = fixture(t)
  run()
  const packed = join(project, 'vendor', tarballName)
  const staged = join(home, '.dsh/profiles/desktop/vendor', tarballName)
  assert.deepEqual(readFileSync(staged), readFileSync(packed))
  const paths = execFileSync('tar', ['-tzf', staged], { encoding: 'utf8' }).trim().split(/\r?\n/)
  for (const path of ['package.json', 'index.js', 'src/keep-awake.js', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.en.md']) {
    assert.ok(paths.includes(`./${path}`), `${path} must be included in the installation archive`)
    assert.deepEqual(execFileSync('tar', ['-xOzf', staged, `./${path}`]), readFileSync(join(root, path)))
  }
  assert.ok(!paths.some((path) => /(?:node_modules|test|scripts)\//.test(path)))
})

test('a named profile keeps its previously pinned archive when staging an update', (t) => {
  const { home, run } = fixture(t)
  const profile = join(home, '.dsh/profiles/web')
  const vendor = join(profile, 'vendor')
  mkdirSync(vendor, { recursive: true })
  const previous = join(vendor, 'previous.tgz')
  writeFileSync(previous, 'existing archive')
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { [packageJson.name]: 'file:vendor/previous.tgz' } }))
  const output = run('--profile', 'web')
  assert.equal(readFileSync(previous, 'utf8'), 'existing archive')
  assert.ok(existsSync(join(vendor, tarballName)))
  assert.match(output, /kept, so pnpm can resolve it/)
  assert.equal(existsSync(join(home, '.dsh/profiles/desktop')), false)
})
