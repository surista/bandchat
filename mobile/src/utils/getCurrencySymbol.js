const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '\u20AC' },
  { code: 'GBP', symbol: '\u00A3' },
  { code: 'JPY', symbol: '\u00A5' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'CHF', symbol: 'Fr' },
  { code: 'CNY', symbol: '\u00A5' },
  { code: 'SEK', symbol: 'kr' },
  { code: 'NZD', symbol: 'NZ$' },
  { code: 'MXN', symbol: 'MX$' },
  { code: 'SGD', symbol: 'S$' },
  { code: 'HKD', symbol: 'HK$' },
  { code: 'NOK', symbol: 'kr' },
  { code: 'DKK', symbol: 'kr' },
  { code: 'KRW', symbol: '\u20A9' },
  { code: 'INR', symbol: '\u20B9' },
  { code: 'BRL', symbol: 'R$' },
  { code: 'ZAR', symbol: 'R' },
  { code: 'PHP', symbol: '\u20B1' },
  { code: 'THB', symbol: '\u0E3F' },
];

export default function getCurrencySymbol(code) {
  return CURRENCIES.find(c => c.code === (code || 'USD'))?.symbol || '$';
}

export { CURRENCIES };
