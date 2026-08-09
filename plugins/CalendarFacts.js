'use strict';

const {
  pick,
  say
} = require('../utils/helper');

function calendarSubject() {
  switch (pick([0, 1, 2, 3, 4, 5])) {
    case 0: {
      const event = pick([
        `${pick(['fall', 'spring'])} equinox`,
        `${pick(['winter', 'summer'])} ${pick(['solstice', 'olympics'])}`,
        `${pick(['earliest', 'latest'])} ${pick(['sunrise', 'sunset'])}`,
        `${pick(['harvest', 'super', 'blood'])} moon`
      ]);
      return `the ${event}`;
    }
    case 1:
      return `daylight ${pick(['saving', 'savings'])} time`;
    case 2:
      return `leap ${pick(['day', 'year'])}`;
    case 3:
      return 'Toyota Truck Month';
    case 4:
      return 'Easter';
    default:
      return 'Shark Week';
  }
}

function calendarBehavior() {
  return pick([
    `happens ${pick(['earlier', 'later', 'at the wrong time'])} every year`,
    `drifts out of sync with the ${pick([
      pick(['sun', 'moon', 'zodiac']),
      `${pick(['gregorian', 'mayan', 'lunar', 'iPhone'])} calendar`,
      'atomic clock in Colorado'
    ])}`,
    `might ${pick(['not happen', 'happen twice'])} this year`
  ]);
}

function calendarCause() {
  return pick([
    `time zone legislation in ${pick(['Indiana', 'Arizona', 'Russia'])}`,
    'a decree by the pope in the 1500s',
    `${pick(['precession', 'liberation', 'nutation', 'libation', 'eccentricity', 'obliquity'])} of the ${pick([
      'moon',
      'sun',
      "Earth's axis",
      'equator',
      'prime meridian',
      `${pick(['international date', 'mason-dixon'])} line`
    ])}`,
    'magnetic field reversal',
    `an arbitrary decition by ${pick(['Benjamin Franklin', 'Isaac Newton', 'FDR'])}`
  ]);
}

function calendarConsequence() {
  return pick([
    'it causes a predictable increase in car accidents.',
    "that's why we have leap seconds.",
    'scientists are really worried.',
    `it was even more extreme during the ${pick(['bronze age.', 'ice age.', 'createous.', '1990s.'])}`,
    `there's a proposal to fix it, but it ${pick([
      'will never happen.',
      'actually makes things worse.',
      'is stalled in congress.',
      'might be unconstitutional.'
    ])}`,
    "it's getting worse and no one knows why."
  ]);
}

function buildCalendarFact() {
  return `Did you know that ${calendarSubject()} ${calendarBehavior()} because of ${calendarCause()}? Apparently ${calendarConsequence()}`;
}

module.exports = {
  name: 'CalendarFacts',
  commands: [{
    name: 'calendarfacts',
    aliases: ['calfacts'],
    help: 'Calendar facts based on xkcd comic #1930'
  }],

  init() {
    console.log('[CalendarFacts] initialized');
  },

  handleCommand(ctx) {
    say(ctx, buildCalendarFact());
  },

  buildCalendarFact
};
