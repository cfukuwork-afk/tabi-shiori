// タイムゾーン → 国（行った国の数え上げ用）。よく行く国を中心に
import { Trip } from './data';
import { AIRPORT_TZ } from './airports';

export const TZ_CC: Record<string, string> = {
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'MO', 'Asia/Taipei': 'TW', 'Asia/Bangkok': 'TH',
  'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
  'Asia/Phnom_Penh': 'KH', 'Asia/Vientiane': 'LA', 'Asia/Yangon': 'MM', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Kathmandu': 'NP', 'Asia/Colombo': 'LK',
  'Indian/Maldives': 'MV', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Riyadh': 'SA', 'Asia/Jerusalem': 'IL', 'Asia/Istanbul': 'TR', 'Europe/Istanbul': 'TR',
  'Asia/Ulaanbaatar': 'MN', 'Asia/Tashkent': 'UZ', 'Asia/Almaty': 'KZ',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Lisbon': 'PT',
  'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU', 'Europe/Warsaw': 'PL', 'Europe/Copenhagen': 'DK', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI',
  'Atlantic/Reykjavik': 'IS', 'Europe/Athens': 'GR', 'Europe/Zagreb': 'HR', 'Europe/Ljubljana': 'SI', 'Europe/Belgrade': 'RS', 'Europe/Bucharest': 'RO',
  'Europe/Sofia': 'BG', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Malta': 'MT', 'Europe/Monaco': 'MC', 'Asia/Nicosia': 'CY',
  'Europe/Moscow': 'RU', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Johannesburg': 'ZA', 'Africa/Nairobi': 'KE',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US', 'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US', 'Pacific/Guam': 'GU', 'Pacific/Saipan': 'MP', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Montreal': 'CA',
  'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Havana': 'CU', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR',
  'America/Santiago': 'CL', 'America/Lima': 'PE', 'America/Bogota': 'CO', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Darwin': 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ', 'Pacific/Tahiti': 'PF', 'Pacific/Palau': 'PW',
};

export const flag = (cc: string) => cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

/** 旅行で行った国（到着した空港・予定の場所のタイムゾーンから） */
export function tripCountries(trip: Trip): string[] {
  const out = new Set<string>();
  trip.bookings.forEach((b) => {
    if (b.cancelled) return;
    const zones = b.type === 'flight' ? [b.to ? AIRPORT_TZ[b.to.trim().toUpperCase()] : undefined] : [b.tz];
    zones.forEach((z) => z && TZ_CC[z] && out.add(TZ_CC[z]));
  });
  return [...out];
}

export function countriesOf(trips: Trip[], homeTz?: string): string[] {
  const home = homeTz ? TZ_CC[homeTz] : undefined;
  const all = new Set<string>();
  trips.forEach((t) => tripCountries(t).forEach((c) => c !== home && all.add(c)));
  return [...all];
}
