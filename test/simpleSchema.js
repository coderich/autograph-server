module.exports = {
  typeDefs: `
    type Person @model(alias: "the_person") {
      name: String!
      authored: [Book] @field(alias: "person_id" materializeBy: "author")
      emailAddress: String!
      status: String
    }

    type Book @model {
      name: String!
      price: Float!
      author: Person! @field(enforce: immutable)
      bestSeller: Boolean
      bids: [Float]
    }
  `,
};
