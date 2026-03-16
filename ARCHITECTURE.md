# System Architecture

The system consists of three main layers.

Backend Layer
Node.js server that monitors development activity.

Responsibilities:
• filesystem watchers
• git activity monitoring
• terminal log monitoring
• event routing
• WebSocket event broadcast

Frontend Visualization Layer
Three.js powered 3D interface rendering a holographic command center.

Components:
• neural AI core
• project radar nodes
• agent drones
• bug entities
• particle effects

Desktop Layer
Electron wrapper allowing the application to run as a desktop program.

Responsibilities:
• launch backend automatically
• render Three.js frontend
• package Windows executable

Event Flow

Filesystem / Git / Terminal events
→ Event Router
→ WebSocket broadcast
→ Visualization Engine
→ Agents / Bugs / Neural Core update

Project configuration is loaded from:

config/projects.json
