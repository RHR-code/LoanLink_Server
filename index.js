const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// admin sdk
let admin = require("firebase-admin");

let serviceAccount = require("./loanlink-e1e14-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const Token = req.headers.authorization;
  if (!Token) {
    return res.status(401).send({ message: "Unauthorize Access" });
  }
  try {
    const tokenId = Token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorize Access" });
  }
};

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

    // VERIFY ADMIN MIDDLEWARE
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "Admin") {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    // GET ALL LOANS
    app.get("/loans", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await loansCollection.find(query).toArray();
      res.send(result);
    });
    app.get(
      "/loans/dashboard",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const result = await loansCollection.find().toArray();
        res.send(result);
      }
    );
    // GET LOANS BY ID
    app.get("/loans/dashboard/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loansCollection.findOne(query);
      res.send(result);
    });
    // GET LOANS BY ID
    app.get("/loans/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loansCollection.findOne(query);
      res.send(result);
    });

    // ADD A LOAN
    app.post("/loans", async (req, res) => {
      const result = await loansCollection.insertOne(req.body);
      res.send(result);
    });

    // UPDATE A LOAN BY ID
    app.patch("/loans/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const {
        loan_title,
        description,
        interest_rate,
        category,
        loan_image,
        max_limit,
        available_emi_plans,
      } = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          loan_title,
          description,
          interest_rate,
          category,
          loan_image,
          max_limit,
          available_emi_plans,
        },
      };
      const result = await loansCollection.updateOne(query, update);
      res.send(result);
    });
    // DELETE A LOAN BY ID
    app.delete("/loans/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loansCollection.deleteOne(query);
      res.send(result);
    });
    // GET 6 LOANS
    app.get("/popular-loans", async (req, res) => {
      const result = await loansCollection
        .find({ isPopular: true })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    // UPDATE A LOAN TO SHOW IN HOMEPAGE
    app.patch(
      "/popular-loans/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const isPopular = req.body.isPopular;
        const updatedAt = new Date();
        const query = { _id: new ObjectId(id) };
        const update = { $set: { isPopular: isPopular, updatedAt: updatedAt } };
        const result = await loansCollection.updateOne(query, update);
        res.send(result);
      }
    );

    // LOAN APPLY RELATED APIS
    // GET ALL LOAN APPLICATIONS
    app.get(
      "/loan-application",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const Status = req.query.Status;
        console.log(Status);

        const query = {};
        if (Status) {
          query.Status = Status;
        }
        const result = await loanApplicationsCollection.find(query).toArray();
        res.send(result);
      }
    );
    // GET LOAN BY ID
    app.get(
      "/loan-application/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await loanApplicationsCollection.findOne(query);
        res.send(result);
      }
    );
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
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    // GET A USER BY ID
    app.get("/user-role", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await usersCollection.findOne(query);
      res.send({ role: result?.role || "user" });
    });
    // CHANGE A USER ROLE
    app.patch("/users/:id", verifyFBToken, verifyAdmin, async (req, res) => {
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
