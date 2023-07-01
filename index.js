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

  const lowInStock = allProducts.filter((product) => product.countInStock < 5);
  console.log(lowInStock, "line 44");
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
      html: `<h3>please click the link to verify your account</h3> <p><a href="${FRONT_END_URL}/accountVerify/${storedData.insertedId}"> ${FRONT_END_URL}/accountVerify/${storedData.insertedId} </a></p>`,
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
          { _id: new ObjectId(checkUser._id) },
          { $set: { token: token } }
        );

      res.send({
        userId: checkUser._id,
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

app.post("/razorpay/orders", async (req, res) => {
  //finding the price and qunntity of the products
  const body = req.body;
  console.log(body);

  let readyMadePizzaPrice = 0;
  let customPizzaPrice = 0;
  let totalPriceWithOutTax = 0;
  for (let i = 0; i < body.length; i++) {
    if (!body[i].isCustomPizza) {
      const single = await client
        .db("pizza-delevery")
        .collection("products")
        .findOne({ name: body[i].name });
      customPizzaPrice += single.price * body[i].quantity;
    } else {
      const customPizzaData = await client
        .db("pizza-delevery")
        .collection("custom-pizza")
        .find({})
        .sort({ _id: 1 })
        .toArray();

      const [
        allPizzaBasesObj,
        allPizzaSaucesObj,
        allPizzaCheeseObj,
        allVeggiesObj,
        allMeatObj,
      ] = customPizzaData;

      const { allPizzaBases } = allPizzaBasesObj;

      const { allPizzaSauces } = allPizzaSaucesObj;

      const { allPizzaCheese } = allPizzaCheeseObj;

      const { allVeggies } = allVeggiesObj;

      const { allMeat } = allMeatObj;

      const testRight = [];

      for (let j = 0; j < allPizzaBases.length; j++) {
        if (allPizzaBases[j].pizzaBase === body[i].pizzaBase) {
          testRight.push(allPizzaBases[j]);
          customPizzaPrice += allPizzaBases[j].price;
        }
      }

      for (let j = 0; j < allPizzaSauces.length; j++) {
        if (allPizzaSauces[j].pizzaSauce === body[i].pizzaSauce) {
          testRight.push(allPizzaSauces[j]);
          customPizzaPrice += allPizzaSauces[j].price;
        }
      }

      for (let j = 0; j < allPizzaCheese.length; j++) {
        if (allPizzaCheese[j].pizzaCheese === body[i].pizzaCheese) {
          testRight.push(allPizzaCheese[j]);
          customPizzaPrice += allPizzaCheese[j].price;
        }
      }

      for (let j = 0; j < allVeggies.length; j++) {
        for (let k = 2; k < body[i].veggies.length; k++) {
          if (allVeggies[j].veggies === body[i].veggies[k]) {
            testRight.push(allVeggies[j]);
            customPizzaPrice += allVeggies[j].price;
          }
        }
      }

      for (let j = 0; j < allMeat.length; j++) {
        for (let k = 1; k < body[i].meat.length; k++) {
          if (allMeat[j].meat === body[i].meat[k]) {
            testRight.push(allMeat[j]);
            customPizzaPrice += allMeat[j].price;
          }
        }
      }

      console.log(customPizzaData, testRight);
    }
  }

  totalPriceWithOutTax = customPizzaPrice + readyMadePizzaPrice;

  const calcGST = (totalPriceWithOutTax * 5) / 100;
  const amountWithGST = totalPriceWithOutTax + calcGST;
  // console.log(totalPriceWithOutTax, "line 277");
  // console.log(amountWithGST, "line 278");

  //-------------
  const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY,
    key_secret: process.env.RAZORPAY_SECRET,
  });
  const options = {
    amount: amountWithGST * 100,
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

app.post("/razorpay/verify", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    token,
    cart,
  } = req.body;
  console.log(cart, "line 304");
  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(sign.toString())
    .digest("hex");

  if (razorpay_signature === expectedSign) {
    const paidUser = await client
      .db("pizza-delevery")
      .collection("users")
      .findOne({ token: token });
    console.log(paidUser, "line 321");

    const createDataForOrdersCollection = {
      paidUser: paidUser.userName,
      paidUser_id: new ObjectId(paidUser._id),
      razorpay_order_id: razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id,
      razorpay_signature: razorpay_signature,
      orderStatus: "order accepted",
      orders: cart,
    };

    await client
      .db("pizza-delevery")
      .collection("paid-orders")
      .insertOne(createDataForOrdersCollection);

    res.send({ message: "payment verified" });

    for (let i = 0; i < cart.length; i++) {
      if (!cart[i].isCustomPizza) {
        await client
          .db("pizza-delevery")
          .collection("products")
          .updateOne(
            { name: cart[i].name },
            { $inc: { countInStock: -cart[i].quantity } }
          );
      } else {
        console.log(cart[i], "this is the cart sender as custom pizza");
        await client
          .db("pizza-delevery")
          .collection("custom-pizza")
          .updateOne(
            {
              _id: new ObjectId("648bf2c2332f85a6e68873bd"),
              "allPizzaBases.pizzaBase": cart[i].pizzaBase,
            },
            { $inc: { "allPizzaBases.$.countInStock": -1 } }
          );

        await client
          .db("pizza-delevery")
          .collection("custom-pizza")
          .updateOne(
            {
              _id: new ObjectId("648bf2c2332f85a6e68873be"),
              "allPizzaSauces.pizzaSauce": cart[i].pizzaSauce,
            },
            { $inc: { "allPizzaSauces.$.countInStock": -1 } }
          );

        await client
          .db("pizza-delevery")
          .collection("custom-pizza")
          .updateOne(
            {
              _id: new ObjectId("648bf2c2332f85a6e68873bf"),
              "allPizzaCheese.pizzaCheese": cart[i].pizzaCheese,
            },
            { $inc: { "allPizzaCheese.$.countInStock": -1 } }
          );

        for (let j = 0; j < cart[i].veggies.length; j++) {
          await client
            .db("pizza-delevery")
            .collection("custom-pizza")
            .updateOne(
              {
                _id: new ObjectId("648bf2c2332f85a6e68873c0"),
                "allVeggies.veggies": cart[i].veggies[j],
              },
              { $inc: { "allVeggies.$.countInStock": -1 } }
            );
        }

        if (cart[i].meat) {
          for (let j = 0; j < cart[i].meat.length; j++) {
            await client
              .db("pizza-delevery")
              .collection("custom-pizza")
              .updateOne(
                {
                  _id: new ObjectId("648bf2c2332f85a6e68873c1"),
                  "allMeat.meat": cart[i].meat[j],
                },
                { $inc: { "allMeat.$.countInStock": -1 } }
              );
          }
        }
      }
    }
  } else {
    res.status(401).send({ message: "invalid signature" });
  }
});

//razorpay connection ended_____________________________________

app.get("/orders/:userId", async (req, res) => {
  const { userId } = req.params;
  const findOrders = await client
    .db("pizza-delevery")
    .collection("paid-orders")
    .find({ paidUser_id: new ObjectId(userId) })
    .toArray();

  res.send(findOrders);
});

//ADMIN OPRATIONS_______________________________________

app.post("/addProduct", auth, async (req, res) => {
  try {
    const token = req.header("x-auth-token");
    const productData = req.body;
    console.log(productData);

    const findTheUser = await client
      .db("pizza-delevery")
      .collection("users")
      .findOne({ token: token });

    console.log(findTheUser);

    if (findTheUser.isAdmin) {
      await client
        .db("pizza-delevery")
        .collection("products")
        .insertOne(productData);
      res.send({ message: "product inserted" });
    } else {
      res.status(401).send({ message: "Unauthorized Access" });
    }
  } catch (error) {
    res.status(401).send({ ...error, message: "something went wrong" });
  }
});

app.delete("/deleteProduct/:id", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const { id } = req.params;
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    await client
      .db("pizza-delevery")
      .collection("products")
      .deleteOne({ _id: new ObjectId(id) });
    res.send({ message: "updated successfully" });
  } else {
    res.status(401).send({ message: "you dont have access to do this" });
  }
});

app.post("/editProduct/:id", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const { id } = req.params;
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    await client
      .db("pizza-delevery")
      .collection("products")
      .updateOne({ _id: new ObjectId(id) }, { $set: body });
    res.send({ message: "updated successfully" });
  } else {
    res.status(401).send({ message: "you dont have access to do this" });
  }
});

app.get("/admin/allOrders", auth, async (req, res) => {
  const token = req.header("x-auth-token");

  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const query = req.query;
    const allOrders = await client
      .db("pizza-delevery")
      .collection("paid-orders")
      .find(query)
      .toArray();
    res.send(allOrders);
  } else {
    res.status(401).send({ message: "your are unauthorized to do it" });
  }
});

app.post("/changeStatus", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;

  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const updateStatus = await client
      .db("pizza-delevery")
      .collection("paid-orders")
      .updateOne(
        { _id: new ObjectId(body.id) },
        { $set: { orderStatus: body.status } }
      );

    res.send({ message: "updated the status" });
  } else {
    res.status(401).send({ message: "your are unauthorized to do it" });
  }
});

app.delete("/deleteCustomBase", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        {},
        { $pull: { allPizzaBases: { pizzaBase: body.pizzaBaseName } } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.delete("/deleteCustomSauce", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873be") },
        { $pull: { allPizzaSauces: { pizzaSauce: body.pizzaSauceName } } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.delete("/deleteCustomCheese", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873bf") },
        { $pull: { allPizzaCheese: { pizzaCheese: body.pizzaCheeseName } } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.delete("/deleteCustomVeggies", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873c0") },
        { $pull: { allVeggies: { veggies: body.pizzaVeggiesName } } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.delete("/deleteCustomMeat", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873c1") },
        { $pull: { allMeat: { meat: body.pizzaMeatName } } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.post("/addCustomBase", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873bd") },
        { $push: { allPizzaBases: body } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.post("/addCustomSauce", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873be") },
        { $push: { allPizzaSauces: body } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.post("/addCustomCheese", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873bf") },
        { $push: { allPizzaCheese: body } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.post("/addCustomVeggies", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873c0") },
        { $push: { allVeggies: body } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});

app.post("/addCustomMeat", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  const body = req.body;
  const findUser = await client
    .db("pizza-delevery")
    .collection("users")
    .findOne({ token: token });

  if (findUser.isAdmin) {
    const test = await client
      .db("pizza-delevery")
      .collection("custom-pizza")
      .updateOne(
        { _id: new ObjectId("648bf2c2332f85a6e68873c1") },
        { $push: { allMeat: body } }
      );
    console.log({ body: body, token: token });
    res.send(test);
  }
});
//_____________________________________________________
app.get("/customPizza", async (req, res) => {
  const data = await client
    .db("pizza-delevery")
    .collection("custom-pizza")
    .find({})
    .sort({ _id: 1 })
    .toArray();
  res.send(data);
});

app.listen(PORTT, () => console.log(`listening to PORT : ${PORTT}`));
