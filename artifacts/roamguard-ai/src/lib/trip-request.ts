export type TripRequestFields = {
  origin?: string;
  destination?: string;
  date?: string;
  deadline?: string;
  passengers?: number;
  budget?: number;
  preference?: string;
  accessibility?: string;
  comfort?: string;
};

const CITY_ALIASES: Array<{ name: string; aliases: string[] }> = [
  { name: 'Hyderabad', aliases: ['Hyderabad', 'హైదరాబాద్', 'హైదరాబాదు'] },
  { name: 'Bengaluru', aliases: ['Bengaluru', 'Bangalore', 'బెంగళూరు', 'బెంగుళూరు'] },
  { name: 'Chennai', aliases: ['Chennai', 'చెన్నై'] },
  { name: 'Mumbai', aliases: ['Mumbai', 'Bombay', 'ముంబై'] },
  { name: 'Pune', aliases: ['Pune', 'పుణె', 'పూణే'] },
  { name: 'Delhi', aliases: ['Delhi', 'New Delhi', 'ఢిల్లీ'] },
  { name: 'Vijayawada', aliases: ['Vijayawada', 'విజయవాడ'] },
  { name: 'Visakhapatnam', aliases: ['Visakhapatnam', 'Vizag', 'విశాఖపట్నం', 'వైజాగ్'] },
  { name: 'Kochi', aliases: ['Kochi', 'Cochin', 'కొచ్చి'] },
  { name: 'Mysuru', aliases: ['Mysuru', 'Mysore', 'మైసూరు'] },
  { name: 'Warangal', aliases: ['Warangal', 'వరంగల్'] },
  { name: 'Tirupati', aliases: ['Tirupati', 'తిరుపతి'] },
  { name: 'Guntur', aliases: ['Guntur', 'గుంటూరు'] },
  { name: 'Rajahmundry', aliases: ['Rajahmundry', 'Rajamahendravaram', 'రాజమండ్రి', 'రాజమహేంద్రవరం'] },
  { name: 'Thullur', aliases: ['Thullur', 'తుళ్లూరు'] },
  { name: 'Amaravati', aliases: ['Amaravati', 'Amaravathi', 'అమరావతి'] },
  { name: 'Kakinada', aliases: ['Kakinada', 'కాకినాడ'] },
  { name: 'Nellore', aliases: ['Nellore', 'నెల్లూరు'] },
  { name: 'Ongole', aliases: ['Ongole', 'ఒంగోలు'] },
  { name: 'Eluru', aliases: ['Eluru', 'ఏలూరు'] },
  { name: 'Anantapur', aliases: ['Anantapur', 'Anantapuram', 'అనంతపురం'] },
  { name: 'Kadapa', aliases: ['Kadapa', 'కడప'] },
  { name: 'Kurnool', aliases: ['Kurnool', 'కర్నూలు'] },
  { name: 'Srikakulam', aliases: ['Srikakulam', 'శ్రీకాకుళం'] },
  { name: 'Vizianagaram', aliases: ['Vizianagaram', 'విజయనగరం'] },
  { name: 'Bhimavaram', aliases: ['Bhimavaram', 'భీమవరం'] },
  { name: 'Machilipatnam', aliases: ['Machilipatnam', 'మచిలీపట్నం'] },
];

function canonicalCity(value: string): string {
  const clean = value.trim().replace(/[,.!?]+$/, '');
  const found = CITY_ALIASES.find(city =>
    city.aliases.some(alias => alias.toLowerCase() === clean.toLowerCase())
  );
  return found?.name ?? clean.replace(/\b\w/g, c => c.toUpperCase());
}

function findCities(text: string): Array<{ name: string; index: number }> {
  const normalized = text.normalize('NFC').toLocaleLowerCase();
  const matches: Array<{ name: string; index: number; length: number }> = [];

  for (const city of CITY_ALIASES) {
    for (const alias of city.aliases) {
      const needle = alias.normalize('NFC').toLocaleLowerCase();
      let start = 0;
      while (true) {
        const index = normalized.indexOf(needle, start);
        if (index < 0) break;
        matches.push({ name: city.name, index, length: needle.length });
        start = index + needle.length;
      }
    }
  }

  // Prefer the longest city match at the same position.
  matches.sort((a, b) => a.index - b.index || b.length - a.length);
  const result: Array<{ name: string; index: number }> = [];
  for (const match of matches) {
    if (result.some(item =>
      item.name === match.name ||
      (match.index >= item.index && match.index < item.index + item.name.length)
    )) continue;
    result.push({ name: match.name, index: match.index });
  }
  return result.sort((a, b) => a.index - b.index);
}

function localDateAtOffset(offset: number, now: Date): string {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseTravelDate(text: string, now: Date): string | undefined {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return undefined;
  }

  if (/\bday after tomorrow\b|ఎల్లుండి/iu.test(text)) return localDateAtOffset(2, now);
  if (/\btomorrow\b|రేపు/iu.test(text)) return localDateAtOffset(1, now);
  if (/\btoday\b|ఈరోజు|నేడు/iu.test(text)) return localDateAtOffset(0, now);

  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  const monthPattern = Object.keys(months).join('|');
  const patterns = [
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\.?\\s*(20\\d{2})?\\b`, 'i'),
    new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, 'i'),
  ];

  let day: number, month: number, year: number;
  const first = text.match(patterns[0]);
  const second = first ? null : text.match(patterns[1]);

  if (first) {
    day = Number(first[1]);
    month = months[first[2].toLowerCase()];
    year = first[3] ? Number(first[3]) : now.getFullYear();
  } else if (second) {
    month = months[second[1].toLowerCase()];
    day = Number(second[2]);
    year = second[3] ? Number(second[3]) : now.getFullYear();
  } else {
    return undefined;
  }

  if (day < 1 || day > 31) return undefined;
  let date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;

  // If the year was omitted and the date has already passed, use next year.
  if (!(first?.[3] || second?.[3]) && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    year++;
    date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDeadline(text: string): string | undefined {
  const english = text.match(
    /\b(?:(?:arrive|reach|get)\s+(?:by|before|around)\s+|(?:by|before)\s+)(?:(?:in the )?(?:morning|afternoon|evening|night)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
  );

  const telugu = text.match(
    /(ఉదయం|మధ్యాహ్నం|సాయంత్రం|రాత్రి)\s*(\d{1,2})(?::(\d{2}))?/u
  );

  const teluguClock = !telugu
    ? text.match(/(\d{1,2})(?::(\d{2}))?\s*గంట(?:ల)?(?:కు|లోపు|కల్లా)?/u)
    : null;

  let hour: number, minute: number, suffix: string;

  if (english) {
    hour = Number(english[1]);
    minute = Number(english[2] ?? '0');
    suffix = (english[3] ?? '').toLowerCase();
  } else if (telugu) {
    hour = Number(telugu[2]);
    minute = Number(telugu[3] ?? '0');
    suffix = telugu[1];
  } else if (teluguClock) {
    hour = Number(teluguClock[1]);
    minute = Number(teluguClock[2] ?? '0');
    suffix = '';
  } else {
    return undefined;
  }

  if (['pm', 'మధ్యాహ్నం', 'సాయంత్రం', 'రాత్రి'].includes(suffix) && hour < 12) hour += 12;
  if (['am', 'ఉదయం'].includes(suffix) && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;

  return [hour, minute].map(n => String(n).padStart(2, '0')).join(':');
}
const PASSENGER_WORDS: Record<string, number> = {
  one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ఒకరు: 1, ఇద్దరు: 2, ముగ్గురు: 3, నలుగురు: 4,
  ఒక్కరు: 1, ఇద్దరం: 2, ముగ్గురం: 3, నలుగురం: 4,
  ఐదుగురు: 5, ఆరుగురు: 6, ఏడుగురు: 7, ఎనిమిది: 8,
  okaru: 1, okkadu: 1, iddaru: 2, iddaram: 2,
  mugguru: 3, mugguram: 3, naluguru: 4, naluguram: 4,
  aiduguru: 5, aaruguru: 6, eduguru: 7, enimidhi: 8, enimidi: 8,
};

function parsePassengers(text: string): number | undefined {
  const numericPatterns = [
    /\b(\d+)\s*(?:people|passengers?|travellers?|travelers?|persons?|of us)\b/i,
    /\b(?:passengers?|people|travellers?|travelers?)\s*(?:are|:|-)?\s*(\d+)\b/i,
    /\b(?:for|with)\s+(\d+)\b/i,
    /(\d+)\s*మంది/u,
    /(\d+)\s*ప్రయాణికులు/u,
  ];

  for (const pattern of numericPatterns) {
    const match = text.match(pattern);
    if (match) {
      const count = Number(match[1]);
      if (Number.isInteger(count) && count >= 1 && count <= 100) return count;
    }
  }

  const wordPattern = /\b(one|a|an|two|three|four|five|six|seven|eight|nine|ten)\s+(?:passengers?|people|travellers?|travelers?|persons?)\b/i;
  const wordMatch = text.match(wordPattern);
  if (wordMatch) return PASSENGER_WORDS[wordMatch[1].toLowerCase()];

  const reverseWordPattern = /\b(?:passengers?|people|travellers?|travelers?)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
  const reverseMatch = text.match(reverseWordPattern);
  if (reverseMatch) return PASSENGER_WORDS[reverseMatch[1].toLowerCase()];

  const teluguWord = text.match(/(ఒకరు|ఒక్కరు|ఇద్దరు|ఇద్దరం|ముగ్గురు|ముగ్గురం|నలుగురు|నలుగురం|ఐదుగురు|ఆరుగురు|ఏడుగురు|ఎనిమిది)/u)?.[1];
  if (teluguWord) return PASSENGER_WORDS[teluguWord];

  const romanWord = text.match(/\b(okaru|okkadu|iddaru|iddaram|mugguru|mugguram|naluguru|naluguram|aiduguru|aaruguru|eduguru|enimidhi|enimidi)\b/i)?.[1];
  if (romanWord) return PASSENGER_WORDS[romanWord.toLowerCase()];
  return teluguWord ? PASSENGER_WORDS[teluguWord] : undefined;
}

export function extractTripRequest(text: string, now = new Date()): TripRequestFields {
  const lower = text.toLocaleLowerCase();
  const cities = findCities(text);

  // Parse English and romanized/Telugu routes.
  const routePatterns = [
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:on|tomorrow|today|by|before|arrive|for|with|under|budget|people|passengers?|members?)\b|[,.;!?]|$)/i,
    /(.+?)\s+nunchi\s+(.+?)\s+(?:ki|ku|varaku)(?=\s|[,.;!?]|$)/i,
    /(.+?)\s+(?:నుంచి|నుండి)\s*(.+?)\s*(?:కి|కు|వరకు)(?=\s|[,.;!?]|$)/u,
  ];

  const routeMatch = routePatterns.map(pattern => text.match(pattern)).find(Boolean);
  let origin: string | undefined;
  let destination: string | undefined;

  if (routeMatch) {
    const fromText = routeMatch[1].trim();
    const toText = routeMatch[2].trim();
    origin = findCities(fromText)[0]?.name ?? canonicalCity(fromText);
    destination = findCities(toText)[0]?.name ?? canonicalCity(toText);
  } else if (cities.length >= 2) {
    origin = cities[0].name;
    destination = cities[1].name;
  }

  const date = parseTravelDate(text, now);
  const deadline = parseDeadline(text);
  const passengers = parsePassengers(text);

  const budgetMatch = text.match(/(?:under|within|max(?:imum)?|budget(?:\s*(?:is|of|under))?)\s*(?:₹|rs\.?\s*|rupees?\s*)?([\d,]+)/i)
    ?? text.match(/(?:₹|rs\.?\s*|rupees?\s*)([\d,]+)/i)
    ?? text.match(/([\d,]+)\s*(?:రూ(?:పాయలు?)?\.?\s*)(?:లోపు|మించకూడదు)?/u);

  const preference = /\b(flights?|fly|plane)\b/i.test(text) ? 'Flight preferred'
    : /\b(buses?|coaches?)\b/i.test(text) || /బస్సు|బస్/u.test(text) ? 'Bus preferred'
    : /\b(trains?|rail)\b/i.test(text) || /రైలు|రైల్లో/u.test(text) ? 'Train preferred' : undefined;

  const accessibility = /\b(wheelchair|step-free|accessible)\b/i.test(text) || /వీల్.?చైర్|వికలాంగ/u.test(text)
    ? 'Step-free access requested'
    : /\b(visual assistance|hearing assistance)\b/i.test(text) || /సహాయం కావాలి/u.test(text)
      ? 'Assistance requested' : undefined;

  const comfort = /\b(comfort|premium|business|extra legroom)\b/i.test(text) || /సౌకర్యవంత|ఆరామ/u.test(text)
    ? 'Extra comfort requested' : undefined;

  return {
    ...(origin ? { origin } : {}),
    ...(destination ? { destination } : {}),
    ...(date ? { date } : {}),
    ...(deadline ? { deadline } : {}),
    ...(passengers ? { passengers } : {}),
    ...(budgetMatch ? { budget: Number(budgetMatch[1].replaceAll(',', '')) } : {}),
    ...(preference ? { preference } : {}),
    ...(accessibility ? { accessibility } : {}),
    ...(comfort ? { comfort } : {}),
  };
}
