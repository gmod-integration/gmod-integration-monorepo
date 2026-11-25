import { describe, expect, it } from 'vitest'
import { lookupCountry } from '../src/index.js'

describe('offline country estimates', () => {
  it('reads the bundled country database for IPv4, IPv6 and IPv4-mapped IPv6', () => {
    expect(lookupCountry('8.8.8.8')).toBe('US')
    expect(lookupCountry('193.252.122.103')).toBe('FR')
    expect(lookupCountry('2001:4860:4860::8888')).toBe('US')
    expect(lookupCountry('::ffff:8.8.8.8')).toBe('US')
  })

  it.each([
    undefined,
    null,
    42,
    {},
    '',
    'Unknown',
    '999.1.1.1',
    '8.8.8.8:27015',
    'https://8.8.8.8',
    '0.0.0.0',
    '10.0.0.1',
    '100.64.1.2',
    '127.0.0.1',
    '169.254.1.2',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:192.168.1.1',
    '2001:db8::1',
    'fc00::1',
    'fe80::1',
    'fec0::1',
    'ff02::1',
  ])('leaves malformed or non-public addresses unlocated: %j', (address) => {
    expect(lookupCountry(address)).toBeNull()
  })
})
