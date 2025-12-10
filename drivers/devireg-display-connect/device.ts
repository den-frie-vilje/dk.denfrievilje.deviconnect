/* eslint-disable no-unused-vars */
const { ZigBeeDevice } = require('homey-zigbeedriver');
const { debug, CLUSTER } = require('zigbee-clusters');

// Enable debug logging of all relevant Zigbee communication
// debug(true);

class DeviDisplayConnectDevice extends ZigBeeDevice {
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

    this.zclNode.endpoints[1].clusters[
      CLUSTER.THERMOSTAT.NAME
    ].onReportAttributes = (
      args: any,
      meta: any,
      frame: any,
      rawFrame: any,
    ) => {
      if (frame?.cmdId === 10) {
        if (Buffer.from([0x0a, 0x40, 0x20, 0x01]).compare(frame.data) === 0) {
          this.setCapabilityValue('operational_state', 'running').catch(
            this.error,
          );
          // this.log("TÆNDT");
        } else if (
          Buffer.from([0x0a, 0x40, 0x20, 0x00]).compare(frame.data) === 0
        ) {
          this.setCapabilityValue('operational_state', 'paused').catch(
            this.error,
          );
          // this.log("SLUKKET");
        }
      }
    };

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

module.exports = DeviDisplayConnectDevice;
