const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
const { config } = require("dotenv");
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
const app = express();
app.use(cors(corsOptions));
app.use(express.json());

require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);

app.get("/", (req, res) => {
  res.send("Hello World");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hefn8jo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ....................................................
// Middleware manage  manage start
// ....................................................

const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res
      .status(401)
      .send({ message: "without token : you have no access" });
  }
  const token = req.headers.authorization.split(" ")[1];

  jwt.verify(token, process.env.TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res
        .status(401)
        .send({ message: "wrong Token : you have no access" });
    } else {
      req.decoded = decoded;
      next();
    }
  });
};

// ....................................................
// token manage  manage start
// ....................................................

app.post("/jwt", async (req, res) => {
  const user = req.body;
  console.log(user);
  const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn: "1h" });
  res.send({ token });
});

async function run() {
  try {
    const menuCollection = client.db("resturent").collection("menuCollection");
    const cardCollection = client.db("resturent").collection("cardCollection");
    const userCollection = client.db("resturent").collection("userCollection");
    const paymentCollection = client
      .db("resturent")
      .collection("paymentCollection");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "Admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      console.log(item);

      const result = await menuCollection.insertOne(item);
      res.send(result);
    });
    // get single user

    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(filter);
      res.send(result);
    });

    // update items api
    app.patch("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const data = req.body;
      const id = req.params.id;
      console.log(data, id);
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          ...data,
        },
      };
      const options = { upsert: true };

      const result = await menuCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(filter);
      res.send(result);
    });

    // ....................................................
    // user manage  manage start
    // ...................................................
    // get all user
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    // check admin user
    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({
          message: "hei lessen you think you are clever : you have no access",
        });
      }

      const query = { email: email };
      const result = await userCollection.findOne(query);
      let admin = false;
      if (result) {
        admin = result?.role === "Admin";
      }
      res.send({ admin });
    });

    // get single user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const data = req.body;
      console.log(email);
      const query = { email: email };
      const existingUSer = await userCollection.findOne(query);

      if (existingUSer) {
        return res.send({ message: "user already exist", insertedId: null });
      } else {
        const result = await userCollection.insertOne(data);
        res.send(result);
      }
    });
    // change user role
    app.patch("/user/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "Admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });
    // delete user
    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(filter);
      res.send(result);
    });

    // ....................................................
    // card collection manage start
    // ...................................................

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const result = await cardCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cardCollection.insertOne(cartItem);
      res.send(result);
    });
    app.delete("/cart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cardCollection.deleteOne(query);
      res.send(result);
    });

    // ....................................................
    //payment related all api start
    // ...................................................
    // get payment history
    app.get("/payment-history/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "access forbidden" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    // cart payment process start
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // payment process api
    app.post("/payment", async (req, res) => {
      const paymentData = req.body;
      console.log(paymentData);
      const paymentResult = await paymentCollection.insertOne(paymentData);
      // delete cart item after payment
      const filter = {
        _id: {
          $in: paymentData.cardIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cardCollection.deleteMany(filter);

      res.send({ paymentResult, deleteResult });
    });

    // ....................................................
    // card collection manage end
    // ...................................................

    // ....................................................
    // admin panel ui manage for api
    // ...................................................

    app.get("/admin-home", async (req, res) => {
      const totalUser = await userCollection.estimatedDocumentCount();
      const totalMenu = await menuCollection.estimatedDocumentCount();
      const totalOrder = await paymentCollection.estimatedDocumentCount();
      const totalEarn = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$price" },
            },
          },
        ])
        .toArray();
      const revenue = totalEarn.length > 0 ? totalEarn[0].totalAmount : 0;
      res.send({ totalUser, totalMenu, totalOrder, revenue });
    });




// using aggrete pipeline
app.get("/order-stats", async (req, res)=>{
  const result = await paymentCollection.aggregate([
    {
      $unwind:"$menuId"
    },
    {
      $lookup:{
        from:"menuCollection",
        localField:"menuId",
        foreignField:"_id",
        as:"menuItems"
      }
    },
    {
      $unwind:"$menuItems"
    },
    {
      $group:{
        _id:"$menuItems.category",
        quantity:{ $sum:1 },
        revenue:{$sum:"$menuItems.price"}
      }
    },
    {
      $project:{
        _id:0,
        category:"$_id",
        quantity:"$quantity",
        revenue:"$revenue"
      }
    }
  ]).toArray()
  res.send(result)
})



    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log("server is running");
});
