import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { BlockList, isIP } from 'node:net'
import { gunzipSync } from 'node:zlib'
import { Reader, type CountryResponse } from 'mmdb-lib'

let reader: Reader<CountryResponse> | undefined

// Local, documentation, shared-address and multicast ranges have no player country.
const excluded = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  excluded.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const)
  excluded.addSubnet(address, prefix, 'ipv6')

/** Country estimates stay offline. Database/reader failures propagate to the caller's unavailable state. */
export function lookupCountry(address: unknown): string | null {
  if (typeof address !== 'string') return null
  const family = isIP(address)
  if (!family || excluded.check(address, family === 4 ? 'ipv4' : 'ipv6')) return null
  if (!reader) {
    const require = createRequire(import.meta.url)
    const database = require.resolve('geolite2-country/GeoLite2-Country.mmdb.gz')
    reader = new Reader<CountryResponse>(gunzipSync(readFileSync(database)))
  }
  const country = reader.get(address)?.country?.iso_code
  return country && /^[A-Z]{2}$/.test(country) && country !== 'ZZ' ? country : null
}
