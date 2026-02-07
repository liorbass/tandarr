# Contributing to Tandarr

Thanks for your interest in contributing!

## Development Setup

1. Fork and clone the repo
2. Install dependencies: `npm install`
3. Start dev servers: `npm run dev`
4. Client runs on http://localhost:5173 (with proxy to API)
5. Server runs on http://localhost:3000

## Tech Stack

- **Frontend**: Preact + @preact/signals + Vite
- **Backend**: Fastify + WebSocket
- **Language**: TypeScript throughout
- **Styling**: CSS Modules with dark theme

## Project Structure

```
src/
  client/          # Preact SPA
    components/    # UI components
    services/      # WebSocket, state management
    styles/        # CSS modules
  server/          # Fastify API + WebSocket server
    routes/        # HTTP and WS route handlers
    services/      # Business logic (rooms, deck building, Plex API)
  shared/          # Types and utilities shared between client and server
```

## Pull Requests

- Create a feature branch from `main`
- Keep PRs focused — one feature or fix per PR
- Include a description of what changed and why
- Ensure `npm run build` succeeds

## Reporting Bugs

Use the GitHub issue template. Include:

- Tandarr version (Docker tag)
- Platform (Unraid / Docker Compose / Docker Run)
- Steps to reproduce
- Expected vs actual behavior
- Container logs (`docker logs tandarr`)

## Code Style

- TypeScript strict mode
- Prettier for formatting (`npm run format`)
- Preact functional components with signals for state
- No class components
