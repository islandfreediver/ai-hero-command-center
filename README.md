# ai-bug-battle-arena

Local real-time Jarvis-style command center for AI development activity.

## What it does

- Loads multiple monitored projects from `config/projects.json`
- Watches file changes, git activity, and relayed terminal output
- Streams a project-aware arena state over WebSocket
- Renders a Three.js holographic command center by default
- Keeps the original pixel arena available behind a mode toggle
- Spawns drone agents for coding/testing/research/deploy events
- Spawns bug entities on errors and boss bugs on repeated failures
- Supports autonomous simulation mode for local testing

## Stack

- Node.js
- Express
- WebSocket (`ws`)
- `chokidar`
- Three.js
- HTML + Canvas API + ES modules

## Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Manual simulation

Start the server first, then use any of these:

```bash
npm run simulate:coding
npm run simulate:error
npm run simulate:deploy
npm run simulate:testing
npm run simulate:research
```

You can also use the dashboard buttons to target individual project nodes.

## Autonomous simulation mode

The dashboard includes Start/Stop controls for the server-side simulation stream.

You can also drive it directly:

```bash
curl -X POST http://localhost:3000/api/simulation/start
curl -X POST http://localhost:3000/api/simulation/stop
curl http://localhost:3000/api/simulation/state
```

## Relay real terminal activity

Wrap a local command so the arena can parse its output and map it to the project path:

```bash
npm run arena:relay -- npm test
npm run arena:relay -- git push
```

That sends terminal lines and the current working directory to `/api/terminal`.

## Notes

- Missing project paths stay visible as offline radar nodes instead of breaking the server.
- The WebSocket payload includes `projects`, `core`, `agents`, `bugs`, `effects`, `simulation`, and legacy `heroes` / `enemies` aliases for pixel mode.
- Three.js is served directly from `node_modules` through the existing Express app, so no bundler is required.
