const PicoMatch = require('picomatch');
const { SchemaDirectiveVisitor } = require('graphql-tools');

const getCrudOperation = (mutationName) => {
  const crudMap = {
    create: 'C',
    add: 'C',
    findOrCreate: 'C',
    get: 'R',
    find: 'R',
    count: 'R',
    update: 'U',
    replace: 'U',
    edit: 'U',
    set: 'U',
    move: 'U',
    delete: 'D',
    remove: 'D',
    subscribe: 'S',
  };

  return Object.entries(crudMap).reduce((prev, [key, value]) => {
    if (prev) return prev;
    if (mutationName.indexOf(key) === 0) return value;
    return null;
  }, null);
};

const authorize = (context, model, fields, crud) => {
  const { schema, scopes = [] } = context;
  const namespace = schema.getModel(model).getNamespace();

  const authorized = fields.every((field) => {
    const ns = `${model}/${field}/${crud}`;
    const fqns = `${namespace}/${ns}`;

    if (field === '*') {
      return scopes.some((scope) => {
        return PicoMatch.isMatch(scope, [`**${model}/**`, `${namespace}/**`, '\\*\\*/**'], { nocase: true });
      });
    }

    return [ns, fqns].some((scope) => {
      return PicoMatch.isMatch(scope, scopes, { nocase: true });
    });
  });

  if (!authorized) throw new Error('Not Authorized');
};

exports.AuthzDirective = class extends SchemaDirectiveVisitor {
  visitObject(type) { // eslint-disable-line
    const fields = type.getFields();

    Object.keys(fields).forEach((fieldName) => {
      const field = fields[fieldName];
      const { resolve = root => root[fieldName] } = field;
      const { model = `${type}` } = this.args;

      field.resolve = async function resolver(root, args, context, info) {
        authorize(context, model, [fieldName], 'R');
        return resolve.call(this, root, args, context, info);
      };
    });
  }

  visitFieldDefinition(field, details) { // eslint-disable-line
    const { name, type, resolve = root => root[name] } = field;
    const dataType = type.toString().replace(/[[\]!]/g, '');
    const crudOperation = getCrudOperation(name);
    const { model = dataType } = this.args;

    field.resolve = async function resolver(root, args, context, info) {
      authorize(context, model, Object.keys(args.data || { '*': 1 }), crudOperation);
      return resolve.call(this, root, args, context, info);
    };
  }
};
