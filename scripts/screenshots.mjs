// Takes the README screenshots in docs/screenshots/ with headless Chrome,
// signed out, from the live site (or another address).
//
//   node scripts/screenshots.mjs                         # https://vprep-umber.vercel.app
//   node scripts/screenshots.mjs http://localhost:5173   # a local dev or preview server
//
// Needs Node 22+ (for the built-in WebSocket) and Google Chrome. Set
// CHROME_PATH if Chrome isn't in its usual place. No npm packages: it drives
// Chrome through the DevTools protocol. Vercel Analytics is blocked so the
// screenshots don't show up as visits.
//
// Desktop shots are 1440 x 900; phone shots are 390 x 844 at 2x. Files are
// WebP and should each be under 300 kB; the script prints their sizes.
// Pages that need sign-in (Progress, Admin) are captured by hand.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.argv[2] ?? 'https://vprep-umber.vercel.app').replace(/\/$/, '')
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots')
const MAX_BYTES = 300 * 1024

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }

// Picks option B, so the screenshot shows a chosen answer before submitting.
const CHOOSE_B = `document.querySelectorAll('main fieldset label')[1].click(); document.activeElement?.blur()`
// Hides the text cursor in a focused field.
const BLUR = `document.activeElement?.blur()`

/**
 * `ready` is a JavaScript expression that is true once the page shows what
 * the screenshot is for; `then` runs in the page before the screenshot.
 */
const shots = [
  { file: 'home', path: '/', viewport: DESKTOP, ready: hasText('Government') },
  { file: 'exams', path: '/exams', viewport: DESKTOP, ready: hasText('SSC CGL') },
  { file: 'exam-detail', path: '/exams/ssc-cgl', viewport: DESKTOP, ready: hasText('Quantitative Aptitude') },
  { file: 'practice', path: '/practice?exam=ssc-cgl', viewport: DESKTOP, ready: hasSelector('fieldset label'), then: CHOOSE_B },
  { file: 'timed-test', path: '/test?exam=gate-cse', viewport: DESKTOP, ready: hasText('Start test') },
  { file: 'leaderboard', path: '/leaderboard', viewport: DESKTOP, ready: hasSelector('table tbody tr') },
  { file: 'formulas', path: '/formulas', viewport: DESKTOP, ready: hasText('Percentage') },
  { file: 'search', path: '/search?q=probability', viewport: DESKTOP, ready: hasText('Practise th'), then: BLUR },
  { file: 'home-mobile', path: '/', viewport: PHONE, ready: hasText('Government') },
  { file: 'practice-mobile', path: '/practice?exam=ssc-cgl', viewport: PHONE, ready: hasSelector('fieldset label'), then: CHOOSE_B },
]

function hasText(text) {
  return `document.querySelector('main')?.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`
}

function hasSelector(selector) {
  return `!!document.querySelector('main')?.querySelector(${JSON.stringify(selector)})`
}

// Loaded: fonts in, no loading placeholders left.
const SETTLED = `document.fonts.status === 'loaded' && !document.querySelector('[class*="animate-pulse"]')`

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
  const found = candidates.find((path) => path && existsSync(path))
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to the Chrome executable.')
  return found
}

/** Starts headless Chrome and resolves to it and its DevTools WebSocket address. */
function launchChrome(profileDir) {
  const chrome = spawn(chromePath(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ])
  return new Promise((resolve, reject) => {
    let log = ''
    chrome.stderr.on('data', (chunk) => {
      log += chunk
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) resolve({ chrome, wsUrl: match[1] })
    })
    chrome.on('exit', (code) => reject(new Error(`Chrome exited (${code}) before it was ready:\n${log}`)))
  })
}

/** A minimal DevTools protocol client over one WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error(`Couldn't connect to ${wsUrl}`))
  })
  let nextId = 0
  const pending = new Map()
  const listeners = new Set()
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id !== undefined) {
      const call = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`))
      else call.resolve(message.result)
    } else {
      for (const listener of listeners) listener(message)
    }
  }
  return {
    send(method, params = {}, sessionId) {
      const id = ++nextId
      ws.send(JSON.stringify({ id, method, params, sessionId }))
      return new Promise((resolve, reject) => pending.set(id, { method, resolve, reject }))
    },
    once(method, sessionId) {
      return new Promise((resolve) => {
        const listener = (message) => {
          if (message.method === method && message.sessionId === sessionId) {
            listeners.delete(listener)
            resolve(message.params)
          }
        }
        listeners.add(listener)
      })
    },
    close: () => ws.close(),
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(cdp, sessionId, expression, what, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { result } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)
    if (result.value === true) return
    await delay(250)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

async function capture(cdp, sessionId, shot) {
  const { width, height, deviceScaleFactor, mobile } = shot.viewport
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile }, sessionId)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile }, sessionId)

  const loaded = cdp.once('Page.loadEventFired', sessionId)
  await cdp.send('Page.navigate', { url: BASE + shot.path }, sessionId)
  await loaded
  await waitFor(cdp, sessionId, `(${shot.ready}) && ${SETTLED}`, `${shot.path} to load`)
  if (shot.then) await cdp.send('Runtime.evaluate', { expression: shot.then }, sessionId)
  // Let transitions and late layout shifts finish.
  await delay(800)

  for (const quality of [85, 75, 65]) {
    const { data } = await cdp.send(
      'Page.captureScreenshot',
      { format: 'webp', quality, captureBeyondViewport: false },
      sessionId,
    )
    const bytes = Buffer.from(data, 'base64')
    if (bytes.length <= MAX_BYTES || quality === 65) {
      const file = join(OUT, `${shot.file}.webp`)
      writeFileSync(file, bytes)
      const size = statSync(file).size
      const flag = size > MAX_BYTES ? '  (over 300 kB)' : ''
      console.log(`${shot.file}.webp  ${width}x${height}@${deviceScaleFactor}x  ${Math.round(size / 1024)} kB${flag}`)
      return
    }
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const profileDir = mkdtempSync(join(tmpdir(), 'vprep-shots-'))
  const { chrome, wsUrl } = await launchChrome(profileDir)
  const cdp = await connect(wsUrl)
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Network.setBlockedURLs', { urls: ['*/_vercel/insights/*', '*va.vercel-scripts.com*'] }, sessionId)
    // Light theme, whatever the machine's setting.
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: 'light' }] },
      sessionId,
    )
    console.log(`Capturing ${BASE} into docs/screenshots/`)
    for (const shot of shots) await capture(cdp, sessionId, shot)
  } finally {
    cdp.close()
    chrome.kill()
    await delay(500)
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
