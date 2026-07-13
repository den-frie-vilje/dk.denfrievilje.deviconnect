const { TimeCluster, ZCLDataTypes, ZCLDataType } = require('zigbee-clusters');

// ZCL UTCTime (type id 0xE2): seconds since 2000-01-01 00:00:00 UTC.
// zigbee-clusters does not ship this data type, so define it by reusing
// the uint32 wire format (same 4-byte little-endian unsigned encoding).
const utcType = new ZCLDataType(
  226,
  'utc',
  4,
  ZCLDataTypes.uint32.toBuffer,
  ZCLDataTypes.uint32.fromBuffer,
);

// The Time cluster shipped with zigbee-clusters is an empty stub (no
// attributes), so writing the clock to the thermostat requires defining
// the attributes ourselves. DEVI/Danfoss firmware never requests the time
// on its own — the hub is expected to write it (see zigbee2mqtt danfoss.ts).
class DeviTimeCluster extends TimeCluster {

  static get ATTRIBUTES() {
    return {
      time: {
        id: 0,
        type: utcType,
      },
      timeStatus: {
        id: 1,
        // bit0 master, bit1 synchronized, bit2 masterZoneDst, bit3 superseding
        type: ZCLDataTypes.map8('master', 'synchronized', 'masterZoneDst', 'superseding'),
      },
    };
  }

}

module.exports = DeviTimeCluster;
