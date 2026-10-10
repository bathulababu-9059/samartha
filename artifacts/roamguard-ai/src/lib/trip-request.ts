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
];

function localDateAtOffset(offset: number, now: Date) {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function findCities(text: string) {
  const normalized = text.normalize('NFC').toLocaleLowerCase();
  return CITY_ALIASES.map(city => {
    const occurrences = city.aliases
      .map(alias => normalized.indexOf(alias.normalize('NFC').toLocaleLowerCase()))
      .filter(index => index >= 0);
    return { name: city.name, index: occurrences.length ? Math.min(...occurrences) : -1 };
  })
    .filter(city => city.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(city => city.name);
}

function parseDeadline(text: string) {
  const english = text.match(/\b(?:by|before|arrive\s+by|arrive\s+before)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const telugu = text.match(/(ఉదయం|మధ్యాహ్నం|సాయంత్రం|రాత్రి)\s*(\d{1,2})(?::(\d{2}))?/u);
  const teluguClock = !telugu && /(?:లోపు|కల్లా|గంట)/u.test(text)
    ? text.match(/(\d{1,2})(?::(\d{2}))?\s*(?:గంట(?:ల)?(?:కు|లోపు|కల్లా)?)/u)
    : null;
  const match = english ?? (telugu ? [telugu[0], telugu[2], telugu[3], undefined, telugu[1]] : teluguClock);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = match[2] ?? '00';
  const suffix = (match[3] ?? match[4] ?? '').toLocaleLowerCase();
  if (['pm', 'మధ్యాహ్నం', 'సాయంత్రం', 'రాత్రి'].includes(suffix) && hour < 12) hour += 12;
  if ((suffix === 'am' || suffix === 'ఉదయం') && hour === 12) hour = 0;
  if (hour > 23 || Number(minute) > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function extractTripRequest(text: string, now = new Date()): TripRequestFields {
  const lower = text.toLocaleLowerCase();
  const cities = findCities(text);
  const routeMatch = text.match(/from\s+([a-zA-Z ]+?)\s+to\s+([a-zA-Z ]+?)(?:\s+(?:on|by|before|for|with)\b|[,.;]|$)/i);
  const origin = cities[0] || routeMatch?.[1]?.trim();
  const destination = cities[1] || routeMatch?.[2]?.trim();

  const explicitDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const relativeDate = /(?:\btomorrow\b|రేపు)/iu.test(text)
    ? localDateAtOffset(1, now)
    : /(?:\btoday\b|ఈరోజు|నేడు)/iu.test(text)
      ? localDateAtOffset(0, now)
      : undefined;
  const deadline = parseDeadline(text);

  const passenger = text.match(/(\d+)\s*(?:people|passengers|travellers|travelers|of us|మంది|ప్రయాణికులు)/i)
    ?? text.match(/\b(?:for|with)\s+(\d+)\b/i);
  const passengerWord = lower.match(/(ఒకరు|ఇద్దరు|ముగ్గురు|నలుగురు)/u)?.[1];
  const passengerWords: Record<string, number> = { ఒకరు: 1, ఇద్దరు: 2, ముగ్గురు: 3, నలుగురు: 4 };

  const budgetMatch = text.match(/(?:under|within|max(?:imum)?|budget(?:\s*(?:is|of|under))?)\s*(?:₹|rs\.?\s*|rupees?\s*)?([\d,]+)/i)
    ?? text.match(/(?:₹|rs\.?\s*|rupees?\s*)([\d,]+)/i)
    ?? text.match(/([\d,]+)\s*(?:రూ(?:పాయలు?)?\.?\s*)(?:లోపు|మించకూడదు)?/u);
  const preference = /\b(flights?|fly|plane)\b/i.test(text) ? 'Flight preferred'
    : /\b(buses?|coaches?)\b/i.test(text) || /బస్సు|బస్/u.test(text) ? 'Bus preferred'
    : /\b(trains?|rail)\b/i.test(text) || /రైలు|రైల్లో/u.test(text) ? 'Train preferred' : '';
  const accessibility = /\b(wheelchair|step-free|accessible)\b/i.test(text) || /వీల్.?చైర్|వికలాంగ/u.test(text) ? 'Step-free access requested'
    : /\b(visual assistance|hearing assistance)\b/i.test(text) || /సహాయం కావాలి/u.test(text) ? 'Assistance requested' : '';
  const comfort = /\b(comfort|premium|business|extra legroom)\b/i.test(text) || /సౌకర్యవంత|ఆరామ/u.test(text) ? 'Extra comfort requested' : '';

  return {
    ...(origin ? { origin: CITY_ALIASES.find(city => city.name.toLocaleLowerCase() === origin.toLocaleLowerCase())?.name ?? titleCase(origin) } : {}),
    ...(destination ? { destination: CITY_ALIASES.find(city => city.name.toLocaleLowerCase() === destination.toLocaleLowerCase())?.name ?? titleCase(destination) } : {}),
    ...(explicitDate ? { date: explicitDate[1] } : relativeDate ? { date: relativeDate } : {}),
    ...(deadline ? { deadline } : {}),
    ...(passenger ? { passengers: Number(passenger[1]) } : passengerWord ? { passengers: passengerWords[passengerWord] } : {}),
    ...(budgetMatch ? { budget: Number(budgetMatch[1].replaceAll(',', '')) } : {}),
    ...(preference ? { preference } : {}),
    ...(accessibility ? { accessibility } : {}),
    ...(comfort ? { comfort } : {}),
  };
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, character => character.toUpperCase());
}
