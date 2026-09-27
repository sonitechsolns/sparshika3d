# Sparshika 3D — datacenter digital twin

React + three.js (React Three Fiber) twin of a 6-rack hot/cold-aisle room.
It polls the Sparshika cloud API for the latest reading of every part the
on-prem agent monitors and draws it: status LEDs, spinning fans, a telemetry
side panel with live graphs, and a hot-aisle heat map.

```
on-prem agent ──► cloud API (Render + Supabase) ──► this twin (Vercel)
 sparshika-platform/agent      sparshika-platform/cloud      GET /api/v1/worldstate every 5 s
```

## Run

```bash
npm install
npm run dev            # http://localhost:5173
```

Point it at an API with `.env.local` (see `.env.example`):

```
VITE_API_BASE=http://localhost:8010     # default when unset
VITE_SITE_ID=dc-west-1
VITE_STALE_SECONDS=60                   # after this, a part's reading shows as stale
```

For a full local loop, run the cloud API and the agent from `sparshika-platform`
(its READMEs cover both), with the agent's `uplink.url` set to
`http://127.0.0.1:8010/api/v1/ingest`.

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

## Layout

| Path | What |
|---|---|
| `src/data/telemetry.js` | Poller, `getTelemetry()` / `getMetadata()`, live topology hook, metric history |
| `src/scene/Datacenter.jsx` | Room, racks layout, live-part merge, camera focus, heat map |
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
