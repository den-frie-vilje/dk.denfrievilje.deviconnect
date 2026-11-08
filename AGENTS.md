# Agent notes for dk.denfrievilje.deviconnect

This is a Den Frie Vilje platform contribution: a Homey app for DEVIreg ZigBee thermostats. It
follows Homey's own conventions and look, and the Den Frie Vilje canon in
[den-frie-vilje/agentic-bureau](https://github.com/den-frie-vilje/agentic-bureau) `AGENTS.md`,
which rests on the agent canon in
[olekristensen/agentic-user](https://github.com/olekristensen/agentic-user) `AGENTS.md`.

## Non-negotiable: read the documentation before using any API

Never infer how a Homey API behaves. Before calling, polling, scripting against or writing code
for any of the interfaces below, read the relevant documentation and cite the page and section in
the chat, the commit or the pull request. An uncited claim about an API is an unverified guess
and is not acted on.

- Homey Web API (HTTP, Socket.io, sessions, tokens): <https://api.developer.homey.app/>
- `homey-api` client library (sessions, `createLocalAPI`, realtime capability instances):
  <https://athombv.github.io/node-homey-api/>
- Homey Apps SDK, including the Zigbee guide and the Developer Tools:
  <https://apps.developer.homey.app/>
- `homey-zigbeedriver` (`ZigBeeDevice`, `registerCapability`, attribute reporting):
  <https://athombv.github.io/node-homey-zigbeedriver/>
- `zigbee-clusters` (clusters, attributes, commands, `debug(true)`):
  <https://athombv.github.io/node-zigbee-clusters/>
- Homey CLI (`homey app run`, `homey api`, login and `HOMEY_PAT`):
  <https://apps.developer.homey.app/the-basics/getting-started/homey-cli>

What this rule exists to prevent, recorded on 2026-11-08: a session polled a Homey Pro's local
API through one-shot `homey api raw` calls every few seconds, without having read how sessions
and realtime events work. Homey answered "Too many requests", two setpoint writes were silently
refused, and the test being run against a thermostat produced nothing. The documented way is one
`homey-api` session with realtime capability updates, never polling.

Where the documentation does not say something, say "not stated" and ask, rather than filling the
gap from memory or from how other platforms behave.
