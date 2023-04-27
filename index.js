import express from "express";
import * as dotenv from "dotenv";
import { MongoClient } from "mongodb";

const app = express();
dotenv.config();
const PORT = process.env.PORT;

//connecting mongo db ________________________
const MONGO_URL = process.env.MONGO_URL;
const client = new MongoClient(MONGO_URL);
await client.connect();
console.log("mongodb connected");
//_____________________________________________

app.use(express.json());

app.get("/", (req, res) => {
  res.send({ message: "express working successfully" });
});

app.post("/", (req, res) => {
  res.send({});
});

app.listen(PORT, () => console.log(`listening to PORT : ${PORT}`));
