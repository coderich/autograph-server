module.exports = {
  typeDefs: `
    type Person @quin {
      name: String!
      authored: [Book]
      emailAddress: String!
      status: String
    }

    type Book {
      name: String!
      price: Float!
      author: Person!
      bestSeller: Boolean
      bids: [Float]
    }
  `,
};
