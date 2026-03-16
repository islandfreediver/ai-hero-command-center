# AI Development Guidelines

Rules for AI assistants working on this project.

## Required Reading

Before modifying the codebase, always read the following files:

MISSION.md
ARCHITECTURE.md
TASKS.md
MEMORY.md

These files define the purpose, structure, and development state of the system.

---

## Core Development Rules

• Complete tasks in TASKS.md sequentially
• Update TASKS.md when tasks are finished
• Do not rewrite working modules unless necessary
• Avoid unnecessary explanations
• Focus on implementing working code
• Continue development until all tasks are complete

The system must always remain runnable in development mode.

---

## Architecture Preservation

The following systems must be preserved unless explicitly replaced:

• backend event system
• filesystem watchers
• git activity watchers
• terminal log watchers
• websocket event broadcasting
• bug arena visualization logic
• project radar visualization

New systems should be added as **modular layers**, not destructive rewrites.

---

## Neural Core Layer

The system contains a central **AI neural core** that represents activity in the development environment.

The neural core must include:

• rotating energy core
• neuron node network
• synapse connections
• signal pulse effects
• thinking / processing neuron clusters

Neural behavior must react to events such as:

coding activity
testing activity
errors
deployments
thinking / processing states

---

## Live Agent Layer

The system visualizes development activity as **AI agents**.

Agents must be inferred from observable activity such as:

• filesystem changes
• git commits
• terminal commands
• log output

Example agent roles:

Builder Agent
Architect Agent
Fixer Agent
Tester Agent
Deploy Agent
Observer Agent

Agents should move between project nodes and interact with bugs.

---

## Visualization Rules

Use Three.js for the 3D visualization layer.

Visual elements include:

• holographic AI core
• project radar nodes
• agent drones
• bug entities
• particle effects
• neural pulse animations

Avoid excessive entity counts to maintain performance.

---

## Desktop Mode

The application must support running as a desktop application using Electron.

Requirements:

• Electron launches backend automatically
• Three.js interface opens in desktop window
• application can run without a browser
• development mode and production build must both work

---

## Autonomous Mode

The AI assistant should attempt to complete multiple tasks per run.

Ask the user only when:

• dependencies cannot be installed
• permissions are missing
• system configuration is required

If a problem occurs, prefer implementing a workaround rather than stopping development.
