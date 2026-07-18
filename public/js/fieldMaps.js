/*
 * Human-readable decoding for the raw codes the survey form submits.
 * Every <input value="..."> / <option value="..."> in the public form has
 * a matching entry here so the admin dashboard can show real words
 * instead of camelCase JS values like "5to15" or "notforme".
 *
 * Exposed as a global `FieldMaps` object (no build step / bundler in this
 * project, so this stays a plain script tag loaded before dashboard.js).
 */
(function (global) {
  'use strict';

  const MAPS = {
    ageGroup: {
      under18: 'Under 18',
      '18to24': '18 – 24',
      '25to34': '25 – 34',
      '35to44': '35 – 44',
      '45to60': '45 – 60',
      '60plus': '60+',
    },
    role: {
      user: 'Everyday user',
      student: 'Student',
      developer: 'Developer or engineer',
      designer: 'Designer',
      founder: 'Founder or operator',
      other: 'Other',
    },
    category: {
      productivity: 'Productivity & Organization',
      development: 'Development & Tools',
      creative: 'Creative & Content',
      business: 'Business & Finance',
      health: 'Health & Wellness',
      education: 'Education & Learning',
      communication: 'Communication & Community',
      other: 'Something else entirely',
    },
    severity: {
      mild: 'Mild annoyance',
      frustrating: 'Genuinely frustrating',
      costly: 'Actively costing time or money',
      unbearable: 'Borderline unbearable',
    },
    timeCost: {
      under30: 'Under 30 minutes',
      '30to2h': '30 minutes – 2 hours',
      '2to5h': '2 – 5 hours',
      '5plus': 'More than 5 hours',
      unsure: 'Hard to say',
    },
    frequency: {
      multiple: 'Multiple times a day',
      daily: 'Daily',
      weekly: 'A few times a week',
      occasional: 'Occasionally',
      once: 'Only once, but it mattered',
    },
    currentSolution: {
      nothing: 'Nothing — just deals with it',
      manual: 'A manual process (notes, spreadsheets)',
      existing: 'An existing app or tool',
      workaround: 'A workaround combining several tools',
    },
    whyStopped: {
      expensive: 'Too expensive for what it does',
      complex: 'Too complex to justify using',
      missing: 'Missing the one feature they actually need',
      stoppedworking: 'It broke, changed, or stopped being maintained',
      stillusing: 'Actually still using it, just not fully happy',
    },
    frustrationTags: {
      slow: 'Too slow',
      complicated: 'Too complicated',
      expensive: 'Too expensive',
      missing: 'Missing key features',
      outdated: 'Feels outdated',
      trust: 'Hard to trust',
      steps: 'Too many steps',
      notforme: 'Not built for people like them',
    },
    platformPref: {
      web: 'A web app',
      mobile: 'A mobile app',
      extension: 'A browser extension',
      desktop: 'A desktop app',
      any: "Doesn't matter",
    },
    featurePriorities: {
      speed: 'Speed',
      simplicity: 'Simplicity',
      automation: 'Automation',
      integrations: 'Integrations',
      offline: 'Offline support',
      collaboration: 'Collaboration',
      customization: 'Customization',
      security: 'Security & privacy',
    },
    wouldUse: {
      definitely: 'Definitely would use it',
      probably: 'Probably would use it',
      unsure: 'Not sure',
      no: 'Probably would not use it',
    },
    wouldPay: {
      onetime: 'Yes, a one-time price',
      subscription: 'Yes, a subscription',
      freemium: "Only if there's a free option",
      free: "No — needs to be free",
    },
    priceRange: {
      u5: 'Under $5',
      '5to15': '$5 – $15',
      '15to40': '$15 – $40',
      '40plus': '$40+',
    },
    urgency: {
      now: 'As soon as possible',
      month: 'Within a month or two',
      whenever: "Whenever it's ready",
    },
    contactMethod: {
      email: 'Email',
      phone: 'Phone',
      either: 'Either works',
    },
  };

  // Short forms for tight spaces like table cells / badges.
  const SHORT = {
    severity: {
      mild: 'Mild',
      frustrating: 'Frustrating',
      costly: 'Costly',
      unbearable: 'Unbearable',
    },
    wouldUse: {
      definitely: 'Definitely',
      probably: 'Probably',
      unsure: 'Not sure',
      no: 'Probably not',
    },
    wouldPay: {
      onetime: 'One-time',
      subscription: 'Subscription',
      freemium: 'Freemium only',
      free: 'Free only',
    },
    category: {
      productivity: 'Productivity',
      development: 'Development',
      creative: 'Creative',
      business: 'Business',
      health: 'Health',
      education: 'Education',
      communication: 'Communication',
      other: 'Other',
    },
  };

  // Sentiment used purely for badge coloring — not a judgment on the
  // person's answer, just a quick visual read of "good/neutral/bad" signal
  // strength so a scanning eye can spot the interesting rows fast.
  const TONE = {
    severity: { mild: 'neutral', frustrating: 'warn', costly: 'warn', unbearable: 'bad' },
    wouldUse: { definitely: 'good', probably: 'good', unsure: 'neutral', no: 'bad' },
    wouldPay: { onetime: 'good', subscription: 'good', freemium: 'neutral', free: 'bad' },
  };

  const FIELD_LABELS = {
    referenceCode: 'Reference code',
    name: 'Name',
    email: 'Email',
    ageGroup: 'Age group',
    role: 'Describes them as',
    category: 'Problem area',
    problemDescription: 'The problem, in their words',
    severity: 'How bad it is',
    timeCost: 'Time it costs them',
    frequency: 'How often it comes up',
    currentSolution: 'What they use today',
    rating: 'Rating of current solution',
    triedAlternatives: 'Alternatives already tried',
    whyStopped: 'Why they stopped using it',
    frustrationTags: 'What frustrates them about it',
    frustrationText: 'In their own words',
    idealDescription: 'Their ideal solution',
    mustHave: 'One non-negotiable feature',
    platformPref: 'Preferred platform',
    featurePriorities: 'What they\u2019d prioritize',
    wouldUse: 'Would they use it',
    wouldPay: 'Would they pay for it',
    priceRange: 'Price they\u2019d accept',
    urgency: 'How urgently they want it',
    consent: 'Consented to data use',
    openToContact: 'Open to follow-up contact',
    contactMethod: 'Preferred contact method',
    contactValue: 'Contact info',
    bestTime: 'Best time to reach them',
    betaInterest: 'Interested in beta access',
    clientSubmittedAt: 'Submitted (their device clock)',
    serverReceivedAt: 'Received (server clock)',
    ip: 'IP address',
    browser: 'Browser',
    os: 'Operating system',
    device: 'Device',
  };

  function label(field) {
    return FIELD_LABELS[field] || field;
  }

  function decode(field, value) {
    if (value === null || value === undefined || value === '') return null;
    const dict = MAPS[field];
    if (!dict) return String(value);
    return dict[value] || String(value);
  }

  function decodeShort(field, value) {
    if (value === null || value === undefined || value === '') return null;
    const dict = (SHORT[field] && SHORT[field]) || MAPS[field];
    if (!dict) return String(value);
    return dict[value] || String(value);
  }

  function decodeList(field, values) {
    if (!Array.isArray(values) || !values.length) return [];
    return values.map((v) => decode(field, v) || v);
  }

  function tone(field, value) {
    return (TONE[field] && TONE[field][value]) || 'neutral';
  }

  global.FieldMaps = { label, decode, decodeShort, decodeList, tone };
})(window);
