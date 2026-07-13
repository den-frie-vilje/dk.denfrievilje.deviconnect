const { Cluster, ZCLDataTypes } = require('zigbee-clusters');

// HVAC User Interface Configuration cluster (0x0204) is not implemented by
// zigbee-clusters, so define the attributes we need. keypadLockout backs the
// child lock ("locked") capability; zigbee2mqtt configures reporting for it
// on the DEVIreg InControl.
class DeviUserInterfaceCluster extends Cluster {

  static get ID() {
    return 516; // 0x0204
  }

  static get NAME() {
    return 'hvacUserInterfaceConfiguration';
  }

  static get ATTRIBUTES() {
    return {
      temperatureDisplayMode: {
        id: 0,
        type: ZCLDataTypes.enum8({
          celsius: 0,
          fahrenheit: 1,
        }),
      },
      keypadLockout: {
        id: 1,
        type: ZCLDataTypes.enum8({
          noLockout: 0,
          levelOneLockout: 1,
          levelTwoLockout: 2,
          levelThreeLockout: 3,
          levelFourLockout: 4,
          levelFiveLockout: 5,
        }),
      },
    };
  }

  static get COMMANDS() {
    return {};
  }

}

module.exports = DeviUserInterfaceCluster;
