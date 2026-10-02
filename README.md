# Sparshika 3D — datacenter digital twin

React + three.js (React Three Fiber) twin of a 6-rack hot/cold-aisle room.
It polls the Sparshika cloud API for the latest reading of every part the
on-prem agent monitors and draws it: status LEDs, spinning fans, a telemetry
side panel with live graphs, and a hot-aisle heat map.

```
on-prem agent ──► cloud API (Render + Supabase) ──► this twin (Vercel)
 sparshika-platform/agent      sparshika-platform/cloud      GET /api/v1/worldstate every 5 s
```

## What's in the site

| Route | Who | What |
|---|---|---|
| `/` | everyone | Landing page |
| `/demo` | everyone | The demo hall (browser simulation) |
| `/signup`, `/login`, `/forgot`, `/reset`, `/verify`, `/invite` | everyone | Account pages |
| `/app` | signed in | Onboarding checklist until the organisation is active, then the live twin |
| `/app/settings/team` | members | Team, roles, invitations, seats |
| `/app/settings/agents` | operators+ | Sites, one-time enrolment codes, connected agents |
| `/admin` | STS staff | Review, approve, reject or suspend organisations and set seats |
| `/dev/outbox` | local dev | Emails the API "sent" (needs `DEV_MODE=1` on the API) |

Onboarding: sign up → confirm email → request activation → STS approves →
generate a one-time code → `./setup.sh --enroll CODE --api https://<site>` on
a server in the hall → invite the team. See `sparshika-platform/cloud/README.md`.

## Run locally

```bash
# 1) API (in sparshika-platform) — SQLite accounts, emails to the dev outbox
DEV_MODE=1 STS_ADMIN_EMAILS=you@example.com APP_URL=http://localhost:5173 \
  ./.venv/bin/uvicorn cloud.main:app --port 8010

# 2) Site (here) — /api is proxied to :8010, like the Vercel rewrite
npm install
npm run dev            # http://localhost:5173
```

Sign up with the address in `STS_ADMIN_EMAILS` to get the STS console. Open
`/dev/outbox` for verification and invitation links.

Preview build with no backend at all: `VITE_MOCK_API=1 npm run build` (hash
routing, in-browser mock API, preview accounts listed on the sign-in page).

## Deploy

Vercel serves the site; `vercel.json` rewrites `/api/*` to the Render API, so
the session cookie is first-party. No `VITE_API_BASE` is needed.

## Live, stale and simulated data

Every reading carries a `source`, and the UI always shows it:

| Source | Meaning | How it looks |
|---|---|---|
| **Live** | Fresh record from the agent | green "Live" badge; header pill counts live parts |
| **Stale** | The cloud has a record, but it's older than `VITE_STALE_SECONDS` (agent or uplink down) | amber "Stale" badge; LED and fan ring go grey |
| **Simulated** | No agent reports this part (demo filler) | grey "Simulated" badge and a note in the panel |

The heat map uses only live readings whenever any exist.

## How live parts get into the scene

The room layout in `src/scene/Datacenter.jsx` (`RACK_LAYOUT`) is **demo filler**.
Each agent record (schema v1.1) includes `kind` and `position`
(`rack_id`, `start_u`, `height_u`) from the agent's `config.yaml`, and
`buildRacks()` places those parts at runtime, replacing any demo unit in
those slots. So **to add a monitored part, add it to the agent config.
No frontend change is needed.**

- `kind: server | gpu | switch | storage | pdu` picks the 3D unit.
- `kind: fan` parts attach to the unit at the same rack position. Click the
  server to pull it out, then click a fan. Fans spin at their reported RPM,
  and their ring shows their condition.
- A rack id the room doesn't have is logged to the console and not drawn.

## Cabling

`src/scene/cabling.js` derives every cable from the room layout, so each one
has a real origin and destination. Classes are segregated the way a hall is
built, and each can be toggled from the **Cables** dock:

| Class | Looks like | Route |
|---|---|---|
| Power | thick black cords | UPS rack → overhead busway A (red) / B (blue) → tap-off → vertical PDU-A / PDU-B on the rear corners → one cord per PSU (A/B alternate) |
| Copper | blue Cat6A | server NICs → rear vertical manager → both top-of-rack switches; patch-panel trunks → wire-basket tray → network rack |
| Fibre | thin yellow | each TOR → front riser → yellow raceway (highest tier) → crossover → two spine switches |

The telemetry panel lists what the selected unit is plugged into. The
**View** dock flies to Overview, Cold aisle, Hot aisle (rear cabling) or
Overhead (containment); dragging cancels a fly-to.

## Layout

| Path | What |
|---|---|
| `src/data/telemetry.js` | Poller, `getTelemetry()` / `getMetadata()`, live topology hook, metric history |
| `src/scene/Datacenter.jsx` | Room, racks layout, live-part merge, camera focus and view presets, heat map |
| `src/scene/cabling.js`, `Cabling.jsx` | Cable routing + connection map, merged-tube renderer |
| `src/scene/Rack.jsx` | Rack cabinet, units, instanced status LEDs, server internals and fans |
| `src/components/` | Telemetry panel, cloud status pill, sparkline |
| `src/legacy/` | GLB-based viewers, not mounted (see its README) |
| `scripts/` | Blender generators for the `.glb` assets in `public/` |

## Scripts

```bash
npm run lint          # oxlint, warnings fail
npm run build         # production build (three.js split into its own chunk)
npm run screenshot    # headless screenshot of the running dev server (dev-only puppeteer)
```

Deployed on Vercel. `.env.production` points at the Render API.
