// Official host integration. Only the model and macOS process boundary are simulated.
// DSH_HOST_NODE_MODULES must point at a real @deepseek-ai/dsh@0.2.2-rc.1 install.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'

assert.ok(process.env.DSH_HOST_NODE_MODULES, 'Set DSH_HOST_NODE_MODULES to the official host node_modules')
const requireHost = createRequire(resolve(process.env.DSH_HOST_NODE_MODULES, '__host_probe.cjs'))
const load = name => import(pathToFileURL(requireHost.resolve(`@deepseek-ai/${name}`)))
for (const name of ['dsh', 'dsh-agent', 'dsh-agent-loop', 'dsh-session']) {
  const manifest = JSON.parse(readFileSync(requireHost.resolve(`@deepseek-ai/${name}/package.json`), 'utf8'))
  assert.equal(manifest.version, '0.2.2-rc.1', `Unexpected ${name} host version`)
}
const { Context } = await load('cordis')
const { default: Llm, LlmAdapter, createUserMessage } = await load('dsh-llm')
const { default: Sessions, SessionId } = await load('dsh-session')
const { default: Projections } = await load('dsh-session-projection')
const { default: SystemPrompt } = await load('dsh-system-prompt')
const { default: Tools } = await load('dsh-tools')
const NativeExecutor = await load('dsh-tool-executor-native')
const { default: Agents } = await load('dsh-agent')
const { default: Loop } = await load('dsh-agent-loop')
const pluginRoot = process.env.DSH_PLUGIN_ROOT ? resolve(process.env.DSH_PLUGIN_ROOT) : resolve(import.meta.dirname, '..')
const plugin = await import(pathToFileURL(resolve(pluginRoot, 'index.js')))
const ctx = new Context()
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
const originalSpawn = childProcess.spawn
const children = []
let releaseModel
let startedModel
let fiber
let modelTimeout
const started = new Promise(resolve => { startedModel = resolve })
const release = new Promise(resolve => { releaseModel = resolve })
const active = () => children.filter(child => !child.killed)
const eventually = async predicate => {
  const end = Date.now() + 5000
  while (!predicate()) {
    assert.ok(Date.now() < end, 'Host transition timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
class LocalAdapter extends LlmAdapter {
  async resolveModel(provider, model) { return { provider, id: model, name: model } }
  async *stream() {
    startedModel()
    await release
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'local fixture' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'local fixture' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
try {
  for (const service of [Llm, Sessions, Projections, SystemPrompt, Tools, NativeExecutor, Agents]) await ctx.plugin(service)
  await ctx.plugin(Loop, { agents: [] })
  ctx.llm.registerAdapter(['local'], new LocalAdapter())
  const handle = await ctx.agents.create({ sessionId: SessionId('keep-awake-rc1'), agentOptions: { provider: 'local', model: 'fixture' } })
  const agent = handle.agent
  childProcess.spawn = (executable, args) => {
    const child = new EventEmitter()
    child.pid = 12345 + children.length
    child.killed = false
    child.unref = () => {}
    child.kill = signal => { child.killed = true; child.emit('exit', null, signal); return true }
    assert.equal(executable, '/usr/bin/caffeinate')
    assert.deepEqual(args, ['-i', '-w', String(process.pid)])
    children.push(child)
    return child
  }
  syncBuiltinESMExports()
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  fiber = await ctx.plugin(plugin, { reconcileSeconds: 0 })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'fixture' }], source: { kind: 'user' } }))
  await Promise.race([started, new Promise((_, reject) => { modelTimeout = setTimeout(() => reject(new Error('Model did not start')), 5000) })])
  clearTimeout(modelTimeout)
  assert.equal(agent.status, 'running')
  assert.equal(active().length, 1, 'Real agent/status acquires exactly one assertion')
  await fiber.dispose()
  assert.equal(active().length, 0, 'Unload releases a running assertion')
  fiber = await ctx.plugin(plugin, { reconcileSeconds: 0, enabled: false })
  assert.equal(active().length, 0, 'Disabled plugin does not acquire during an active turn')
  await fiber.dispose()
  fiber = await ctx.plugin(plugin, { reconcileSeconds: 0 })
  assert.equal(active().length, 1, 'Hot reload reconciles the real running registry')
  releaseModel()
  await eventually(() => agent.status === 'idle')
  assert.equal(active().length, 0, 'Real idle event releases the assertion')
  await agent.runMaintenance(async () => {
    assert.equal(agent.status, 'idle')
    agent.session.append('compaction/start', { compactionId: 'fixture', turn: null })
    assert.equal(active().length, 1, 'Real session/event brackets idle maintenance')
    agent.session.append('compaction/end', { compactionId: 'fixture', turn: null })
    assert.equal(active().length, 0, 'Compaction end releases the assertion')
  })
  agent.session.append('compaction/start', { compactionId: 'dispose-fixture', turn: null })
  assert.equal(active().length, 1)
  await handle.dispose()
  assert.equal(active().length, 0, 'Real agent/disposed releases an open compaction bracket')
  await fiber.dispose()
  assert.equal(active().length, 0, 'Plugin unload leaves no assertion')
  console.log('PASS: official rc1 agent loop, scoped status, maintenance events, and plugin disposal (simulated caffeinate; no macOS claim).')
} finally {
  clearTimeout(modelTimeout)
  releaseModel?.()
  await ctx.fiber.dispose()
  childProcess.spawn = originalSpawn
  syncBuiltinESMExports()
  Object.defineProperty(process, 'platform', originalPlatform)
}
