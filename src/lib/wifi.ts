import { Capacitor } from '@capacitor/core';

/**
 * Get the current WiFi SSID.
 * - On native (Android): uses @capgo/capacitor-wifi plugin
 * - On web: returns null (browsers cannot read SSID)
 */
export async function getWifiSSID(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    return null; // Web browsers can't read SSID
  }

  try {
    const { Wifi } = await import('@capgo/capacitor-wifi');
    const result = await Wifi.getSSID();
    // The plugin returns the SSID with quotes on some devices, strip them
    const ssid = (result?.ssid || '').replace(/^"|"$/g, '').trim();
    return ssid || null;
  } catch (e) {
    console.warn('WiFi SSID detection failed:', e);
    return null;
  }
}
