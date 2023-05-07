import express from "express";
import * as dotenv from "dotenv";
import { MongoClient } from "mongodb";
import cors from "cors";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";

import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

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

const BACK_END_URL = "http://localhost:4000";
const FRONT_END_URL = "http://localhost:3000";

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
  } else {
    // ### HASH PASSWORD ###
    const password = data.password;
    const NO_OF_ROUNDS = 10;
    const salt = await bcrypt.genSalt(NO_OF_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    const updatedData = {
      ...data,
      password: hashedPassword,
      isVerified: false,
      isAdmin: false,
    };

    const storedData = await client
      .db("pizza-delevery")
      .collection("users")
      .insertOne(updatedData);

    // SETTING UP NODE MAILER --------------------------------
    const config = {
      service: "gmail",
      auth: {
        user: process.env.GMAIL,
        pass: process.env.PASSWORD,
      },
    };

    const transpoter = nodemailer.createTransport(config);

    const message = {
      from: process.env.GMAIL,
      to: data.email,
      subject: "verification link",
      text: `${FRONT_END_URL}/accountVerify/${storedData.insertedId}`,
      html: `<h3>please click the link to verify your account</h3> <p><a href="${FRONT_END_URL}/accountVerify/${storedData.insertedId}">${FRONT_END_URL}/accountVerify/${storedData.insertedId} </a></p>`,
    };

    await transpoter.sendMail(message);
    res.send({ message: "verification link is sent to your email" });
  }
});

app.put("/accountVerify/:id", async (req, res) => {
  try {
    const { id } = req.params;
    //console.log(id);
    const token = jwt.sign({ id: id }, process.env.SECRET);
    const updateUser = await client
      .db("pizza-delevery")
      .collection("users")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { isVerified: true, token: token } }
      );
    if (updateUser.matchedCount === 1) {
      res.send({
        message: "account verified successfully",
        token: token,
        isAdmin: false,
      });
    } else {
      res.send({ message: "could not find the object id verification faild" });
    }
  } catch (error) {
    res.send(error);
  }
});

app.post("/signIn", async (req, res) => {
  const data = req.body;

  const checkUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ userName: data.userName });
  //console.log(checkUser);

  if (!checkUser) {
    res.send({ message: "invalid crenditals u" });
  } else if (!checkUser.isVerified) {
    const config = {
      service: "gmail",
      auth: {
        user: process.env.GMAIL,
        pass: process.env.PASSWORD,
      },
    };

    const transpoter = nodemailer.createTransport(config);

    const message = {
      from: process.env.GMAIL,
      to: data.email,
      subject: "verification link",
      text: `${FRONT_END_URL}/accountVerify/${storedData.insertedId}`,
      html: `<h3>please click the link to verify your account</h3> <p><a href="${FRONT_END_URL}/accountVerify/${storedData.insertedId}">${FRONT_END_URL}/accountVerify/${storedData.insertedId} </a></p>`,
    };

    await transpoter.sendMail(message);
    res.send({
      message: "Account not verified! verification link is sent to your email",
    });
  } else {
    const db_password = checkUser.password;
    const passwordCheck = await bcrypt.compare(data.password, db_password);

    if (passwordCheck) {
      const token = jwt.sign({ id: checkUser._id }, process.env.SECRET);

      await client
        .db("pizza-delevery")
        .collection("users")
        .updateOne(
          { id: new ObjectId(checkUser._id) },
          { $set: { token: token } }
        );

      res.send({ message: "successful sign in", token: token });
    } else {
      res.send({ message: "invalid crenditles p" });
    }
  }
});
app.listen(PORTT, () => console.log(`listening to PORT : ${PORTT}`));
