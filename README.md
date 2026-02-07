# Tandarr

LAN movie night picker — swipe through your Plex library with friends, Tinder-style.

<!-- TODO: Add screenshot here -->
<!-- ![Tandarr Screenshot](docs/screenshots/swipe.png) -->

## Features

- Connect to your Plex Media Server
- Create rooms and invite friends via room code
- Filter by genre, decade, rating, and more
- Swipe right to approve, left to skip
- Instant match notifications when everyone agrees
- Deck options: wild cards, boost recently added, and more
- Dark theme, mobile-first responsive design

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
