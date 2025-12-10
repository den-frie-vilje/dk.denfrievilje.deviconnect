const Homey = require('homey');

class DeviConnectApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('DeviConnectApp has been initialized');
  }

}

module.exports = DeviConnectApp;
