# ai-bug-battle-arena

Local real-time dashboard that turns development activity into a pixel superhero battle against software bugs.

## What it does

- Watches file edits with `chokidar` and spawns coding heroes.
- Monitors git changes and emits repo activity signals.
- Parses relayed terminal output for tests, deploys, research, and errors.
- Runs a server-side battle simulation and streams state over WebSocket.
- Renders a live pixel arena in the browser with heroes, bugs, effects, and an event feed.

## Stack

- Node.js
- Express
- WebSocket (`ws`)
- `chokidar`
- HTML + Canvas API + ES modules

## Project structure

```text
ai-bug-battle-arena/
  assets/
    sprites/
  client/
    arenaRenderer.js
    effects.js
    enemyRenderer.js
    heroRenderer.js
    index.html
    main.js
  config/
    arenaConfig.json
  scripts/
    relayCommand.js
    simulateEvent.js
  server/
    core/
      agentManager.js
      battleEngine.js
      enemyManager.js
      eventRouter.js
      utils.js
    eventCollectors/
      fileWatcher.js
      gitWatcher.js
      terminalWatcher.js
    websocket/
      socketServer.js
    index.js
  package.json
```

## Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Test mode

Start the server first, then use any of these:

```bash
npm run simulate:coding
npm run simulate:error
npm run simulate:deploy
npm run simulate:testing
npm run simulate:research
```

You can also click the simulation buttons in the dashboard UI.

## Relay real terminal activity

Wrap a local command so the arena can parse its output:

```bash
npm run arena:relay -- npm test
npm run arena:relay -- git push
```

That sends terminal lines to `/api/terminal`, where the parser maps them into battle events.

## Event mapping

- File modified -> `coding`
- Git branch or commit change -> `research`
- Test runner command/output -> `testing`
- Error output -> `error`
- Deploy command/output -> `deploy`
- Quiet period -> `idle`

## Notes

- Sprite assets are procedural right now, so the project runs without external art.
- Deploy detection is strongest when commands are relayed through `npm run arena:relay -- <command>`.
- The server is authoritative for simulation state, which keeps the UI simple and deterministic.
