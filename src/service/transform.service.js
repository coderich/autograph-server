const Case = require('change-case');
// const Errors = require('./error.service');

const stripRegexp = new RegExp('[^A-Z0-9\\[\\]?*{}.!]', 'gi');

exports.toCase = (type) => {
  switch (type.toLowerCase()) {
    case 'lower': return val => val.toLowerCase();
    case 'upper': return val => val.toUpperCase();
    case 'title': return val => Case.capitalCase(val.toLowerCase(), { stripRegexp });
    default: return val => val;
  }
};
