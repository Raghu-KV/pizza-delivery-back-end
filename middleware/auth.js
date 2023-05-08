import jwt from "jsonwebtoken";

export function auth(req, res, next) {
  try {
    const token = req.header("x-auth-token");
    jwt.verify(token, process.env.SECRET);
    next();
  } catch (error) {
    res.status(401).send(error);
  }
}
