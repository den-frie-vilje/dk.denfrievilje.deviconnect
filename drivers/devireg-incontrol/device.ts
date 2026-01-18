/* eslint-disable no-unused-vars */
const { ZigBeeDevice } = require('homey-zigbeedriver');
const { debug, CLUSTER, Cluster } = require('zigbee-clusters');
const DeviConnectThermostatCluster = require('../../lib/deviConnectThermostatCluster');

// Enable debug logging of all relevant Zigbee communication
// debug(true);

Cluster.addCluster(DeviConnectThermostatCluster);

class DeviIncontrolDevice extends ZigBeeDevice {
  async onNodeInit({ zclNode }: any) {

    if (!this.hasCapability('operational_state')) {
      // Add  capability if not already added
      await this.addCapability('operational_state');
    }

    this.registerCapability('measure_temperature', CLUSTER.THERMOSTAT, {
      report: 'localTemperature',
      reportParser: (value: any) => value / 100,
      get: 'localTemperature',
      getParser: (value: any) => value / 100,
    });

    this.registerCapability('target_temperature', CLUSTER.THERMOSTAT, {
      report: 'occupiedHeatingSetpoint',
      reportParser: (value: any) => value / 100,
      get: 'occupiedHeatingSetpoint',
      getParser: (value: any) => value / 100,
      // set: "occupiedHeatingSetpoint", //Not working, use listener belove
      // setParser: (value: any) => value * 100,
    });

    this.registerCapability('operational_state', CLUSTER.THERMOSTAT, {
      report: 'heaterOn',
      reportParser: (value: any) => (value ? "running" : "stopped"),
      get: 'heaterOn',
      getParser: (value: any) => (value ? "running" : "stopped")
    });

    // When changing target temperature in Homey
    this.registerCapabilityListener(
      'target_temperature',
      async (value: any) => {
        this.zclNode.endpoints[1].clusters[CLUSTER.THERMOSTAT.NAME]
          .writeAttributes({
            occupiedHeatingSetpoint: value * 100,
          })
          .catch((e: any) => {
            this.error('Error write attr', e);
          });
      },
    );
  }
}

module.exports = DeviIncontrolDevice;
