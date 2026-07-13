const Homey = require('homey');

// One-shot timeline notification for users upgrading to 1.2.0: existing
// devices need a Zigbee re-join ("Try to repair") before the new instant
// updates work, because bindings are only created when a device (re)pairs.
// Remove together with the flag once 1.2.x adoption is behind us.
const REPAIR_NOTIFICATION_FLAG = 'repair_notification_1_2_0_sent';

class DeviConnectApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('DeviConnectApp has been initialized');

    // Delay so the drivers have loaded their devices; only notify existing
    // installations (fresh installs pair with correct bindings from the start)
    this.homey.setTimeout(() => {
      this.sendRepairNotificationOnce().catch(this.error);
    }, 30 * 1000);
  }

  async sendRepairNotificationOnce() {
    if (this.homey.settings.get(REPAIR_NOTIFICATION_FLAG) === true) return;

    const hasDevices = Object.values(this.homey.drivers.getDrivers())
      .some((driver: any) => driver.getDevices().length > 0);
    if (!hasDevices) return;

    await this.homey.notifications.createNotification({
      excerpt: this.homey.__({
        en: "DEVIreg™: for instant updates, open each thermostat → Maintenance → 'Try to repair' (Flows are kept).",
        nl: "DEVIreg™: voor directe updates, open elke thermostaat → Onderhoud → 'Probeer te repareren' (Flows blijven behouden).",
        da: "DEVIreg™: for øjeblikkelige opdateringer, åbn hver termostat → Vedligeholdelse → 'Forsøg at reparere' (Flows bevares).",
        de: "DEVIreg™: Für sofortige Updates öffne jedes Thermostat → Wartung → 'Reparieren versuchen' (Flows bleiben erhalten).",
        es: "DEVIreg™: para actualizaciones instantáneas, abre cada termostato → Mantenimiento → 'Intentar reparar' (los Flows se conservan).",
        fr: "DEVIreg™ : pour des mises à jour instantanées, ouvrez chaque thermostat → Maintenance → 'Essayer de réparer' (les Flows sont conservés).",
        it: "DEVIreg™: per aggiornamenti istantanei, apri ogni termostato → Manutenzione → 'Prova a riparare' (i Flow vengono conservati).",
        no: "DEVIreg™: for umiddelbare oppdateringer, åpne hver termostat → Vedlikehold → 'Prøv å reparere' (Flows beholdes).",
        sv: "DEVIreg™: för omedelbara uppdateringar, öppna varje termostat → Underhåll → 'Försök reparera' (Flows behålls).",
        pl: "DEVIreg™: aby uzyskać natychmiastowe aktualizacje, otwórz każdy termostat → Konserwacja → 'Spróbuj naprawić' (Flow zostaną zachowane).",
        ru: "DEVIreg™: для мгновенных обновлений откройте каждый термостат → Обслуживание → 'Попробовать восстановить' (Flows сохранятся).",
        ko: "DEVIreg™: 즉시 업데이트를 사용하려면 각 온도 조절기 → 유지 관리 → '복구 시도'를 선택하세요(Flow는 유지됩니다).",
        ar: "DEVIreg™: للتحديثات الفورية، افتح كل منظم حرارة ← الصيانة ← 'محاولة الإصلاح' (تبقى الـ Flows كما هي).",
      }),
    });
    this.homey.settings.set(REPAIR_NOTIFICATION_FLAG, true);
    this.log('Repair instructions timeline notification sent');
  }

}

module.exports = DeviConnectApp;
