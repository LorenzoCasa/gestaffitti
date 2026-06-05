function inferYear(month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return month < currentMonth ? currentYear + 1 : currentYear;
}

function iso(day, month, year) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractNumericDates(text) {
  const re = /(?:dal\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:-|–|—|al)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i;
  const match = text.match(re);

  if (!match) {
    return { checkin: null, checkout: null };
  }

  const dayIn = Number(match[1]);
  const monthIn = Number(match[2]);
  const yearIn = match[3] ? Number(match[3]) : inferYear(monthIn);

  const dayOut = Number(match[4]);
  const monthOut = Number(match[5]);
  const yearOut = match[6] ? Number(match[6]) : inferYear(monthOut);

  if (
    monthIn < 1 || monthIn > 12 ||
    monthOut < 1 || monthOut > 12 ||
    dayIn < 1 || dayIn > 31 ||
    dayOut < 1 || dayOut > 31
  ) {
    return { checkin: null, checkout: null };
  }

  return {
    checkin: iso(dayIn, monthIn, yearIn),
    checkout: iso(dayOut, monthOut, yearOut),
  };
}



const MONTHS_IT = {
  gennaio:1, febbraio:2, marzo:3, aprile:4, maggio:5, giugno:6,
  luglio:7, agosto:8, settembre:9, ottobre:10, novembre:11, dicembre:12,
  gen:1, feb:2, mar:3, apr:4, mag:5, giu:6,
  lug:7, ago:8, set:9, ott:10, nov:11, dic:12,
};
const MONTH_NAMES_IT = Object.keys(MONTHS_IT)
  .sort((a, b) => b.length - a.length)
  .join("|");

function extractTextualDates(text) {
  const t = text.toLowerCase();

  // "10 al 17 agosto" / "dal 10 al 17 agosto" / "10-17 agosto"
  const rSame = new RegExp(
    "(\\d{1,2})\\s*(?:-|al)\\s*(\\d{1,2})\\s+(" + MONTH_NAMES_IT + ")(?:\\s+(\\d{4}))?",
    "i"
  );
  const mSame = t.match(rSame);
  if (mSame) {
    const month = MONTHS_IT[mSame[3].toLowerCase()];
    if (month) {
      const year = mSame[4] ? Number(mSame[4]) : inferYear(month);
      return {
        checkin:  iso(Number(mSame[1]), month, year),
        checkout: iso(Number(mSame[2]), month, year),
      };
    }
  }

  // "dal 10 agosto al 17 agosto"
  const rTwo = new RegExp(
    "(\\d{1,2})\\s+(" + MONTH_NAMES_IT + ")(?:\\s+(\\d{4}))?\\s*(?:-|al)\\s*(\\d{1,2})\\s+(" + MONTH_NAMES_IT + ")(?:\\s+(\\d{4}))?",
    "i"
  );
  const mTwo = t.match(rTwo);
  if (mTwo) {
    const m1 = MONTHS_IT[mTwo[2].toLowerCase()];
    const m2 = MONTHS_IT[mTwo[5].toLowerCase()];
    if (m1 && m2) {
      return {
        checkin:  iso(Number(mTwo[1]), m1, mTwo[3] ? Number(mTwo[3]) : inferYear(m1)),
        checkout: iso(Number(mTwo[4]), m2, mTwo[6] ? Number(mTwo[6]) : inferYear(m2)),
      };
    }
  }

  // "1 luglio 10 luglio" — two day+month groups separated only by whitespace
  const rSpaceOnly = new RegExp(
    "(\\d{1,2})\\s+(" + MONTH_NAMES_IT + ")(?:\\s+(\\d{4}))?\\s+(\\d{1,2})\\s+(" + MONTH_NAMES_IT + ")(?:\\s+(\\d{4}))?",
    "i"
  );
  const mSpace = t.match(rSpaceOnly);
  if (mSpace) {
    const m1 = MONTHS_IT[mSpace[2].toLowerCase()];
    const m2 = MONTHS_IT[mSpace[5].toLowerCase()];
    if (m1 && m2) {
      return {
        checkin:  iso(Number(mSpace[1]), m1, mSpace[3] ? Number(mSpace[3]) : inferYear(m1)),
        checkout: iso(Number(mSpace[4]), m2, mSpace[6] ? Number(mSpace[6]) : inferYear(m2)),
      };
    }
  }

  return { checkin: null, checkout: null };
}


function detectFullMonth(text) {
  const t = text.toLowerCase();
  const rTutto = new RegExp("\\btutto\\s+(" + MONTH_NAMES_IT + ")\\b", "i");
  const mTutto = t.match(rTutto);
  if (mTutto) {
    const num = MONTHS_IT[mTutto[1].toLowerCase()];
    if (num) return { isFullMonth: true, fullMonthNum: num };
  }
  const rMese = new RegExp(
    "(?:mese\\s+intero|tutto\\s+il\\s+mese)(?:\\s+di\\s+(" + MONTH_NAMES_IT + "))?",
    "i"
  );
  const mMese = t.match(rMese);
  if (mMese) {
    const num = mMese[1] ? (MONTHS_IT[mMese[1].toLowerCase()] ?? null) : null;
    return { isFullMonth: true, fullMonthNum: num };
  }
  return null;
}

function extractGuests(text) {
  const t = text.toLowerCase();

  // "2 adulti e 1 bambino" → somma
  const adultM = t.match(/(\d+)\s+adulti?/);
  const childM = t.match(/(\d+)\s+bambin[io]/);
  if (adultM && childM) return Number(adultM[1]) + Number(childM[1]);

  const patterns = [
    /siamo\s+in\s+(\d+)/,
    /siamo\s+(\d+)/,
    /per\s+(\d+)\s+person[ae]/,
    /(\d+)\s+person[ae]/,
    /(\d+)\s+adulti?/,
    /(\d+)\s+ospiti?/,
    /famiglia\s+di\s+(\d+)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 20) return n;
    }
  }

  return null;
}

function extractQuestions(text) {
  return text
    .split(/[.!]/)
    .map(s => s.trim())
    .filter(s => s.includes("?"));
}

// ── Flexible period extraction ────────────────────────────────────────────────
// Extracts month/week intent when no specific dates are present.
// Non-breaking: called only when checkin/checkout are null.

const NUM_WORDS = { 'una': 1, 'un': 1, 'uno': 1, 'due': 2, 'tre': 3, 'quattro': 4 };

function extractFlexiblePeriod(text) {
  const t = text.toLowerCase();

  // 1. Requested month — uses MONTH_NAMES_IT (sorted longest-first, avoids "ago"→"agosto" collision)
  let requestedMonth = null;
  const monthRe = new RegExp('\\b(' + MONTH_NAMES_IT + ')\\b', 'i');
  const monthM  = t.match(monthRe);
  if (monthM) requestedMonth = MONTHS_IT[monthM[1].toLowerCase()] ?? null;

  // 2. Requested weeks/nights
  let requestedWeeks = null;
  const weeksM = t.match(/\b(una|un|uno|due|tre|quattro|1|2|3|4)\s+settiman[ae]\b/i);
  if (weeksM) {
    const raw = weeksM[1].toLowerCase();
    requestedWeeks = NUM_WORDS[raw] ?? (parseInt(raw, 10) || null);
  }

  // 3. Week position — check multi-week patterns BEFORE single-week to avoid partial match
  let requestedWeekPosition = null;
  if (/\bprim[ae]\s+(due|2)\s+settiman[ae]\b/i.test(t)) {
    requestedWeekPosition = 'first_two';
  } else if (/\bultim[ae]\s+(due|2)\s+settiman[ae]\b/i.test(t)) {
    requestedWeekPosition = 'last_two';
  } else if (/\bprim[ae]\b/i.test(t) && /\bsettiman[ae]\b/i.test(t)) {
    requestedWeekPosition = 'first';
  } else if (/\bsecond[ae]\b/i.test(t) && /\bsettiman[ae]\b/i.test(t)) {
    requestedWeekPosition = 'second';
  } else if (/\bterz[ae]\b/i.test(t) && /\bsettiman[ae]\b/i.test(t)) {
    requestedWeekPosition = 'third';
  } else if (/\bultim[ae]\b/i.test(t) && /\bsettiman[ae]\b/i.test(t)) {
    requestedWeekPosition = 'last';
  }

  // "inizio / metà / fine [mese]" → map to week position (only if not already set by settimana patterns)
  if (!requestedWeekPosition && requestedMonth) {
    if (/\binizio\b/i.test(t))              requestedWeekPosition = 'first';
    else if (/\bmet[aà](?!\w)/i.test(t))   requestedWeekPosition = 'second';
    else if (/\bfine\b/i.test(t))          requestedWeekPosition = 'last';
  }

  // When position implies one or two weeks but no explicit number was given, infer it
  if (requestedWeekPosition && !requestedWeeks) {
    requestedWeeks = (requestedWeekPosition === 'first_two' || requestedWeekPosition === 'last_two') ? 2 : 1;
  }
  const requestedNights = requestedWeeks ? requestedWeeks * 7 : null;

  // isFlexibleDatesRequest: true when the client named a month without giving exact dates
  const isFlexibleDatesRequest = !!requestedMonth;

  return { requestedMonth, requestedWeeks, requestedNights, requestedWeekPosition, isFlexibleDatesRequest };
}

export function parseAgentInquiry(rawText, rawMetadata = {}) {
  const text = rawText || "";
  const _fm = detectFullMonth(text);
  let checkin = null, checkout = null;
  if (!_fm) {
    const _nd = extractNumericDates(text);
    const _dates = _nd.checkin ? _nd : extractTextualDates(text);
    checkin  = _dates.checkin;
    checkout = _dates.checkout;
  }
  const guests    = extractGuests(text);
  const questions = extractQuestions(text);

  // Extract flexible period fields only when no specific dates were found
  const flex = (!_fm && !checkin && !checkout)
    ? extractFlexiblePeriod(text)
    : { requestedMonth: null, requestedWeeks: null, requestedNights: null, requestedWeekPosition: null, isFlexibleDatesRequest: false };

  const missingFields = [];
  if (!checkin  && !_fm) missingFields.push("checkin");
  if (!checkout && !_fm) missingFields.push("checkout");
  if (!guests)           missingFields.push("guests");

  return {
    checkin,
    checkout,
    guests,
    offeredPrice: null,
    questions,
    intent:     (checkin && checkout) || _fm ? "availability_check" : "general_inquiry",
    confidence: (checkin && checkout) || _fm ? "medium" : "low",
    missingFields,
    warnings: [],
    isFullMonth:  _fm?.isFullMonth  ?? false,
    fullMonthNum: _fm?.fullMonthNum ?? null,
    // Flexible period fields (non-breaking additions)
    requestedMonth:         flex.requestedMonth,
    requestedWeeks:         flex.requestedWeeks,
    requestedNights:        flex.requestedNights,
    requestedWeekPosition:  flex.requestedWeekPosition,
    isFlexibleDatesRequest: flex.isFlexibleDatesRequest,
    isPriceQuery: /quanto\s+costa|prezz[oi]/i.test(text) && !checkin && !checkout && !_fm,
    rawMetadata,
  };
}
