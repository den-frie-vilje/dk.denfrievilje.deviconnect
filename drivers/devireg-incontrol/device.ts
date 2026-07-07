const DeviThermostatDevice = require('../../lib/DeviThermostatDevice');

class DeviIncontrolDevice extends DeviThermostatDevice {

  // localTemperatureCalibration is upstream-verified on InControl only
  get supportsCalibration() {
    return true;
  }

}

module.exports = DeviIncontrolDevice;
