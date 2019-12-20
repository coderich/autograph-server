const { isEmail } = require('validator');
const Errors = require('./error.service');
const { hashObject } = require('./app.service');

exports.allow = (...args) => (val, oldVal, op, path) => {
  if (val == null) return;
  if (args.indexOf(val) === -1) throw new Errors.AllowRuleError(`${path} must contain: { ${args.join(' ')} }, found '${val}'`);
};

exports.email = () => (val, oldVal, op, path) => {
  if (val == null) return;
  if (!isEmail(val)) throw new Errors.EmailRuleError(`${path} is not a valid email`);
};

exports.immutable = () => (val, oldVal, op, path) => {
  if (op === 'update' && `${hashObject(val)}` !== `${hashObject(oldVal)}` && val !== undefined) throw new Errors.ImmutableRuleError(`${path} is immutable; cannot be changed once set`);
};

exports.range = (min, max) => {
  if (min == null) min = undefined;
  if (max == null) max = undefined;

  return (val) => {
    if (val == null) return;
    const num = Number(val);
    if (Number.isNaN(num)) throw new Errors.RangeRuleError(`${val} is not a valid number`);
    if (num < min) throw new Errors.RangeRuleError(`${val} cannot be less than ${min}`);
    if (num > max) throw new Errors.RangeRuleError(`${val} cannot be greater than ${max}`);
  };
};

exports.reject = (...args) => (val, oldVal, op, path) => {
  if (val == null) return;
  if (args.indexOf(val) > -1) throw new Errors.RejectRuleError(`${path} must not contain: { ${args.join(' ')} }, found '${val}'`);
};

exports.required = () => (val, oldVal, op, path) => {
  if (op === 'create' && val == null) throw new Errors.RequireRuleError(`${path} is a required field`);
  if (op === 'update' && val === null) throw new Errors.RequireRuleError(`${path} cannot be set to null`);
};
