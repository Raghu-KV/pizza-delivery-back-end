import express from "express";
import * as dotenv from "dotenv";
import { MongoClient } from "mongodb";
import cors from "cors";

const app = express();
dotenv.config();
const PORTT = process.env.PORT;

//connecting mongo db ________________________
const MONGO_URL = process.env.MONGO_URL;
const client = new MongoClient(MONGO_URL);
await client.connect();
console.log("mongodb connected");
//_____________________________________________

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send({ message: "express working successfully" });
});

app.get("/products", async (req, res) => {
  const allProducts = await client
    .db("pizza-delevery")
    .collection("products")
    .find({})
    .toArray();

  res.send(allProducts);
});

app.post("/register", async (req, res) => {
  const data = req.body;
  const checkUserName = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ userName: data.userName });
  const checkEmail = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ email: data.email });
  console.log(checkEmail, checkUserName);

  if (checkUserName || checkEmail) {
    res.status(401).send({ message: "userName or email already exits" });
  } else if (data.password.length < 7) {
    res
      .status(401)
      .send({ message: "password should be at least 8 character" });
  }
});

app.listen(PORTT, () => console.log(`listening to PORT : ${PORTT}`));
