import { vi } from 'vitest'

// Every test file runs this first. Modules that import the Neon client get a
// stand-in, so tests need no .env and never reach the network: using it
// throws, which fails the test that did.
vi.mock('../lib/neon', () => ({
  neon: new Proxy(
    {},
    {
      get(_, key) {
        throw new Error(`Tests can't use the Neon client (neon.${String(key)}). Test logic that doesn't need it.`)
      },
    },
  ),
}))
