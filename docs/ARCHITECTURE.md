# Architecture

- API handles auth, kingdom endpoints, command actions.
- Game server runs tick jobs and combat/economy processors.
- Shared package contains formulas and constants used across services and clients.
- Web/mobile consume API and render the game UI.
