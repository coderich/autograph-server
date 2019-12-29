import { ApolloClient, HttpLink, InMemoryCache, getMainDefinition, split, gql } from '@apollo/client';
import { WebSocketLink } from 'apollo-link-ws';

const httpLink = new HttpLink({ uri: 'http://localhost:4000' });
const wsLink = new WebSocketLink({ uri: 'ws://localhost:4000/graphql', options: { reconnect: true } });
const link = split(
  ({ query }) => {
    const { kind, operation } = getMainDefinition(query);
    return (kind === 'OperationDefinition' && operation === 'subscription');
  },
  wsLink,
  httpLink,
);
const client = new ApolloClient({ cache: new InMemoryCache(), link });


export const Collection = (modelName, where, fields) => {
  const findField = `find${modelName}`;
  const changeName = `${modelName}Changed`;

  const query = gql`
    query {
      System {
        ${findField} ${fields}
      }
    }
  `;

  const onModelChanged = gql`
    subscription($where: ${modelName}InputQuery) {
      ${changeName}(where: $where) {
        op
        model ${fields}
      }
    }
  `;

  (async () => {
    await client.query({ query });

    client.subscribe({ query: onModelChanged }).subscribe(({ data: { [changeName]: { op, model } } }) => {
      const { System: { [findField]: people } } = client.readQuery({ query });

      switch (op) {
        case 'create': {
          const newData = { System: { [findField]: [...people, model], __typename: 'System' } };
          client.writeQuery({ query, data: newData });
          break;
        }
        case 'delete': {
          const index = people.findIndex(p => p.id === model.id);
          const newData = { System: { [findField]: [...people.slice(0, index), ...people.slice(index + 1)], __typename: 'System' } };
          client.writeQuery({ query, data: newData });
          break;
        }
        default: break;
      }
    });
  })();

  return query;
};

export default client;
