const { makeExecutableSchema } = require('apollo-server');
const { Schema } = require('@coderich/autograph');
const { createGraphSchema } = require('../../src/service/schema.service');
const stores = require('../stores');
const gql = require('../simpleSchema');

describe('Schema', () => {
  test('simpleSchema', () => {
    const schema = new Schema(gql, stores);
    const graphSchema = createGraphSchema(schema);
    console.log(JSON.stringify(graphSchema));
    const executableSchema = makeExecutableSchema(graphSchema);
    expect(executableSchema).toBeDefined();
  });
});
