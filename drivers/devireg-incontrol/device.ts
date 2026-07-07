const DeviThermostatDevice = require('../../lib/DeviThermostatDevice');

class DeviIncontrolDevice extends DeviThermostatDevice {

  // devi_f firmware clamps setpoint writes crossing below 15 °C in one step
  get lowSetpointWorkaround() {
    return true;
  }

  // localTemperatureCalibration is upstream-verified on InControl only
  get supportsCalibration() {
    return true;
  }

}

module.exports = DeviIncontrolDevice;
