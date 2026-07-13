const { TemperatureMeasurementCluster, ZCLDataTypes } = require('zigbee-clusters');

const DANFOSS_MANUFACTURER_ID = 0x1246;

// Per the Danfoss documentation measuredValue is the floor sensor, and the
// (optional) room sensor is exposed as a manufacturer-specific attribute.
class DeviTemperatureMeasurementCluster extends TemperatureMeasurementCluster {

  static get ATTRIBUTES() {
    return {
      ...super.ATTRIBUTES,
      temperatureRoom: {
        id: 16384, // 0x4000
        type: ZCLDataTypes.int16,
        manufacturerId: DANFOSS_MANUFACTURER_ID,
      },
    };
  }

}

module.exports = DeviTemperatureMeasurementCluster;
