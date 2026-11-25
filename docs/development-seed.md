# Development sample data

Use `bun run seed:dev` to populate the local dashboard and public server ranking with sample data.
The seed runs against the configured development databases and attaches its servers to an existing
Discord community. Dashboard access keeps the normal authentication and permission checks.

## Prepare the environment

1. Configure the root `.env` with `DEV=true` and local MariaDB and MongoDB connections. Docker Compose
   service names are also supported. The command refuses a non-development environment or remote
   database hosts.
2. Start the development dependencies and apply the Prisma schema:

   ```bash
   docker compose --env-file .env up -d
   bun run prisma:generate
   bun run prisma:push
   ```

3. Start the API, website and Discord worker with the development bot, then sign in at
   `http://localhost:3000/login`. The bot must already belong to a community where your Discord account
   is the owner or an administrator.

The default seed writes sample data to the databases. Adding `--discord` also creates real Discord
resources in the configured development community. Neither mode creates Discord communities, OAuth
sessions or bot invitations.
The dashboard obtains community permissions from Discord OAuth and community details from the bot
worker, so SQL records alone do not make an arbitrary community accessible.

## Preview and create the data

Run these commands from the repository root:

```bash
bun run seed:dev --help
bun run seed:dev --dry-run
bun run seed:dev
```

`--dry-run` previews the selected community, owner and dataset without writing changes. The default
community is `DISCORD_GUILD_ID` and must already exist in the local database. The owner defaults to
the Discord account with the only active dashboard session. If several accounts have active sessions,
select the owner explicitly.

To choose a community or account, replace the placeholder IDs with their Discord identifiers:

```bash
bun run seed:dev --guild-id YOUR_GUILD_ID --owner-id YOUR_DISCORD_ID --dry-run
bun run seed:dev --guild-id YOUR_GUILD_ID --owner-id YOUR_DISCORD_ID
```

`bun run prisma:seed` is an alias for the same runner and accepts the same options.

## Configure the Discord integration

To populate the Discord side as well as the dashboard, start the Discord worker with the main
development bot and run:

```bash
bun run seed:dev --discord --dry-run
bun run seed:dev --discord
```

`--discord` explicitly enables real writes to Discord. Both commands still require `DEV=true` and
local databases. This mode only targets `DISCORD_GUILD_ID`; a different `--guild-id` is refused.
The main bot must already belong to that community and have permission to manage channels, roles
and webhooks, send messages, embed links, attach files and read message history. Its highest role
must be above the demonstration roles.

The dry run checks permissions and existing resources without writing to Discord or the databases.
Both execution modes populate all 103 sample servers. Discord provisioning only configures the three
original private integration servers; the 100 public ranking servers do not create additional Discord
messages, channels or webhooks. The execution creates or reuses the following resources:

| Resource             | Configuration                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Category             | `[DEMO] Gmod Integration`                                                                      |
| Text channels        | `demo-status`, `demo-verification`, `demo-logs`, `demo-chat`, `demo-votes`, `demo-screenshots` |
| Status messages      | One per private integration server, with a player list and a documentation button              |
| Automatic role       | `[DEMO] Membre`, applied through the normal new-member integration                             |
| Verification         | A verification message and enabled `[DEMO] Vérifié` role                                       |
| Rank synchronization | `[DEMO] VIP` mapped to the `vip` group on all three servers                                    |
| Team synchronization | `[DEMO] Citoyen` mapped to the DarkRP server's `Citoyen` team                                  |
| Webhooks             | Twelve: logs, chat, votes and screenshots for each of the three servers                        |

All four demonstration roles have zero additional Discord permissions. Configuration does not run a
role assignment sweep over existing members. It keeps normal login and permission checks, premium
entitlements and the existing interface.

Re-running the command reuses live resources and refreshes the existing status messages. It repairs
references to deleted messages or webhooks when their demonstration channel still exists. Existing
server integrations pointing to another channel are preserved and cause the command to stop rather
than replace their destination. An existing guild verification message in another channel is preserved;
the command does not move or replace it. Duplicate demonstration names or conflicting role permissions
must be resolved before provisioning continues.

## Browse and refresh the samples

Refresh the dashboard, select the existing Discord community, then open its server list or the server
ranking page. The dataset includes 103 servers and 120 synthetic players:

- Three private integration servers each contain all 120 players, with seven days of sessions for
  testing player lists, searches and pagination.
- One hundred public ranking servers cover ten game modes and maps, varied vote scores, and populated,
  empty, full and offline states. Each contains 8–12 players with statistics, sessions and team time.
  Recent votes contribute to the ranking; older votes exercise its thirty-day cutoff.
- Server management pages have fourteen days of population history, warnings, active and expired bans,
  open and closed bug reports, logs and client/server errors. The private servers also contain 72
  screenshots, nickname rules, settings, chat filters and log triggers.

The server thumbnails and sample screenshots use local SVG fixtures served by the website. Their URLs
follow the configured `WEBSITE_URL`; keep the website running when testing these images. The command
prints the resulting counts and destinations.

The generated records use stable fixture identifiers. Re-running the command refreshes the seed's
sample records while preserving unrelated servers and user data. OAuth sessions and premium
entitlements remain unchanged. Without `--discord`, the command only writes database fixtures and
does not send messages to Discord.

A seeded server has stored statistics but no running Garry's Mod process. Its live WebSocket indicators
can remain disconnected. The public ranking stops displaying live status snapshots after five minutes;
Discord status data becomes offline after six minutes. Re-run `bun run seed:dev` to refresh the sample
data, or `bun run seed:dev --discord` to also refresh the three Discord status messages. Some samples
are intentionally offline from the start.

## Troubleshooting

| Symptom                                       | Check                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| No unique owner can be selected               | Sign in to the local dashboard, or supply `--owner-id` for an existing local account.                                    |
| The configured community does not exist       | Use an existing development community with `--guild-id`; ensure the bot has joined it.                                   |
| The community is missing from the dashboard   | Your signed-in Discord account must own it or have the Administrator permission. Seeding does not grant this permission. |
| Community pages return an error or time out   | Run the Discord worker and verify that the development bot can see the community.                                        |
| Seeding refuses the environment               | Check `DEV=true` and the database hosts in the root configuration. Use local development databases.                      |
| Sample status becomes offline                 | Seeded history does not simulate a running game server; re-run the command to refresh samples.                           |
| Discord setup cannot manage demo resources    | Check the main development bot's permissions, channel overwrites and role hierarchy; keep the Discord worker running.    |
| Discord setup refuses an existing destination | Preserve or deliberately reconfigure that integration before rerunning; the seed does not replace a different channel.   |
