/* eslint-disable no-unused-vars */
const { ZigBeeDevice } = require('homey-zigbeedriver');
const { CLUSTER, Cluster } = require('zigbee-clusters');
const DeviConnectThermostatCluster = require('./deviConnectThermostatCluster');
const DeviTimeCluster = require('./deviTimeCluster');
const DeviUserInterfaceCluster = require('./deviUserInterfaceCluster');
const DeviTemperatureMeasurementCluster = require('./deviTemperatureMeasurementCluster');

// Enable debug logging of all relevant Zigbee communication
// const { debug } = require('zigbee-clusters');
// debug(true);

Cluster.addCluster(DeviConnectThermostatCluster);
Cluster.addCluster(DeviTimeCluster);
Cluster.addCluster(DeviUserInterfaceCluster);
Cluster.addCluster(DeviTemperatureMeasurementCluster);

// int16 sentinel the firmware reports when a sensor is absent or faulty
const INVALID_TEMPERATURE = -32768;
// Zigbee UTCTime epoch is 2000-01-01T00:00:00Z
const ZIGBEE_EPOCH_OFFSET_S = 946684800;
const TIME_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Fallback for devices that have not been re-paired yet and therefore have
// no thermostat binding towards Homey (reports won't arrive without one)
const POLL_INTERVAL_MS = 15 * 60 * 1000;
// v2: heaterOn moved to a separate manufacturer-specific configuration call
const REPORTING_STORE_KEY = 'reporting_configured_v2';

const DEFAULT_SETPOINT_LIMITS = { min: 5, max: 35 };

class DeviThermostatDevice extends ZigBeeDevice {

  // Firmware before 03.49 clamps setpoint writes that cross below 15 °C in
  // one step; fixed in 03.49 and later (confirmed by Danfoss). Apply the
  // workaround on older firmware, and when the version is unknown to be safe.
  needsLowSetpointWorkaround() {
    const version = String(this.getSetting('firmware_version') || '');
    const match = version.match(/^(\d+)\.(\d+)/);
    if (!match) return true;
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    return major < 3 || (major === 3 && minor < 49);
  }

  // localTemperatureCalibration is only verified on DEVIreg InControl
  get supportsCalibration() {
    return false;
  }

  async onNodeInit({ zclNode }: any) {
    this.setpointLimits = { ...DEFAULT_SETPOINT_LIMITS };

    if (!this.hasCapability('operational_state')) {
      await this.addCapability('operational_state');
    }
    if (!this.hasCapability('locked')) {
      await this.addCapability('locked');
    }

    const thermostatEndpoint = this.getClusterEndpoint(CLUSTER.THERMOSTAT) ?? 1;
    this.thermostatEndpoint = thermostatEndpoint;

    const getOpts = {
      getOnStart: true,
      getOnOnline: true,
      pollInterval: POLL_INTERVAL_MS,
    };

    // localTemperature is the regulation temperature: the floor sensor in
    // floor control mode, the estimated temperature in room/combi mode
    this.registerCapability('measure_temperature', CLUSTER.THERMOSTAT, {
      report: 'localTemperature',
      reportParser: (value: any) => this.parseTemperature(value),
      get: 'localTemperature',
      getParser: (value: any) => this.parseTemperature(value),
      getOpts,
    });

    this.registerCapability('target_temperature', CLUSTER.THERMOSTAT, {
      report: 'occupiedHeatingSetpoint',
      reportParser: (value: any) => this.parseTemperature(value),
      get: 'occupiedHeatingSetpoint',
      getParser: (value: any) => this.parseTemperature(value),
      getOpts,
    });

    this.registerCapability('operational_state', CLUSTER.THERMOSTAT, {
      report: 'heaterOn',
      reportParser: (value: any) => this.parseHeaterOn(value),
      get: 'heaterOn',
      getParser: (value: any) => this.parseHeaterOn(value),
      getOpts,
    });

    this.registerCapability('locked', DeviUserInterfaceCluster, {
      report: 'keypadLockout',
      reportParser: (value: any) => value !== 'noLockout',
      get: 'keypadLockout',
      getParser: (value: any) => value !== 'noLockout',
      set: 'writeAttributes',
      setParser: (value: any) => ({
        keypadLockout: value ? 'levelOneLockout' : 'noLockout',
      }),
      getOpts,
    });

    // Custom listener (replaces the one registerCapability installs, hence
    // the harmless "already registered" warning): the sub-15 °C workaround
    // needs a two-step write with a delay, which set/setParser cannot express.
    this.registerCapabilityListener('target_temperature', async (value: any) => {
      return this.writeSetpoint(value);
    });

    // Live updates when the setpoint limits are changed on the device itself
    this.thermostatCluster()
      .on('attr.minHeatSetpointLimit', (value: any) => {
        this.applySetpointLimits(value, undefined).catch(this.error);
      })
      .on('attr.maxHeatSetpointLimit', (value: any) => {
        this.applySetpointLimits(undefined, value).catch(this.error);
      });

    // Per the Danfoss documentation measuredValue is the floor sensor and
    // temperatureRoom the (optional) room sensor; -32768 = not available
    this.temperatureMeasurementCluster()
      .on('attr.measuredValue', (value: any) => {
        this.updateSensorCapability('measure_temperature.floor', value).catch(this.error);
      })
      .on('attr.temperatureRoom', (value: any) => {
        this.updateSensorCapability('measure_temperature.room', value).catch(this.error);
      });

    // The capability shipped briefly under a wrong name/meaning; migrate
    if (this.hasCapability('measure_temperature.external')) {
      await this.removeCapability('measure_temperature.external');
    }

    await this.runMaintenance(false);

    this.homey.setInterval(() => {
      this.syncDeviceTime().catch(this.error);
    }, TIME_SYNC_INTERVAL_MS);
  }

  // Fires when the device (re)joins the network, e.g. after Homey's
  // "Try to repair" or a power cycle. A factory-reset device loses its
  // reporting configuration and clock, so re-apply both.
  async onEndDeviceAnnounce() {
    this.log('Device announced itself, re-syncing time, reporting and limits');
    await this.runMaintenance(true);
  }

  // Homey's repair flow fires a device announce AND a fresh onNodeInit at
  // nearly the same moment; running two identical request sequences against
  // a freshly-joined device makes responses time out. Single-flight: while
  // one maintenance run is active, further calls await it instead.
  async runMaintenance(force: boolean) {
    if (this.maintenancePromise) return this.maintenancePromise;
    this.maintenancePromise = (async () => {
      try {
        await this.syncDeviceTime();
        await this.ensureAttributeReporting(force);
        await this.syncSetpointLimits();
        await this.detectSensors();
        // A firmware update reboots the device, so refresh the version too
        await this.readFirmwareVersion();
      } finally {
        this.maintenancePromise = null;
      }
    })();
    return this.maintenancePromise;
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: any) {
    if (changedKeys.includes('load_watts')) {
      const heaterOn = this.getCapabilityValue('operational_state') === 'running';
      await this.updatePowerEstimate(heaterOn, newSettings.load_watts);
    }
    if (changedKeys.includes('temperature_calibration') && this.supportsCalibration) {
      // localTemperatureCalibration is an int8 in units of 0.1 °C
      await this.thermostatCluster().writeAttributes({
        localTemperatureCalibration: Math.round(newSettings.temperature_calibration * 10),
      });
    }
  }

  thermostatCluster() {
    return this.zclNode.endpoints[this.thermostatEndpoint]
      .clusters[CLUSTER.THERMOSTAT.NAME];
  }

  temperatureMeasurementCluster() {
    const endpoint = this.getClusterEndpoint(CLUSTER.TEMPERATURE_MEASUREMENT)
      ?? this.thermostatEndpoint;
    return this.zclNode.endpoints[endpoint].clusters[CLUSTER.TEMPERATURE_MEASUREMENT.NAME];
  }

  timeCluster() {
    const endpoint = this.getClusterEndpoint(CLUSTER.TIME) ?? this.thermostatEndpoint;
    return this.zclNode.endpoints[endpoint].clusters[CLUSTER.TIME.NAME];
  }

  parseTemperature(value: any) {
    if (typeof value !== 'number' || value === INVALID_TEMPERATURE) return null;
    return value / 100;
  }

  parseHeaterOn(value: any) {
    const heaterOn = Boolean(value);
    this.updatePowerEstimate(heaterOn).catch(this.error);
    return heaterOn ? 'running' : 'stopped';
  }

  async writeSetpoint(value: number) {
    const { min, max } = this.setpointLimits;
    const setpoint = Math.round(Math.max(min, Math.min(max, value)) * 100);
    try {
      if (this.needsLowSetpointWorkaround() && setpoint < 1500) {
        // Firmware clamps the setpoint at 15 °C when crossing below it in a
        // single write; write 15 °C first, let the display settle, then write
        // the real value (same workaround as zigbee2mqtt uses)
        await this.thermostatCluster().writeAttributes({ occupiedHeatingSetpoint: 1500 });
        await new Promise((resolve) => this.homey.setTimeout(resolve, 3000));
      }
      await this.thermostatCluster().writeAttributes({ occupiedHeatingSetpoint: setpoint });
    } catch (err) {
      this.error('Failed to write occupiedHeatingSetpoint', err);
      // Rethrow so the Homey UI shows the failure and reverts the value
      throw err;
    }
  }

  // Reads the configured setpoint limits from the device and applies them to
  // the target_temperature capability, falling back to the absolute limits
  async syncSetpointLimits() {
    try {
      const {
        minHeatSetpointLimit, maxHeatSetpointLimit,
      } = await this.thermostatCluster().readAttributes(['minHeatSetpointLimit', 'maxHeatSetpointLimit']);
      if (await this.applySetpointLimits(minHeatSetpointLimit, maxHeatSetpointLimit)) return;

      const {
        absMinHeatSetpointLimit, absMaxHeatSetpointLimit,
      } = await this.thermostatCluster().readAttributes(['absMinHeatSetpointLimit', 'absMaxHeatSetpointLimit']);
      await this.applySetpointLimits(absMinHeatSetpointLimit, absMaxHeatSetpointLimit);
    } catch (err) {
      this.error('Failed to read setpoint limits, keeping current values', err);
    }
  }

  async applySetpointLimits(minRaw: any, maxRaw: any) {
    const min = typeof minRaw === 'number' && minRaw !== INVALID_TEMPERATURE
      ? minRaw / 100 : this.setpointLimits.min;
    const max = typeof maxRaw === 'number' && maxRaw !== INVALID_TEMPERATURE
      ? maxRaw / 100 : this.setpointLimits.max;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return false;

    this.setpointLimits = { min, max };

    let currentOptions: any = {};
    try {
      currentOptions = this.getCapabilityOptions('target_temperature') || {};
    } catch (err) {
      // No options set yet
    }
    if (currentOptions.min !== min || currentOptions.max !== max) {
      await this.setCapabilityOptions('target_temperature', {
        ...currentOptions, min, max, step: 0.5,
      });
      this.log(`Setpoint limits from device: ${min}–${max} °C`);
    }
    return true;
  }

  // Reads both sensors once; the capabilities are only added when the sensor
  // actually delivers a value (manufacturer-specific attributes cannot share
  // a read with standard ones, hence two calls)
  async detectSensors() {
    try {
      const { measuredValue } = await this.temperatureMeasurementCluster()
        .readAttributes(['measuredValue']);
      await this.updateSensorCapability('measure_temperature.floor', measuredValue);
    } catch (err) {
      this.log('Floor sensor not readable (optional)');
    }
    try {
      const { temperatureRoom } = await this.temperatureMeasurementCluster()
        .readAttributes(['temperatureRoom']);
      await this.updateSensorCapability('measure_temperature.room', temperatureRoom);
    } catch (err) {
      this.log('Room sensor not readable (optional)');
    }
  }

  async updateSensorCapability(capabilityId: string, value: any) {
    const temperature = this.parseTemperature(value);
    if (temperature === null) return;
    if (!this.hasCapability(capabilityId)) {
      await this.addCapability(capabilityId);
      await this.setCapabilityOptions(capabilityId, {
        title: capabilityId === 'measure_temperature.floor'
          ? { en: 'Floor sensor', da: 'Gulvføler' }
          : { en: 'Room temperature', da: 'Rumtemperatur' },
      });
      this.log(`Sensor detected, capability ${capabilityId} added`);
    }
    await this.setCapabilityValue(capabilityId, temperature);
  }

  // Estimated power draw derived from the heating relay state and the
  // heating element wattage configured by the user (0 disables the feature)
  async updatePowerEstimate(heaterOn: boolean, loadWattsOverride?: number) {
    const loadWatts = typeof loadWattsOverride === 'number'
      ? loadWattsOverride
      : this.getSetting('load_watts') || 0;
    if (loadWatts > 0) {
      if (!this.hasCapability('measure_power')) {
        await this.addCapability('measure_power');
      }
      await this.setCapabilityValue('measure_power', heaterOn ? loadWatts : 0);
    } else if (this.hasCapability('measure_power')) {
      await this.removeCapability('measure_power');
    }
  }

  // Configures ZCL attribute reporting. Reports only arrive when the device
  // also has a binding towards Homey (created by Homey core at pair/repair
  // time from the manifest `bindings` array). The store flag prevents
  // re-configuring on every app restart; a device announce forces a re-run
  // because a factory reset wipes the device's reporting configuration.
  async ensureAttributeReporting(force = false) {
    if (!force && this.getStoreValue(REPORTING_STORE_KEY) === true) return;

    // Standard thermostat attributes in one batch. heaterOn is configured
    // separately below: it is manufacturer-specific and a ZCL frame cannot
    // mix manufacturer-specific and standard attributes.
    try {
      await this.configureAttributeReporting([
        {
          endpointId: this.thermostatEndpoint,
          cluster: CLUSTER.THERMOSTAT,
          attributeName: 'localTemperature',
          minInterval: 60,
          maxInterval: 3600,
          minChange: 10, // 0.1 °C
        },
        {
          endpointId: this.thermostatEndpoint,
          cluster: CLUSTER.THERMOSTAT,
          attributeName: 'occupiedHeatingSetpoint',
          minInterval: 0,
          maxInterval: 3600,
          minChange: 10,
        },
      ]);
      await this.setStoreValue(REPORTING_STORE_KEY, true);
      this.log('Thermostat attribute reporting configured');
    } catch (err) {
      // Flag stays unset so this retries on the next init
      this.error('Failed to configure thermostat attribute reporting', err);
    }

    // The remaining attributes are configured one call each and tolerate
    // failure: heaterOn/temperatureRoom are manufacturer-specific, the floor
    // sensor may be absent, and keypad lockout config is flaky on devi_c.
    const optionalConfigurations = [
      [{
        endpointId: this.thermostatEndpoint,
        cluster: CLUSTER.THERMOSTAT,
        attributeName: 'heaterOn',
        minInterval: 0,
        maxInterval: 3600,
        minChange: 1,
      }],
      [{
        endpointId: this.getClusterEndpoint(CLUSTER.TEMPERATURE_MEASUREMENT)
          ?? this.thermostatEndpoint,
        cluster: CLUSTER.TEMPERATURE_MEASUREMENT,
        attributeName: 'measuredValue',
        minInterval: 10,
        maxInterval: 3600,
        minChange: 100, // 1 °C, matches zigbee2mqtt
      }],
      [{
        endpointId: this.getClusterEndpoint(CLUSTER.TEMPERATURE_MEASUREMENT)
          ?? this.thermostatEndpoint,
        cluster: CLUSTER.TEMPERATURE_MEASUREMENT,
        attributeName: 'temperatureRoom',
        minInterval: 60,
        maxInterval: 3600,
        minChange: 10,
      }],
      [{
        endpointId: this.getClusterEndpoint(DeviUserInterfaceCluster)
          ?? this.thermostatEndpoint,
        cluster: DeviUserInterfaceCluster,
        attributeName: 'keypadLockout',
        minInterval: 10,
        maxInterval: 3600,
        minChange: 1,
      }],
    ];
    for (const configuration of optionalConfigurations) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.configureAttributeReporting(configuration);
      } catch (err) {
        this.log(`Reporting not configured for ${configuration[0].attributeName} (optional)`);
      }
    }
  }

  // DEVI/Danfoss firmware never requests the time on its own; the hub is
  // expected to write it (zigbee2mqtt does the same for Danfoss devices).
  // Writes ZCL UTCTime (seconds since 2000-01-01 UTC).
  async syncDeviceTime() {
    try {
      await this.timeCluster().writeAttributes({
        time: this.zigbeeTimestamp(),
        timeStatus: ['synchronized'],
      });
      this.log('Device time synchronized');
    } catch (err) {
      this.error('Failed to sync device time', err);
    }
  }

  zigbeeTimestamp() {
    return Math.round(Date.now() / 1000) - ZIGBEE_EPOCH_OFFSET_S;
  }

  // Refreshed on every init and on device announce: the firmware can change
  // over the device's lifetime and needsLowSetpointWorkaround() depends on it
  async readFirmwareVersion() {
    try {
      const endpoint = this.getClusterEndpoint(CLUSTER.BASIC) ?? this.thermostatEndpoint;
      const { swBuildId } = await this.zclNode.endpoints[endpoint]
        .clusters[CLUSTER.BASIC.NAME].readAttributes(['swBuildId']);
      const version = swBuildId ? String(swBuildId).replace(/\0/g, '') : '';
      if (version && version !== this.getSetting('firmware_version')) {
        await this.setSettings({ firmware_version: version });
        this.log(`Firmware version: ${version}`);
      }
    } catch (err) {
      this.log('Could not read firmware version', err);
    }
  }

}

module.exports = DeviThermostatDevice;
