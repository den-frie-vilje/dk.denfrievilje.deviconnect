const Homey = require('homey');

class DeviDisplayConnectDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('DeviDisplayConnectDriver has been initialized');
  }

}

module.exports = DeviDisplayConnectDriver;
