# System Architecture

Backend

Node.js
Express server
WebSocket server

Event Monitoring

Filesystem watcher
Git watcher
Terminal log watcher

Event Pipeline

event source
→ event router
→ agent manager
→ websocket broadcast
→ client visualization

Frontend

Three.js
WebGL rendering
Holographic interface
Drone-style agents
Bug entities

Modules

server/
watchers/
eventRouter.js
agentManager.js
websocketServer.js

client/
hologramEngine.js
radarMap.js
agentRenderer.js
bugRenderer.js
effects.js

config/
projects.json

Project Radar

Each monitored project appears as a node in 3D space.

Agent System

Agents move between nodes depending on activity.

Bug System

Errors spawn bug entities.

Agent attacks remove bugs.

Deployment System

Git push events trigger launch animation.

Visualization

Dark background
Blue holographic glow
Particle effects
Energy beams