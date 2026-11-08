# Homey app development: Athom's rules for this repository

A reference for agents working on `dk.denfrievilje.deviconnect`, a Homey Pro app
(Apps SDK v3, TypeScript, Zigbee) for DEVIreg thermostats built on
`homey-zigbeedriver` and `zigbee-clusters`. Every entry gives the rule, the reason
Athom states (or "not stated"), and the page it rests on. Nothing here comes from
memory: where the documentation is silent, the entry says so, and the final
section lists the gaps. Pages were read on 2026-11-08 from the Markdown index at
https://apps.developer.homey.app/llms.txt and from the library reference sites.
Two citations point at Athom's source code rather than prose documentation and are
marked "(source)". The Homey support article on API keys refused automated
fetching and is not cited.

Abbreviations: ZG = https://apps.developer.homey.app/wireless/zigbee.md,
GL = https://apps.developer.homey.app/app-store/guidelines.md,
CLI = https://apps.developer.homey.app/the-basics/getting-started/homey-cli.md,
ZBD = https://athombv.github.io/node-homey-zigbeedriver/ZigBeeDevice.html,
ZCL = https://athombv.github.io/node-zigbee-clusters/Cluster.html,
DEV = https://apps-sdk-v3.developer.homey.app/Device.html.

## App structure and manifest

- **Edit `.homeycompose/app.json` and `drivers/<id>/driver.compose.json`, never
  `/app.json`.** The root manifest is generated from the Compose files.
  https://apps.developer.homey.app/the-basics/app.md ("What an app must not do"
  content; the page says not to edit `/app.json` by hand);
  https://apps.developer.homey.app/advanced/homey-compose.md (folder tree).
- **`sdk` is `3`; `compatibility` is a semver range, at least `">=5.0.0"`;
  `version` is semver with no pre-release suffix.** "pre-release versions
  (e.g. `1.0.0-rc.1`) are not allowed". Reason: not stated.
  https://apps.developer.homey.app/the-basics/app/manifest.md § Core Properties.
- **Raise `compatibility` to the minimum Homey version of every capability
  option you use.** `uiState` needs `>=13.5.0`, enum `values` need 12.0.1.
  https://apps.developer.homey.app/the-basics/devices/capabilities.md
  § capabilitiesOptions. `operational_state` itself has `minCompatibility`
  `12.2.0` (source: node-homey-lib `assets/capability/capabilities/operational_state.json`).
- **`brandColor` is mandatory and must not be very bright.** It backs the icons
  in Flows, Add devices and the App Store; icons must stay visible against it.
  GL § 1.7; manifest.md § Core Properties.
- **`category` is one of** `lights, video, music, appliances, security, climate,
  tools, internet, localization, energy`. manifest.md § Core Properties.
- **App name: brand name, no company names, no "Homey" or "Athom", no protocol
  names (Zigbee, Z-Wave, 433 MHz, Infrared), at most four words.** Reason: not
  stated beyond store consistency. GL § 1.1.
  Decision (Ole, 2026-11-08): this app keeps "ZigBee" in its name on purpose. The
  thermostats have two radios, Bluetooth and Zigbee, and the name says which one the
  app covers; a Bluetooth driver would be a separate app. Do not rename to satisfy
  § 1.1 without Ole; if the store review objects, raise it with him.
- **Description is a one-line tagline that does not repeat the name or readme and
  does not merely say the app "adds support for" something.** GL § 1.2.
- **README.txt: one or two plain-text paragraphs, no headers, no Markdown, no
  URLs, no feature list, no changelog.** Markdown is not rendered; links belong
  in the manifest (`homepage`, `source`, `bugs`, `support`); the changelog lives
  in `.homeychangelog.json`. GL § 1.3 and § 1.8; manifest.md § Additional
  Optional Properties.
- **Images: app 250x175, 500x350, optional 1000x700; driver 75x75, 500x500,
  optional 1000x1000; `.jpg` or `.png`.** App images are lifestyle or brand
  photos, not icons or logos; driver images show the device on a white
  background; no Homey logo or hardware; no AI-generated illustrations. GL § 1.4.
- **Icons: vector SVG, transparent background, full 960x960 canvas; each driver
  has its own icon, distinct from the app icon.** The driver icon path is fixed at
  `/drivers/<driver_id>/assets/icon.svg`. GL § 1.5 and § 1.6;
  https://apps.developer.homey.app/the-basics/devices.md § Icon.
- **English is required; other languages are encouraged; if one string is
  translated, translate everything (readme, Flow cards, settings, capabilities).**
  Homey falls back to `en`. Thirteen locales exist: en nl de fr it sv no es da ru
  pl ko ar. GL § 1.11;
  https://apps.developer.homey.app/the-basics/app/internationalization.md.
- **Use Celsius internally; Homey converts to Fahrenheit when `units` is `°C`.**
  internationalization.md § Temperature; capabilities.md § Number.
- **Request only permissions the core function needs; `homey:manager:api` is
  for Tools-category apps and is rejected in device apps.** "Apps that connect
  to physical devices, such as branded lightbulb or thermostat apps, should not
  use it." https://apps.developer.homey.app/the-basics/app/permissions.md; GL § 1.15.
- **Driver manifest: `class`, `capabilities`, `images`, `platforms`,
  `connectivity` (`zigbee` for this app), `pair`, `energy`, `settings`.** A wrong
  class loses Zone cards and voice control; use `other` only when nothing fits.
  devices.md § driver.compose.json. Class descriptions: `heater` is "for heaters,
  that warm your home"; `thermostat` is "usually paired with" `measure_temperature`,
  `target_temperature` and `thermostat_mode` (source: node-homey-lib
  `assets/device/classes/heater.json`, `thermostat.json`).
- **`data` identifies the device and cannot change after pairing; keep only the
  essential identifier there; changeable values go in the store.** devices.md
  § Device Identifier.
- **Device store is for back-end per-device persistence; device settings are the
  user-facing ones; app settings are app-wide and JSON-serialisable.** A hint
  calls store use "pretty rare". devices.md § Store;
  https://apps.developer.homey.app/the-basics/app/persistent-storage.md.
- **Settings: every setting needs `value`; ids must not start with `homey:`,
  `zw_`, `zb_`, `mtr_`, `thread_`, `zone_`, `energy_`, `satellite_mode_`,
  `homekit_`; `label` is read-only text only the app updates; `setSettings()` does
  not fire `onSettings`; throw in `onSettings` to reject.**
  https://apps.developer.homey.app/the-basics/devices/settings.md.
- **TypeScript: `outDir` must stay `.homeybuild/`, `sourceMap: true` is
  "strongly recommended", the entrypoint is `app.ts` and installs
  `source-map-support`; the CLI compiles on run, install and publish as long as a
  tsconfig exists in the root.** Types: `npm install
  @types/homey@npm:homey-apps-sdk-v3-types`.
  https://apps.developer.homey.app/guides/tools/typescript.md;
  https://github.com/athombv/node-homey-apps-sdk-v3-types (README).
- **Runtime is Node.js 22 on all platforms since Homey v12.9.0; native addons
  are discouraged; keep `env.json` out of git.** app.md.
- **ESLint: extend `athom` (or `athom/homey-app` for type-aware rules, which
  need a root tsconfig and the types package).**
  https://github.com/athombv/eslint-config-athom (README).
- **Use `this.homey.setTimeout` / `setInterval` so timers are disposed when the
  Homey instance is destroyed; catch every promise; implement `onUninit` to
  release resources; avoid globals.** Unhandled rejections "will cause the app to
  crash". https://apps-sdk-v3.developer.homey.app/Homey.html § Timers;
  https://apps.developer.homey.app/guides/homey-cloud.md (listed for cloud,
  with Homey Pro handling "coming").
- **Listen for `memwarn` and `cpuwarn`; an app that keeps exceeding limits is
  killed.** Homey.html § Events.
- **Timeline notifications: `this.homey.notifications.createNotification({ excerpt })`;
  wrap variable words in double asterisks.** Permission: not stated.
  https://apps-sdk-v3.developer.homey.app/ManagerNotifications.html.
- **Flow cards: short clear titles without device names or the words When/And/Then,
  `titleFormatted` for arguments, `hint` where needed; every action and condition
  needs a run listener; `"deprecated": true` instead of removing a card.**
  GL § 1.9; https://apps.developer.homey.app/the-basics/flow.md.
- **Only one app per brand; a near-duplicate submission must explain why
  contributing to the existing app was impossible.** GL § 2.1.1.

## Capabilities and listeners

- **Sync both ways: `registerCapabilityListener` sends Homey's value to the
  device; `setCapabilityValue` reports the device's value to Homey (`.catch(this.error)`).**
  capabilities.md § Synchronizing State.
- **Throwing inside a capability listener signals failure to the user.** For
  `target_power` the page says to throw when the device cannot reach the value;
  the general listener page shows a listener that throws. devices.md § device.js;
  https://apps.developer.homey.app/the-basics/devices/energy.md § Controlling
  Target Power. DEV does not state the effect of throwing.
- **Sub-capabilities (`measure_temperature.floor`) reuse a capability, but "Flow
  Cards will not be automatically generated for sub-capabilities"; define them
  yourself.** The thermostat UI pairs `target_temperature` and
  `measure_temperature` only when their suffixes match. capabilities.md § Sub-Capabilities.
- **`capabilitiesOptions.title` is two or three words; `min`, `max`, `step`,
  `decimals`, `units` for numbers; `preventInsights` to stop Insights.**
  capabilities.md § capabilitiesOptions.
- **`addCapability()` and `setCapabilityOptions()` are "expensive"; call them
  only when needed, never on every init; guard with `hasCapability` or a
  comparison.** DEV § Capability management;
  https://apps.developer.homey.app/guides/how-to-breaking-changes.md ("do not
  call addCapability on every init!").
- **`removeCapability()` breaks Flows that use the capability; prefer removing it
  from the manifest only, keep its listener, and call `removeCapability` only
  when the behaviour can no longer be implemented.** how-to-breaking-changes.md
  § Removing capabilities; DEV. `$filter` on Flow cards is not updated by
  `addCapability`/`removeCapability`. flow.md § Flow Card Device Filters.
- **`setClass()` and class changes break class-dependent Flows; "Publishing
  breaking changes is in general not allowed".** how-to-breaking-changes.md.
- **`registerMultipleCapabilityListener` debounces (default 250) and batches
  related capabilities.** DEV; energy.md § Controlling Target Power.
- **Energy: a calculated wattage is a dynamic approximation; add `measure_power`
  with `capabilitiesOptions.measure_power.approximated: true` so users see it
  marked as such; `measure_power` is in W, `meter_power` is cumulative kWh and
  must only increase.** energy.md § Capabilities, § Power Measurement vs
  Approximation. The capability JSON names the option `isApproximated` (source:
  node-homey-lib `measure_power.json`); the prose page says `approximated`.
- **`operational_state` is a non-setable enum `stopped | running | paused | error`
  with a `sensor` UI component and automatic changed/is cards.** (source:
  node-homey-lib `operational_state.json`.)
- **`target_temperature` is 4 to 35 by default, one decimal, thermostat UI;
  `locked` is a setable boolean toggle with lock/unlock cards.** (source:
  node-homey-lib `target_temperature.json`, `locked.json`.)
- **`setUnavailable(message)` blocks capabilities and Flow actions; `setWarning`
  shows a persistent message and must be unset.** devices.md § Availability; DEV.
- **`onSettings({ oldSettings, newSettings, changedKeys })` may return a string
  shown to the user.** DEV § Settings.

## Zigbee communication

- **Install `homey-zigbeedriver` and `zigbee-clusters` together; the latter is a
  peerDependency and versions must be compatible.** ZG § Dependencies.
- **Extend `ZigBeeDevice`; use `zigbee-clusters` directly only for registering
  capabilities, implementing or extending clusters, bound clusters and custom
  clusters; "It is not advised to use" the raw `ZigBeeNode` frame API.** ZG § API.
- **Manifest `zigbee` object: `manufacturerName`, `productId` (array allowed for
  near-identical products), `endpoints` keyed by endpoint id with `clusters`
  (client side: read, write, send to) and `bindings` (server side: receive from,
  and needed for attribute reporting). Only listed endpoints and clusters exist
  on the `ZCLNode`.** Get ids from the Zigbee developer tools interview.
  ZG § Manifest, § Pairing; https://apps.developer.homey.app/guides/tools/zigbee.md.
- **Do not communicate with the node in `onInit` or `onNodeInit`.** Zigbee may
  not be ready and queued requests "can cause performance bottlenecks". If a
  request is unavoidable at init, `.catch` it. ZG § Best Practices for Device
  Initialization.
- **Catch every promise in `onNodeInit`.** Up to `homey-zigbeedriver@2.1.3` an
  uncaught failure made the device unavailable; from 2.1.4 the device stays
  available but `onNodeInit` may not complete. ZG § Best Practices. The library
  logs and rethrows an `onNodeInit` error and the first-init flag is then never
  cleared (source: `lib/ZigBeeDevice.js`).
- **Use `this.isFirstInit()` for work that belongs to the first init after
  pairing.** ZG § Best Practices; ZBD.
- **One request at a time.** "it is advised to only perform one request at a
  time for the most reliable communication." Stated in the SED section, as the
  page's only concurrency guidance; the library itself has no queue (source:
  `lib/ZigBeeDevice.js`). ZG § Routers, End Devices and SEDs.
- **Sleepy end devices answer only when awake; the moment after pairing is "the
  only time you can reliably communicate"; identify them via Receive When Idle.**
  ZG § Routers, End Devices and SEDs. (DEVI thermostats are mains routers; the
  rule still bounds what init may assume.)
- **`registerCapability(capabilityId, CLUSTER.X, { get, set, setParser, report,
  reportParser, reportOpts, getOpts, endpoint })` extends the system map.**
  `getOpts.getOnStart` reads once when the value is `null` and "only works for
  non-sleepy devices"; `getOnOnline` reads on every end device announce;
  `pollInterval` (ms, or a settings key) polls `get`. ZBD § registerCapability;
  source: `lib/ZigBeeDevice.js` (the read on `getOnStart` is unawaited and starts
  when `registerCapability` runs).
- **`registerCapability` installs its own capability listener.** Source:
  `lib/ZigBeeDevice.js` (`_registerCapabilitySet`). Whether a second
  `registerCapabilityListener` warns is not stated in the docs.
- **`onEndDeviceAnnounce()` fires when the node (re)joins or is re-powered; the
  default only logs.** ZBD; source. `this.node.on('online')` is gone. README of
  node-homey-zigbeedriver § migration notes.
- **`onDeleted()` must call `super.onDeleted()` when overridden.** ZBD.
- **`getClusterEndpoint(cluster)` returns `null` when not found and only searches
  input clusters.** ZBD.
- **Manufacturer-specific and standard attributes never share one read, write
  or configure-reporting frame.** "do not mix regular and manufacturer specific
  attributes." ZCL § readAttributes, writeAttributes, configureReporting;
  zigbee-clusters README § Implementing a Custom Cluster.
- **Custom clusters: subclass the existing cluster, spread `super.ATTRIBUTES`
  and `super.COMMANDS`, give each manufacturer item a `manufacturerId`, register
  with `Cluster.addCluster()` before use.** zigbee-clusters README § Implementing
  a Custom Cluster; ZCL § addCluster.
- **Command options: `timeout` (default 10000 ms, measured from the low-level
  ack); `waitForResponse: false` only for devices that break the spec and send
  no default response; `disableDefaultResponse` sets the ZCL header flag.**
  zigbee-clusters README § Sending Commands; ZCL (`opts.timeout` on every
  method); source: `lib/Cluster.js`.
- **`readAttributes` takes an array of names; a non-success record is skipped,
  not thrown; `writeAttributes` returns the raw response without checking
  statuses.** README § v2.0.0; source: `lib/Cluster.js`.
- **Incoming reports emit `attr.<attributeName>` on the cluster; that is the only
  report event.** README § Events; source: `lib/Cluster.js`.
- **Incoming commands need a `BoundCluster` bound with
  `zclNode.endpoints[n].bind(CLUSTER.X.NAME, ...)`.** ZG § Bindings and Groups.
- **IAS Zone enrolment is handled by Homey since v13.1.2.** ZG § IAS.
- **Sub devices need `ZigBeeDriver` and a `devices` manifest property.** ZG § Sub Devices.

## Attribute reporting

- **Reports arrive only with a binding; put the cluster id in `bindings`; Homey
  sends the bind request at pairing.** ZG § Manifest, § Attribute Reporting; ZBD
  § configureAttributeReporting ("require a binding to be configured").
- **Configure with `this.configureAttributeReporting([{ endpointId, cluster,
  attributeName, minInterval, maxInterval, minChange }])` and catch the promise;
  or pass `reportOpts.configureAttributeReporting` to `registerCapability`.**
  ZG § Attribute Reporting; ZBD.
- **Batch configurations for one cluster and endpoint into one call: it costs one
  remote request, which matters for sleepy devices.** ZBD § configureAttributeReporting.
- **Not all devices support reporting and not all attributes are reportable;
  check the Zigbee Cluster Library Specification.** ZG § Commands and Attributes; ZBD.
- **The library stores the applied configuration under
  `CONFIGURED_ATTRIBUTE_REPORTING_STORE_KEY` with `lastUpdated`, retries twice,
  and does not skip a remote call because the store already matches.** ZBD;
  source: `lib/ZigBeeDevice.js`. Automatic configuration via `reportOpts` runs
  on first init only, with one retry on the next end device announce (source).
- **Periodic reports are recommended for SEDs so Homey can see the device is
  alive; Homey "may use this information" to flag unresponsive devices.**
  ZG § Attribute Reporting.
- **`readReportingConfiguration` returns only the "reported" direction.** ZCL.
- **`registerAttrReportListener` and `registerReportListener` are deprecated
  (use `configureAttributeReporting` and `BoundCluster`).**
  https://apps.developer.homey.app/upgrade-guides/upgrading-to-sdk-v3/upgrading-zigbee.md.

## Debugging and logging

- **`const { debug } = require('zigbee-clusters'); debug(true);` in `device.js`
  logs all ZCL traffic; "It is not recommended to keep this debug logging enabled
  when publishing your app."** ZG § Debugging. `debug(flag, namespaces = '*')`
  enables every `debug`-module namespace, not only this library's (source:
  zigbee-clusters `index.js`).
- **`this.enableDebug()` turns on `this.debug(...)` output prefixed `[dbg]`;
  `this.printNode()` logs endpoints, clusters and whether the node is sleepy
  without any remote call.** ZBD; source.
- **`this.log` and `this.error` emit `__log` and `__error`; `homey app run`
  streams them to the terminal.** https://apps-sdk-v3.developer.homey.app/SimpleClass.html;
  CLI § homey app run.
- **Zigbee developer tools (tools.developer.homey.app/tools/zigbee): nodes table
  with Online, Receive When Idle, Manufacturer and Model ID, last route; the
  Interview button needs the node online and returns `endpointDescriptors` and
  per-cluster attributes and reporting configuration; Refresh Nodes loads the
  network; channel change is "a very radical change".** guides/tools/zigbee.md.
- **Review-stage testing checklist: device controls, advanced settings, custom
  Flow cards, external state changes, pairing text, error messages, labels,
  hints, translations.** GL § 3.2.

## CLI and running on a Homey Pro

- **Node.js 24 or later and `npm install --global homey`; Docker is required for
  `run`, `build`, `validate` and `publish` on Homey Pro (Early 2023) and later.**
  https://apps.developer.homey.app/the-basics/getting-started.md; CLI § Requirements.
- **`homey app run` builds in a local Docker container exposed to the selected
  Homey and streams logs; Ctrl+C uninstalls the app. `--remote` runs on the Homey
  itself (automatic on 2016 to 2019 models, slower rebuilds). `--clean` wipes
  userdata, paired devices and settings. `--skip-build`, `--link-modules`,
  `--network host`, `--docker-socket-path`.** CLI § homey app run.
- **`homey app install` builds and installs without streaming; the app stays.**
  CLI § homey app install.
- **`homey login` opens OAuth2 in a browser and stores the session in
  `~/.homey/`; `HOMEY_PAT` skips the dialogue, recommended for CI.** CLI § Authentication.
- **`homey select [--id | --name]` sets the target Homey for run, install and
  `homey api`.** CLI § homey select.
- **`homey app driver create`, `homey app flow create`, `homey app driver flow`,
  `homey app driver capabilities`, `homey app translate` (OpenAI, review the
  output).** CLI. A `homey app zigbee interview` command is not documented; the
  interview is done in the developer tools. guides/tools/zigbee.md.
- **`--path` points any `homey app` command at another directory; `--json` and
  `--jq` give machine-readable output where supported.** CLI § Global Options.

## Validation, versioning, changelog and publishing

- **`homey app validate --level debug|publish|verified`; `publish` is the default
  and required for the App Store; `verified` adds `platforms`, `connectivity`
  and `support` and is required for Verified Developers and Homey Cloud. `run`,
  `install` and `publish` validate automatically.** CLI § homey app validate;
  https://apps.developer.homey.app/app-store/publishing.md.
- **`homey app version patch|minor|major|x.y.z [--changelog.<lang> "..."]
  [--commit]` bumps `version` and writes `.homeychangelog.json`; `--commit`
  creates a git commit and tag.** CLI § homey app version.
- **Changelog: only user-relevant changes since the previous Live version,
  grouped as Added, Changed, Deprecated, Removed, Fixed, Security.**
  https://apps.developer.homey.app/app-store/updates.md § Changelog.
- **Submitted version must be higher than the current Live version; Homey never
  downgrades; to patch Live while a higher Test build exists, submit a version
  below the Test one, then re-release the Test build with a higher number.**
  updates.md § Version bumps, § Test versions.
- **`homey app publish` validates, builds, uploads, and prompts for version and
  changelog if missing. In the dashboard (tools.developer.homey.app, Apps SDK,
  My Apps) the build is Draft, then Test (visible only via the Test link) or
  Live. A never-released app must be certified by an Athom reviewer; untick
  "publish directly after approval" to keep a Test release.** publishing.md.
- **Review takes up to two weeks; findings must be implemented; apps unmaintained
  for two years with a working alternative may be hidden or removed.** GL § 3.
- **GitHub Marketplace actions exist for validate, version and publish.** publishing.md.
- **New submissions must be SDK v3; apps must be free; donations go through
  `contributing.donate`.** GL § 1.14, § 2.3.

## Test tooling through the Web API

Not for the app itself (`homey:manager:api` is rejected in device apps,
permissions.md); for scripts that exercise the app from a workstation.

- **`npm install homey-api` (Node.js 22 or later); `HomeyAPI.createLocalAPI({
  address: 'http://192.168.1.123:80', token, debug })` returns a `HomeyAPIV3Local`;
  `token` is "A Personal Access Token created in the Homey Web App".**
  https://athombv.github.io/node-homey-api/ ; .../HomeyAPI.html § createLocalAPI.
  How to create the token is not documented on these pages; the support article
  "Getting started with API Keys" (support.homey.app article 8178797067292) could
  not be fetched.
- **`homeyApi.devices.getDevices()` (scope `homey.device.readonly`, `GET
  /api/manager/devices/device`); `getDevice({ id })`;
  `setCapabilityValue({ deviceId, capabilityId, value })` (scope
  `homey.device.control`, `PUT /api/manager/devices/device/:deviceId/capability/:capabilityId`);
  `getCapabilityValue`; `getDeviceSettingsObj`; `setDeviceSettings`.**
  https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerDevices.html.
- **Realtime values: `device.makeCapabilityInstance(capabilityId, listener)`
  returns a `DeviceCapability` with `value`, `lastChanged`, `setValue(value)` and
  `destroy()`, which unsubscribes from the device's realtime events when it is
  the last instance.** .../HomeyAPIV3Local.ManagerDevices.Device.html;
  .../HomeyAPIV3.ManagerDevices.Device.DeviceCapability.html.
- **Managers expose `connect()`, `disconnect()`, `isConnected()` and `destroy()`
  for their Socket.io namespace; `devices` emits `device.create`,
  `device.update`, `device.delete`, `capability.*`.**
  .../HomeyAPIV3.Manager.html; ManagerDevices page.
- **Raw Socket.io: websocket transport only, `pingTimeout` 8000 ms,
  `pingInterval` 5000 ms; `handshakeClient { token, homeyId }`; `subscribe` to
  `homey:device:<id>` for capability updates.**
  https://api.developer.homey.app/http-and-socket.io/socket.io-specification.md.
- **Prefer `localUrlSecure` over `localUrl` over `remoteUrl`; all can change.**
  https://api.developer.homey.app/http-and-socket.io/http-specification.md.

## Not stated in the docs

Checked across the pages above; absence means the agent must not assert it.

- Any rate limit, throttle or request quota for the Homey Web API, Socket.io or
  `homey-api` (the only limit is 100 Homey Pro users per API client; api.developer.homey.app llms-full.txt).
- How to create, scope or revoke the Personal Access Token / API key (support article unfetched).
- Whether a second `registerCapabilityListener` on a capability warns or replaces.
- The effect of throwing inside a generic capability listener (DEV is silent; the
  energy page states it for `target_power`).
- Size limits for the device store or app settings; when the store is cleared.
- A maximum number of settings or string lengths.
- Timing of `getOnStart` reads relative to `onNodeInit` completion (library source only).
- A request queue or serialisation inside `homey-zigbeedriver` or `zigbee-clusters`.
- `learnmode` field semantics (only the example shows `image` and `instruction`).
- Pixel sizes for images on the manifest page (given only in the guidelines).
- `module.exports` versus `export default` for TypeScript apps; `.homeyignore` handling.
- Which `tsconfig` base to extend (the example uses `@tsconfig/node12`).
- Whether `homeyCommunityTopicId` is required.
- Trademark symbols in app names.
- How the changelog is displayed to users.
- Whether `createNotification` needs a permission.
- The `thermostat` versus `heater` choice for a floor heating thermostat.
- Event names on `DeviceCapability` beyond the generic EventEmitter methods.
- A documented `homey app zigbee interview` CLI command.
