// Destinations people can pick from a list. Abroad ones carry the IATA code of the city or its airport;
// ones in Israel carry il: 1. A key ('rome', 'eilat') points at a destination built into the app.
// The order is the order the scheduled job builds them in, so the most asked-for come first.
export const DESTLIST = [
  { n: 'רומא', code: 'ROM', key: 'rome' }, { n: 'אתונה', code: 'ATH', key: 'athens' }, { n: 'בודפשט', code: 'BUD', key: 'budapest' },
  { n: 'לונדון', code: 'LON' }, { n: 'פריז', code: 'PAR' }, { n: 'ברצלונה', code: 'BCN' }, { n: 'פראג', code: 'PRG' }, { n: 'לרנקה', code: 'LCA' },
  { n: 'אמסטרדם', code: 'AMS' }, { n: 'ברלין', code: 'BER' }, { n: 'וינה', code: 'VIE' }, { n: 'מדריד', code: 'MAD' }, { n: 'מילאנו', code: 'MIL' },
  { n: 'ליסבון', code: 'LIS' }, { n: 'דובאי', code: 'DXB' }, { n: 'בטומי', code: 'BUS' }, { n: 'רודוס', code: 'RHO' }, { n: 'כרתים', code: 'HER' },
  { n: 'פאפוס', code: 'PFO' }, { n: 'סלוניקי', code: 'SKG' }, { n: 'קרקוב', code: 'KRK' }, { n: 'ורשה', code: 'WAW' }, { n: 'בוקרשט', code: 'BUH' },
  { n: 'סופיה', code: 'SOF' }, { n: 'ורנה', code: 'VAR' }, { n: 'טביליסי', code: 'TBS' }, { n: 'אבו דאבי', code: 'AUH' }, { n: 'בנגקוק', code: 'BKK' },
  { n: 'ניו יורק', code: 'NYC' }, { n: 'ציריך', code: 'ZRH' }, { n: 'מינכן', code: 'MUC' }, { n: 'ונציה', code: 'VCE' }, { n: 'פירנצה', code: 'FLR' },
  { n: 'נאפולי', code: 'NAP' }, { n: 'ניס', code: 'NCE' }, { n: 'מיורקה', code: 'PMI' }, { n: 'איסטנבול', code: 'IST' }, { n: 'אנטליה', code: 'AYT' },
  { n: 'קורפו', code: 'CFU' }, { n: 'זקינתוס', code: 'ZTH' }, { n: 'סנטוריני', code: 'JTR' }, { n: 'מיקונוס', code: 'JMK' }, { n: 'בורגס', code: 'BOJ' },
  { n: 'ריגה', code: 'RIG' }, { n: 'וילנה', code: 'VNO' }, { n: 'טאלין', code: 'TLL' }, { n: 'בלגרד', code: 'BEG' }, { n: 'זאגרב', code: 'ZAG' },
  { n: 'ספליט', code: 'SPU' }, { n: 'דוברובניק', code: 'DBV' }, { n: 'לובליאנה', code: 'LJU' }, { n: 'זלצבורג', code: 'SZG' }, { n: 'אינסברוק', code: 'INN' },
  { n: 'ז׳נבה', code: 'GVA' }, { n: 'פרנקפורט', code: 'FRA' }, { n: 'המבורג', code: 'HAM' }, { n: 'קלן', code: 'CGN' }, { n: 'בריסל', code: 'BRU' },
  { n: 'דבלין', code: 'DUB' }, { n: 'אדינבורו', code: 'EDI' }, { n: 'קופנהגן', code: 'CPH' }, { n: 'סטוקהולם', code: 'STO' }, { n: 'אוסלו', code: 'OSL' },
  { n: 'הלסינקי', code: 'HEL' }, { n: 'רייקיאוויק', code: 'REK' }, { n: 'מלטה', code: 'MLA' }, { n: 'טנריף', code: 'TCI' }, { n: 'מלגה', code: 'AGP' },
  { n: 'סביליה', code: 'SVQ' }, { n: 'ולנסיה', code: 'VLC' }, { n: 'פורטו', code: 'OPO' }, { n: 'ליון', code: 'LYS' }, { n: 'מרסיי', code: 'MRS' },
  { n: 'קטניה וסיציליה', code: 'CTA' }, { n: 'בולוניה', code: 'BLQ' }, { n: 'טירנה', code: 'TIA' }, { n: 'ירוואן', code: 'EVN' }, { n: 'באקו', code: 'BAK' },
  { n: 'מרקש', code: 'RAK' }, { n: 'פוקט', code: 'HKT' }, { n: 'באלי', code: 'DPS' }, { n: 'סינגפור', code: 'SIN' }, { n: 'טוקיו', code: 'TYO' },
  { n: 'סיאול', code: 'SEL' }, { n: 'הונג קונג', code: 'HKG' }, { n: 'מיאמי', code: 'MIA' }, { n: 'אורלנדו', code: 'MCO' }, { n: 'לוס אנג׳לס', code: 'LAX' },
  { n: 'סיישל', code: 'SEZ' }, { n: 'מאוריציוס', code: 'MRU' }, { n: 'זנזיבר', code: 'ZNZ' },
  { n: 'אילת', il: 1, key: 'eilat' }, { n: 'טבריה והכנרת', il: 1, key: 'galil' }, { n: 'ירושלים', il: 1, key: 'jlm' },
  { n: 'תל אביב-יפו', il: 1 }, { n: 'חיפה', il: 1 }, { n: 'ים המלח', il: 1 }, { n: 'רמת הגולן', il: 1 }, { n: 'מצפה רמון', il: 1 },
  { n: 'עכו', il: 1 }, { n: 'נהריה וראש הנקרה', il: 1 }, { n: 'צפת', il: 1 }, { n: 'עמק החולה', il: 1 }, { n: 'זכרון יעקב וקיסריה', il: 1 },
  { n: 'בית שאן ועמק המעיינות', il: 1 }, { n: 'ערד ומצדה', il: 1 }, { n: 'נצרת', il: 1 }, { n: 'נתניה', il: 1 }, { n: 'באר שבע', il: 1 },
  { n: 'אשקלון', il: 1 }, { n: 'הגליל המערבי', il: 1 }, { n: 'עמק יזרעאל', il: 1 }, { n: 'הכרמל', il: 1 }, { n: 'מטולה והגליל העליון', il: 1 },
  { n: 'הרצליה', il: 1 }, { n: 'רחובות ונס ציונה', il: 1 }, { n: 'אשדוד', il: 1 }, { n: 'שפלת יהודה ובית גוברין', il: 1 }, { n: 'קצרין', il: 1 },
];
export const destKey = (x) => (x.code ? 'code:' + x.code : 'il:' + x.n.toLowerCase());
