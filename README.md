# Tandarr

**LAN movie night picker — swipe through your Plex library with friends, Tinder-style.**

Tired of spending 30 minutes arguing about what to watch? Tandarr turns your Plex library into a collaborative swiping
experience. Everyone in the room swipes independently on movies, and when the group agrees — it's a match. No more
endless scrolling, no more compromises nobody's happy with.

<p align="center">
  <img src="resources/swiping.png" alt="Swiping on movies" width="250" />
  &nbsp;&nbsp;&nbsp;
  <img src="resources/its_a_match.png" alt="It's a Match!" width="250" />
</p>

## Why Tandarr?

- **No accounts needed** — runs entirely on your LAN, no cloud, no sign-ups for guests
- **Works with your library** — pulls directly from Plex, complete with posters, ratings, and metadata
- **Genuinely fun** — the swipe mechanic makes picking a movie feel like a game, not a chore
- **Smart deck building** — a probability-weighted algorithm ensures everyone sees relevant movies, not just random
  picks
- **Self-hosted** — your data stays on your network, runs in a single Docker container

## How It Works

<p align="center">
  <img src="resources/create_room.png" alt="Create or join a room" width="300" />
</p>

1. **Connect** your Plex server (IP or plex.tv/link PIN auth)
2. **Create a room** and share the 4-character code with friends
3. **Filter** the library together — by genre, decade, watched status, or exclude specific titles
4. **Swipe** through movies — right to like, left to pass
5. **Match** — when everyone swipes right on the same movie, it's movie night

<p align="center">
  <img src="resources/main_screen.png" alt="Library browser" width="700" />
</p>

## Features

- **Room system** — create rooms with a shareable 4-character code, up to 4 players
- **Real-time sync** — WebSocket-powered, everyone sees updates instantly
- **Smart filters** — genre, decade, hide watched, and per-movie exclusions with a visual grid
- **Deck options** — wild cards, boost recently added/released, amplify right-swipes, demote left-swipes — all with
  Low/Medium/High intensity
- **Instant match notifications** — popup the moment the group agrees
- **Near-miss results** — if no perfect match, see which movies came closest with agreement percentages
- **Session persistence** — refresh the page or lose connection? You'll reconnect right where you left off
- **Mobile-first design** — works great on phones, tablets, and desktops with a polished dark theme
- **Plex PIN auth** — no need to manually find your token, just enter a code at plex.tv/link

## Advanced Features

### Probability-Weighted Deck Engine

Tandarr doesn't just shuffle your library randomly. Each movie gets a dynamic weight based on the host's deck options:

| Deck Option            | What It Does                                                                        |
|------------------------|-------------------------------------------------------------------------------------|
| **Wild Cards**         | Injects movies that bypass all filters — surprises that nobody would have picked    |
| **Boost Right-Swipes** | When another player swipes right, that movie's weight increases in your unseen pool |
| **Demote Left-Swipes** | When another player passes, the movie becomes less likely to appear for you         |
| **Recently Released**  | Newer movies (by release year) float to the top                                     |
| **Recently Added**     | Movies recently added to your Plex library get priority                             |

Each option has three intensity levels (Low / Medium / High) that control how aggressively the weighting is applied.

<p align="center">
  <img src="resources/waiting_for_players.png" alt="Lobby with deck options" width="350" />
</p>

### Filter Intersection

When multiple players set different filters, Tandarr computes the intersection — only movies that pass **everyone's**
filters enter the deck. A live overlap counter shows how many movies remain in common before swiping begins.

<p align="center">
  <img src="resources/filter.png" alt="Filter panel with genre and decade chips" width="700" />
</p>

### Session Reconnection

Each player receives a session token stored in localStorage. If the browser refreshes or the WebSocket drops, Tandarr
automatically reconnects and replays the current room phase (lobby, filtering, or swiping) — no progress lost. A
30-second grace period keeps your spot before you're removed.

### Match & Near-Miss System

When all players swipe right on the same movie, a match popup appears with the option to lock it in as tonight's pick.
If the deck runs out without a unanimous match, the results screen shows **near misses** ranked by agreement
percentage — so the group can still make a quick decision.

## Quick Start

### Docker Compose (Recommended)

```yaml
services:
  tandarr:
    image: liorbasss/tandarr:latest
    container_name: tandarr
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/config
    environment:
      - TZ=America/New_York
```

```bash
docker compose up -d
```

Then open `http://<your-ip>:3000` in your browser.

### Docker Run

```bash
docker run -d \
  --name tandarr \
  -p 3000:3000 \
  -v ./config:/config \
  -e TZ=America/New_York \
  --restart unless-stopped \
  liorbasss/tandarr:latest
```

### Unraid

Available in Community Apps — search for **Tandarr**.

## Configuration

On first launch, open the web UI and enter your Plex server IP to connect. You can also pre-configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TZ` | `UTC` | Container timezone |
| `PORT` | `3000` | Web UI port (inside container) |
| `CONFIG_DIR` | `/config` | Config/cache storage path |
| `PLEX_URL` | — | Plex server URL (e.g., `http://192.168.1.50:32400`) |
| `PLEX_TOKEN` | — | Plex authentication token |

`PLEX_URL` and `PLEX_TOKEN` seed the config file on first boot. After that, you can change settings via the web UI.

## Networking

Tandarr needs to reach your Plex server from inside the Docker container.

- **Bridge mode** (default): Use your host/NAS IP address when configuring Plex — not `localhost` or `127.0.0.1`
- **Host mode**: Add `network_mode: host` to your compose file — Tandarr shares the host network and can reach Plex at `localhost`

All users on your LAN connect to the same Tandarr instance via browser. No port forwarding or internet exposure needed.

## Development

```bash
git clone https://github.com/liorbass/tandarr.git
cd tandarr
npm install
npm run dev
```

Client dev server runs on `http://localhost:5173` with API proxy to the Fastify server on port 3000.

### Tech Stack

- **Frontend**: Preact + @preact/signals + Vite
- **Backend**: Fastify + WebSocket
- **Language**: TypeScript
- **Styling**: CSS Modules, dark theme

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GPL-3.0](LICENSE)
