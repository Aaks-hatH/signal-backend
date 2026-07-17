const CSV_COLUMNS = [
  'referenceCode',
  'serverReceivedAt',
  'name',
  'email',
  'ageGroup',
  'role',
  'category',
  'problemDescription',
  'severity',
  'timeCost',
  'frequency',
  'currentSolution',
  'rating',
  'triedAlternatives',
  'whyStopped',
  'frustrationTags',
  'frustrationText',
  'idealDescription',
  'mustHave',
  'platformPref',
  'featurePriorities',
  'wouldUse',
  'wouldPay',
  'priceRange',
  'urgency',
  'consent',
  'openToContact',
  'contactMethod',
  'contactValue',
  'bestTime',
  'betaInterest',
  'ip',
  'userAgentRaw',
  'parsedUA.browser',
  'parsedUA.os',
  'parsedUA.device',
];

function escapeCsvValue(value) {
  if (value === undefined || value === null) return '';
  let str;
  if (Array.isArray(value)) {
    str = value.join('; ');
  } else if (value instanceof Date) {
    str = value.toISOString();
  } else {
    str = String(value);
  }
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function submissionsToCsv(submissions) {
  const header = CSV_COLUMNS.join(',');
  const rows = submissions.map((sub) => {
    const obj = typeof sub.toObject === 'function' ? sub.toObject() : sub;
    return CSV_COLUMNS.map((col) => escapeCsvValue(getPath(obj, col))).join(',');
  });
  return [header, ...rows].join('\r\n');
}

module.exports = { submissionsToCsv };
