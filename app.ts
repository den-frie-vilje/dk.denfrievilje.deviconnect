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
        en: "DEVIreg™ ZigBee: to enable instant status updates, open each thermostat → settings → Maintenance → 'Try to repair' (your Flows are kept). If repair does not help, remove and re-add the device.",
        nl: "DEVIreg™ ZigBee: voor directe statusupdates open je elke thermostaat → instellingen → Onderhoud → 'Probeer te repareren' (je Flows blijven behouden). Helpt repareren niet, verwijder het apparaat dan en voeg het opnieuw toe.",
        da: "DEVIreg™ ZigBee: for øjeblikkelige statusopdateringer skal du åbne hver termostat → indstillinger → Vedligeholdelse → 'Forsøg at reparere' (dine Flows bevares). Hjælper reparation ikke, skal du fjerne enheden og tilføje den igen.",
        de: "DEVIreg™ ZigBee: Für sofortige Statusaktualisierungen öffne jedes Thermostat → Einstellungen → Wartung → 'Reparieren versuchen' (deine Flows bleiben erhalten). Hilft das nicht, entferne das Gerät und füge es erneut hinzu.",
        es: "DEVIreg™ ZigBee: para actualizaciones de estado instantáneas, abre cada termostato → ajustes → Mantenimiento → 'Intentar reparar' (tus Flows se conservan). Si no ayuda, elimina el dispositivo y añádelo de nuevo.",
        fr: "DEVIreg™ ZigBee : pour des mises à jour d'état instantanées, ouvrez chaque thermostat → paramètres → Maintenance → 'Essayer de réparer' (vos Flows sont conservés). Si cela ne fonctionne pas, supprimez l'appareil et ajoutez-le à nouveau.",
        it: "DEVIreg™ ZigBee: per aggiornamenti di stato istantanei, apri ogni termostato → impostazioni → Manutenzione → 'Prova a riparare' (i tuoi Flow vengono conservati). Se non aiuta, rimuovi il dispositivo e aggiungilo di nuovo.",
        no: "DEVIreg™ ZigBee: for umiddelbare statusoppdateringer, åpne hver termostat → innstillinger → Vedlikehold → 'Prøv å reparere' (dine Flows beholdes). Hjelper det ikke, fjern enheten og legg den til på nytt.",
        sv: "DEVIreg™ ZigBee: för omedelbara statusuppdateringar, öppna varje termostat → inställningar → Underhåll → 'Försök reparera' (dina Flows behålls). Om det inte hjälper, ta bort enheten och lägg till den igen.",
        pl: "DEVIreg™ ZigBee: aby włączyć natychmiastowe aktualizacje stanu, otwórz każdy termostat → ustawienia → Konserwacja → 'Spróbuj naprawić' (Twoje Flow zostaną zachowane). Jeśli to nie pomoże, usuń urządzenie i dodaj je ponownie.",
        ru: "DEVIreg™ ZigBee: для мгновенных обновлений состояния откройте каждый термостат → настройки → Обслуживание → 'Попробовать восстановить' (ваши Flows сохранятся). Если это не поможет, удалите устройство и добавьте его снова.",
        ko: "DEVIreg™ ZigBee: 즉시 상태 업데이트를 사용하려면 각 온도 조절기 → 설정 → 유지 관리 → '복구 시도'를 선택하세요(Flow는 유지됩니다). 해결되지 않으면 장치를 제거한 후 다시 추가하세요.",
        ar: "DEVIreg™ ZigBee: لتفعيل تحديثات الحالة الفورية، افتح كل منظم حرارة ← الإعدادات ← الصيانة ← 'محاولة الإصلاح' (تبقى الـ Flows كما هي). إذا لم يُجدِ الإصلاح، فاحذف الجهاز وأضفه مرة أخرى.",
      }),
    });
    this.homey.settings.set(REPAIR_NOTIFICATION_FLAG, true);
    this.log('Repair instructions timeline notification sent');
  }

}

module.exports = DeviConnectApp;
