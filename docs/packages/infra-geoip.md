# infra-geoip

`@gmod/infra-geoip` exposes `lookupCountry(address: unknown): string | null`. It estimates a public
IPv4/IPv6 address's country using the bundled GeoLite2 Country database, returning its uppercase
country code or `null` for unknown, invalid, private and reserved addresses. IPv4-mapped IPv6 is
supported. Callers normalize game-server addresses with ports before lookup.

The database is read and decompressed lazily once per process. Lookups do not send addresses to
external services or download data at runtime. Missing/corrupt database errors propagate so the
statistics model can report geography unavailable without breaking other statistics.

`geolite2-country` pins the database artifact and `mmdb-lib` reads it. Refresh the pinned database
version and lockfile through a dependency update, then validate the offline lookup tests. Docker
installs the database with the other workspace dependencies; no mounted database or API key is needed.

This product includes GeoLite2 Data created by [MaxMind](https://www.maxmind.com/). The database is
governed by the [GeoLite2 EULA](https://www.maxmind.com/en/geolite2/eula), incorporating
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the bundled package includes its
NOTICE. The dashboard also displays MaxMind attribution. Country estimates may be affected by VPNs,
proxies and the age of the database.
