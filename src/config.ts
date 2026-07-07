/** Blend color when both people have tried a cuisine. */
export const PURPLE = '#8b6fd8'
/** Wishlist / warm accent. */
export const AMBER = '#c98a2e'

/**
 * Countries whose cuisines are genuinely hard to find as diaspora restaurants —
 * unlocking one of these is a "rare find".
 */
export const RARE_CODES = new Set([
  'BT', 'KM', 'KI', 'NR', 'TV', 'PW', 'MH', 'FM', 'SS', 'TD', 'CF', 'ER',
  'DJ', 'GW', 'GQ', 'ST', 'TL', 'BN', 'MV', 'SM', 'AD', 'LI', 'MC', 'VU',
  'SB', 'TO', 'WS', 'TM', 'GA', 'LS', 'SZ', 'BI', 'NE', 'MR',
])

/**
 * Demonyms for restaurant search queries ("Georgian restaurant" beats
 * "Georgia restaurant"). Anything missing falls back to the country name.
 */
export const DEMONYMS: Record<string, string> = {
  AF: 'Afghan', AL: 'Albanian', AR: 'Argentinian', AM: 'Armenian', AU: 'Australian',
  AT: 'Austrian', BD: 'Bangladeshi', BE: 'Belgian', BO: 'Bolivian', BA: 'Bosnian',
  BR: 'Brazilian', BG: 'Bulgarian', KH: 'Cambodian', CA: 'Canadian', CL: 'Chilean',
  CN: 'Chinese', CO: 'Colombian', HR: 'Croatian', CU: 'Cuban', CY: 'Cypriot',
  CZ: 'Czech', DK: 'Danish', DO: 'Dominican', EC: 'Ecuadorian', EG: 'Egyptian',
  ET: 'Ethiopian', FJ: 'Fijian', FI: 'Finnish', FR: 'French', GE: 'Georgian',
  DE: 'German', GH: 'Ghanaian', GR: 'Greek', GT: 'Guatemalan', HT: 'Haitian',
  HN: 'Honduran', HU: 'Hungarian', IS: 'Icelandic', IN: 'Indian', ID: 'Indonesian',
  IR: 'Persian', IQ: 'Iraqi', IE: 'Irish', IL: 'Israeli', IT: 'Italian',
  JM: 'Jamaican', JP: 'Japanese', JO: 'Jordanian', KZ: 'Kazakh', KE: 'Kenyan',
  KR: 'Korean', KP: 'North Korean', LA: 'Laotian', LB: 'Lebanese', LY: 'Libyan',
  MG: 'Malagasy', MY: 'Malaysian', ML: 'Malian', MX: 'Mexican', MN: 'Mongolian',
  MA: 'Moroccan', MM: 'Burmese', NP: 'Nepalese', NL: 'Dutch', NZ: 'New Zealand',
  NG: 'Nigerian', NO: 'Norwegian', PK: 'Pakistani', PA: 'Panamanian', PY: 'Paraguayan',
  PE: 'Peruvian', PH: 'Filipino', PL: 'Polish', PT: 'Portuguese', RO: 'Romanian',
  RU: 'Russian', SA: 'Saudi Arabian', SN: 'Senegalese', RS: 'Serbian', SG: 'Singaporean',
  SK: 'Slovak', SI: 'Slovenian', SO: 'Somali', ZA: 'South African', ES: 'Spanish',
  LK: 'Sri Lankan', SD: 'Sudanese', SE: 'Swedish', CH: 'Swiss', SY: 'Syrian',
  TW: 'Taiwanese', TZ: 'Tanzanian', TH: 'Thai', TN: 'Tunisian', TR: 'Turkish',
  UA: 'Ukrainian', GB: 'British', US: 'American', UY: 'Uruguayan', UZ: 'Uzbek',
  VE: 'Venezuelan', VN: 'Vietnamese', YE: 'Yemeni', ZM: 'Zambian', ZW: 'Zimbabwean',
}

export function cuisineName(code: string, countryName: string): string {
  return DEMONYMS[code] ?? countryName
}
