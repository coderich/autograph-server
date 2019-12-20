// const PicoMatch = require('picomatch');
// const ToRegexRange = require('to-regex-range');
const {
  AllowRuleError,
  ImmutableRuleError,
  RangeRuleError,
  RequireRuleError,
} = require('./error.service');

exports.allow = (...args) => (val, op, path) => {
  if (args.indexOf(val) === -1) throw new AllowRuleError(`${path} must contain: { ${args.join(' ')} }, found '${val}'`);
};

exports.immutable = () => (val, op, path) => {
  if (op === 'update' && val !== undefined) throw new ImmutableRuleError(`${path} is immutable; cannot be changed once set`);
};


exports.range = (min, max) => {
  if (min == null) min = undefined;
  if (max == null) max = undefined;

  return (val) => {
    const num = Number(val);
    if (Number.isNaN(num)) throw new RangeRuleError(`${val} is not a valid number`);
    if (num < min) throw new RangeRuleError(`${val} cannot be less than ${min}`);
    if (num > max) throw new RangeRuleError(`${val} cannot be greater than ${max}`);
  };
};

exports.required = () => (val, op, path) => {
  if (op === 'create' && val == null) throw new RequireRuleError(`${path} is a required field`);
  if (op === 'update' && val === null) throw new RequireRuleError(`${path} cannot be set to null`);
};
