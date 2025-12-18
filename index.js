const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// stripe key
const stripe = require("stripe")(process.env.STRIPE_SECRET);

// admin sdk
let admin = require("firebase-admin");

let serviceAccount = require("./loanlink-e1e14-firebase-adminsdk.json");
const { default: Stripe } = require("stripe");
const { Transaction } = require("firebase-admin/firestore");

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
    const paymentCollection = LoanLinkDB.collection("payments");
    // PAYMENT RELATED APIS
    app.post("/payment-checkout-session", verifyFBToken, async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 1000,
              product_data: {
                name: "Please Pay The Loan Application Fee",
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          loanId: paymentInfo.loanId,
          loanName: paymentInfo.loanName,
        },
        customer_email: paymentInfo.email,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const transactionId = session.payment_intent;
      const query = { TransactionId: transactionId };
      const paymentExist = await paymentCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          message: "already Exists",
          TransactionId: transactionId,
          loanId: session.metadata.loanId,
        });
      }
      if (session.payment_status === "paid") {
        const id = session.metadata.loanId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            FeeStatus: "Paid",
            PaidAt: new Date(),
            transactionId: session.payment_intent,
          },
        };
        const result = await loanApplicationsCollection.updateOne(
          query,
          update
        );
        const payment = {
          amount: "10$",
          customerEmail: session.customer_email,
          loanId: session.metadata.loanId,
          loanName: session.metadata.loanName,
          TransactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          PaidAt: new Date(),
        };
        if (session.payment_status === "paid") {
          const paymentResult = await paymentCollection.insertOne(payment);
          res.send({
            success: true,
            modifyParcel: result,
            loanId: session.metadata.loanId,
            TransactionId: session.payment_intent,
            paymentInfo: paymentResult,
          });
        }
      }
      res.send({ success: false });
    });

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
        if (email !== req.decoded_email) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }
      }
      const result = await loansCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/loans/dashboard/manager", verifyFBToken, async (req, res) => {
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
    app.post("/loans", verifyFBToken, async (req, res) => {
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
    // GET ALL PENDING LOAN APPLICATIONS
    app.get("/loan-application/manager", verifyFBToken, async (req, res) => {
      const Status = req.query.Status;
      const query = {};
      if (Status) {
        query.Status = Status;
      }
      const result = await loanApplicationsCollection.find(query).toArray();
      res.send(result);
    });
    // GET ALL USER LOAN APPLICATIONS
    app.get("/loan-application/user", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await loanApplicationsCollection.find(query).toArray();
      res.send(result);
    });
    // CHANGE APPLICATION STATUS
    app.patch(
      "/loan-application/manager/:id",
      verifyFBToken,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: { Status: req.body.Status, updatedAt: new Date() },
        };
        const result = await loanApplicationsCollection.updateOne(
          query,
          update
        );
        res.send(result);
      }
    );
    // GET LOAN BY ID
    app.get("/loan-application/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loanApplicationsCollection.findOne(query);
      res.send(result);
    });
    // DELETE LOAN BY ID
    app.delete("/loan-application/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await loanApplicationsCollection.deleteOne(query);
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
