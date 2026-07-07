const { ThermostatCluster, ZCLDataTypes } = require('zigbee-clusters');

const DANFOSS_MANUFACTURER_ID = 0x1246;

class DeviConnectThermostatCluster extends ThermostatCluster {

  static get ATTRIBUTES() {
    return {
      ...super.ATTRIBUTES,
      // Relay status: 0 = open, 1 = closed. Manufacturer-specific per the
      // Danfoss documentation; firmware 03.49+ enforces the manufacturer
      // code for reads and reporting configuration.
      heaterOn: {
        id: 16394, // 0x400A
        type: ZCLDataTypes.uint8,
        manufacturerId: DANFOSS_MANUFACTURER_ID,
      },
    };
  }

}

module.exports = DeviConnectThermostatCluster;
