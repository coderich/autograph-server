class RuleError extends Error {}

exports.AllowRuleError = class extends RuleError {};
exports.ImmutableRuleError = class extends RuleError {};
exports.EmailRuleError = class extends RuleError {};
exports.RangeRuleError = class extends RuleError {};
exports.RejectRuleError = class extends RuleError {};
exports.RequiredRuleError = class extends RuleError {};
