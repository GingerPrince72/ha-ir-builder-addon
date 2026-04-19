# IR Config Builder — HTTP API

This document is the reverse-engineered API contract for the Express backend
bundled at `index.cjs`. It was derived by reading route strings from the
minified bundle, not from source, so field-level detail (body shapes, response
payloads) is best-effort and should be verified against the running add-on
before being relied upon.

The server listens on `127.0.0.1:3000` inside the container and is fronted by
nginx on port 5000, which is the ingress port Home Assistant connects to.
All paths are served both directly and under the HA ingress prefix (the
`X-Ingress-Path` header).

Persistent state lives in `/data/ir-config.db` (SQLite, via `better-sqlite3`)
as configured by `run.sh` (`DB_PATH`).

## Endpoints

### Config
| Method | Path            | Purpose                                 |
|--------|-----------------|-----------------------------------------|
| GET    | `/api/config`   | Returns the current add-on configuration (UI bootstrap). |

### Settings
| Method | Path                    | Purpose |
|--------|-------------------------|---------|
| GET    | `/api/settings`         | Read current settings (learning backend choice, endpoints, tokens). |
| POST   | `/api/settings`         | Persist settings. |
| POST   | `/api/settings/test`    | Test connectivity to the configured learning backend. |

### Devices (physical IR blasters — Broadlink RM4, ESPHome IR transmitter, …)
| Method | Path                                  | Purpose |
|--------|---------------------------------------|---------|
| GET    | `/api/devices`                        | List all configured blaster devices. |
| POST   | `/api/devices`                        | Create a new device. |
| GET    | `/api/devices/:id`                    | Fetch one device. |
| PATCH  | `/api/devices/:id`                    | Update a device. |
| DELETE | `/api/devices/:id`                    | Remove a device. |
| GET    | `/api/devices/:deviceId/targets`      | List targets assigned to a device. |

### Targets (the appliance being controlled — TV, aircon, …)
| Method | Path                                  | Purpose |
|--------|---------------------------------------|---------|
| POST   | `/api/targets`                        | Create a target device. |
| PATCH  | `/api/targets/:id`                    | Update a target. |
| DELETE | `/api/targets/:id`                    | Remove a target. |
| GET    | `/api/targets/:targetId/commands`     | List commands (buttons) for a target. |

### Commands (individual learned IR codes)
| Method | Path                  | Purpose |
|--------|-----------------------|---------|
| POST   | `/api/commands`       | Create a learned command. |
| PATCH  | `/api/commands/:id`   | Update a command (rename, replace code, …). |
| DELETE | `/api/commands/:id`   | Remove a command. |

### Learning (capture IR from a physical remote)
| Method | Path                      | Purpose |
|--------|---------------------------|---------|
| POST   | `/api/learn/broadlink`    | Trigger a learn cycle against a Broadlink RM4. |
| POST   | `/api/learn/esphome`      | Trigger a learn cycle against an ESPHome IR receiver. |

### Remotes database (community-curated remote layouts)
| Method | Path                         | Purpose |
|--------|------------------------------|---------|
| GET    | `/api/remotes/search`        | Search the bundled `remotes-db` by make/model/alias. |
| GET    | `/api/remotes/image`         | Image proxy (solves CORS/mixed-content when loading remote images). |
| GET    | `/api/remotes/:id`           | Fetch a single remote by id. |
| POST   | `/api/remotes/submit`        | Submit a new/unknown remote (writes to `remotes-db/pending/submissions/`). |
| POST   | `/api/remotes/:id/report`    | Report an incorrect remote (writes to `remotes-db/pending/reports/`). |

## Notes
- All state-modifying calls expect JSON request bodies.
- The frontend lives at `public/` and is served by nginx for any non-`/api` path.
- Because the client is bundled/minified, the authoritative field list for
  each endpoint is currently encoded in the Zod/Drizzle schemas inside
  `index.cjs`. Extract them with tooling before writing new clients.
