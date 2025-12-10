const { ThermostatCluster, ZCLDataTypes } = require("zigbee-clusters");

class DeviConnectThermostatCluster extends ThermostatCluster {
  
  static get ATTRIBUTES() {
    return {
      ...super.ATTRIBUTES,
      heaterOn: {
        id: 16394,
        type: ZCLDataTypes.bool,
      },
    };
  }
}

module.exports = DeviConnectThermostatCluster;
