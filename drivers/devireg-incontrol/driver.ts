const Homey = require('homey');

class DeviIncontrolDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('DeviIncontrolDriver has been initialized');
  }

}

module.exports = DeviIncontrolDriver;
