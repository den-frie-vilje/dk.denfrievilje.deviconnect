/* eslint-disable no-unused-vars */
const { ZigBeeDevice } = require('homey-zigbeedriver');
const { CLUSTER, Cluster } = require('zigbee-clusters');
const DeviConnectThermostatCluster = require('./deviConnectThermostatCluster');
const DeviTimeCluster = require('./deviTimeCluster');
const DeviUserInterfaceCluster = require('./deviUserInterfaceCluster');

// Enable debug logging of all relevant Zigbee communication
// const { debug } = require('zigbee-clusters');
// debug(true);

Cluster.addCluster(DeviConnectThermostatCluster);
Cluster.addCluster(DeviTimeCluster);
Cluster.addCluster(DeviUserInterfaceCluster);

// int16 sentinel the firmware reports when a sensor is absent or faulty
const INVALID_TEMPERATURE = -32768;
// Zigbee UTCTime epoch is 2000-01-01T00:00:00Z
const ZIGBEE_EPOCH_OFFSET_S = 946684800;
const TIME_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Fallback for devices that have not been re-paired yet and therefore have
// no thermostat binding towards Homey (reports won't arrive without one)
const POLL_INTERVAL_MS = 15 * 60 * 1000;
const REPORTING_STORE_KEY = 'reporting_configured_v1';

const DEFAULT_SETPOINT_LIMITS = { min: 5, max: 35 };

class DeviThermostatDevice extends ZigBeeDevice {

  // DEVIreg InControl (devi_f) firmware clamps setpoint writes that cross
  // below 15 °C in one step; the InControl driver overrides this to true.
  get lowSetpointWorkaround() {
    return false;
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

    // On these devices localTemperature is the floor sensor
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
      getOpts,
    });

    // When changing target temperature in Homey. The manifest `set` option is
    // not used because occupiedHeatingSetpoint must be written as an
    // attribute, not sent as a cluster command.
    this.registerCapabilityListener('target_temperature', async (value: any) => {
      return this.writeSetpoint(value);
    });

    this.registerCapabilityListener('locked', async (value: any) => {
      try {
        await this.userInterfaceCluster().writeAttributes({
          keypadLockout: value ? 'levelOneLockout' : 'noLockout',
        });
      } catch (err) {
        this.error('Failed to write keypadLockout', err);
        throw err;
      }
    });

    // Live updates when the setpoint limits are changed on the device itself
    this.thermostatCluster()
      .on('attr.minHeatSetpointLimit', (value: any) => {
        this.applySetpointLimits(value, undefined).catch(this.error);
      })
      .on('attr.maxHeatSetpointLimit', (value: any) => {
        this.applySetpointLimits(undefined, value).catch(this.error);
      });

    // Optional external/room sensor on the temperatureMeasurement cluster,
    // reports -32768 when no sensor is connected
    this.temperatureMeasurementCluster()
      .on('attr.measuredValue', (value: any) => {
        this.onExternalTemperature(value).catch(this.error);
      });

    await this.syncSetpointLimits();
    await this.detectExternalSensor();
    await this.ensureAttributeReporting();
    await this.syncDeviceTime();
    await this.readFirmwareVersion();

    this.homey.setInterval(() => {
      this.syncDeviceTime().catch(this.error);
    }, TIME_SYNC_INTERVAL_MS);
  }

  // Fires when the device (re)joins the network, e.g. after Homey's
  // "Try to repair" or a power cycle. A factory-reset device loses its
  // reporting configuration and clock, so re-apply both.
  async onEndDeviceAnnounce() {
    this.log('Device announced itself, re-syncing time, reporting and limits');
    await this.syncDeviceTime();
    await this.ensureAttributeReporting(true);
    await this.syncSetpointLimits();
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

  userInterfaceCluster() {
    const endpoint = this.getClusterEndpoint(DeviUserInterfaceCluster) ?? this.thermostatEndpoint;
    return this.zclNode.endpoints[endpoint].clusters[DeviUserInterfaceCluster.NAME];
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
      if (this.lowSetpointWorkaround && setpoint < 1500) {
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

  async detectExternalSensor() {
    try {
      const { measuredValue } = await this.temperatureMeasurementCluster()
        .readAttributes(['measuredValue']);
      await this.onExternalTemperature(measuredValue);
    } catch (err) {
      this.log('External sensor not readable (optional)', err);
    }
  }

  async onExternalTemperature(value: any) {
    const temperature = this.parseTemperature(value);
    if (temperature === null) return;
    if (!this.hasCapability('measure_temperature.external')) {
      await this.addCapability('measure_temperature.external');
      await this.setCapabilityOptions('measure_temperature.external', {
        title: { en: 'External sensor', da: 'Ekstern føler' },
      });
      this.log('External temperature sensor detected, capability added');
    }
    await this.setCapabilityValue('measure_temperature.external', temperature);
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
        {
          endpointId: this.thermostatEndpoint,
          cluster: CLUSTER.THERMOSTAT,
          attributeName: 'heaterOn',
          minInterval: 0,
          maxInterval: 3600,
          minChange: 1,
        },
      ]);
      await this.setStoreValue(REPORTING_STORE_KEY, true);
      this.log('Thermostat attribute reporting configured');
    } catch (err) {
      // Flag stays unset so this retries on the next init
      this.error('Failed to configure thermostat attribute reporting', err);
    }

    // Optional clusters configured separately: failure here (e.g. no external
    // sensor connected) must not affect the thermostat configuration above
    try {
      await this.configureAttributeReporting([{
        endpointId: this.getClusterEndpoint(CLUSTER.TEMPERATURE_MEASUREMENT)
          ?? this.thermostatEndpoint,
        cluster: CLUSTER.TEMPERATURE_MEASUREMENT,
        attributeName: 'measuredValue',
        minInterval: 10,
        maxInterval: 3600,
        minChange: 100, // 1 °C, matches zigbee2mqtt
      }]);
    } catch (err) {
      this.log('External sensor reporting not configured (optional)');
    }

    try {
      await this.configureAttributeReporting([{
        endpointId: this.getClusterEndpoint(DeviUserInterfaceCluster)
          ?? this.thermostatEndpoint,
        cluster: DeviUserInterfaceCluster,
        attributeName: 'keypadLockout',
        minInterval: 10,
        maxInterval: 3600,
        minChange: 1,
      }]);
    } catch (err) {
      this.log('Keypad lockout reporting not configured (optional)');
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

  async readFirmwareVersion() {
    if (this.getSetting('firmware_version')) return;
    try {
      const endpoint = this.getClusterEndpoint(CLUSTER.BASIC) ?? this.thermostatEndpoint;
      const { swBuildId } = await this.zclNode.endpoints[endpoint]
        .clusters[CLUSTER.BASIC.NAME].readAttributes(['swBuildId']);
      if (swBuildId) {
        await this.setSettings({ firmware_version: String(swBuildId).replace(/\0/g, '') });
      }
    } catch (err) {
      this.log('Could not read firmware version', err);
    }
  }

}

module.exports = DeviThermostatDevice;
