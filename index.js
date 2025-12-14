const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(express.json());
app.use(cors());

// URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.x3egp.mongodb.net/?appName=Cluster0`;

// MONGODB CLIENT
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// CONNECTING TO MONGODB
async function run() {
  try {
    await client.connect();

    // DB & COLLECTIONS
    const LoanLinkDB = client.db("LoanLinkDB");
    const loansCollection = LoanLinkDB.collection("Loans");
    const loanApplicationsCollection =
      LoanLinkDB.collection("LoanApplications");
    const usersCollection = LoanLinkDB.collection("users");
    // GET ALL LOANS
    app.get("/loans", async (req, res) => {
      const result = await loansCollection.find().toArray();
      res.send(result);
    });

    // GET LOANS BY ID
    app.get("/loans/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loansCollection.findOne(query);
      res.send(result);
    });
    // GET 6 LOANS
    app.get("/popular-loans", async (req, res) => {
      const result = await loansCollection.find().limit(6).toArray();
      res.send(result);
    });

    // LOAN APPLY RELATED APIS
    // GET ALL LOAN APPLICATIONS
    app.get("/loan-application", async (req, res) => {
      const Status = req.query.Status;
      console.log(Status);

      const query = {};
      if (Status) {
        query.Status = Status;
      }
      const result = await loanApplicationsCollection.find(query).toArray();
      res.send(result);
    });
    // GET LOAN BY ID
    app.get("/loan-application/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loanApplicationsCollection.findOne(query);
      res.send(result);
    });
    // APPLY A LOAN
    app.post("/loan-application", async (req, res) => {
      const loanApp = req.body;
      loanApp.Status = "Pending";
      loanApp.FeeStatus = "Unpaid";
      const result = await loanApplicationsCollection.insertOne(loanApp);
      res.send(result);
    });
    // USER RELATED APIS
    // ADD A USER
    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const query = { email: email };
      const userExists = await usersCollection.findOne(query);
      if (userExists) {
        return;
      }
      req.body.role = "User";
      req.body.createdAt = new Date();
      const result = await usersCollection.insertOne(req.body);
      res.send(result);
    });
    // GET USERS
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    // CHANGE A USER ROLE
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = { $set: { role: "Manager" } };
      const result = await usersCollection.updateOne(query, update);
      res.send(result);
    });
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
