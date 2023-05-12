import express from "express";
import * as dotenv from "dotenv";
import { MongoClient } from "mongodb";
import cors from "cors";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";
import crypto from "crypto";

import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { auth } from "./middleware/auth.js";
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
      to: checkUser.email,
      subject: "verification link",
      text: `${FRONT_END_URL}/accountVerify/${checkUser._id}`,
      html: `<h3>please click the link to verify your account</h3> <p><a href="${FRONT_END_URL}/accountVerify/${checkUser._id}">${FRONT_END_URL}/accountVerify/${checkUser._id} </a></p>`,
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

      res.send({
        message: "successful sign in",
        token: token,
        isAdmin: checkUser.isAdmin,
      });
    } else {
      res.send({ message: "invalid crenditles p" });
    }
  }
});

app.post("/forgetPassword", async (req, res) => {
  const { email } = req.body;

  const findTheUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ email: email });

  if (!findTheUser) {
    res.send({ message: "we could not find any user with that email" });
  } else {
    const token = jwt.sign({ id: findTheUser._id }, process.env.SECRET, {
      expiresIn: "10m",
    });

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
      to: findTheUser.email,
      subject: "verification link",
      text: `${FRONT_END_URL}/accountRecovery/${findTheUser._id}/${token}`,
      html: `<h3>please click the link to change your account password</h3> <p><a href="${FRONT_END_URL}/accountRecovery/${findTheUser._id}/${token}">${FRONT_END_URL}/accountRecovery/${findTheUser._id}/${token} </a></p>`,
    };

    await transpoter.sendMail(message);

    res.send({
      message:
        "Password reset link has been sent to your email the link expires in 10 minutes",
    });
  }
});

app.post("/accountRecovery", auth, async (req, res) => {
  const data = req.body;
  const findAccount = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ _id: new ObjectId(data.userID) });

  if (findAccount) {
    const NO_OF_ROUNDS = 10;
    const salt = await bcrypt.genSalt(NO_OF_ROUNDS);
    const hashedPassword = await bcrypt.hash(data.newPassword, salt);
    await client
      .db("pizza-delevery")
      .collection("users")
      .updateOne(
        { _id: new ObjectId(data.userID) },
        { $set: { password: hashedPassword } }
      );
    res.send({ message: "password changed successfully" });
  } else {
    res.send({ message: "we could not find the account" });
  }
});

//razorpay connection __________________________________________

app.post("/orders", async (req, res) => {
  const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY,
    key_secret: process.env.RAZORPAY_SECRET,
  });
  const options = {
    amount: 1000 * 100,
    currency: "INR",
    receipt: "some text",
  };
  instance.orders.create(options, (error, order) => {
    if (error) {
      console.log(error);
      res.status(500).send({ message: "something went wrong" });
    } else {
      console.log(order);
      res.send(order);
    }
  });
});

app.post("/verify", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;
  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(sign.toString())
    .digest("hex");

  if (razorpay_signature === expectedSign) {
    res.send({ message: "payment verified" });
  } else {
    res.status(401).send({ message: "invalid signature" });
  }
});

//razorpay connection ended_____________________________________
app.listen(PORTT, () => console.log(`listening to PORT : ${PORTT}`));
