const connectDb = require("../dbConfig");
const SaveResponse = require("../Shared/SaveResponse");
const User = require("../Models/User");

async function getUsers() {
  await connectDb();
  const users = await User.find({ IsActive: true }).lean();
  return users;
}

async function saveUser(user) {
  await connectDb();

  const { UserName, Email, Password, Role, ImageURL, IsActive } = user;

  const existing = await User.findOne({ Email }).lean();
  if (existing) {
    const resp = new SaveResponse();
    resp.ID = existing.UserID;
    resp.Status = "exists";
    resp.Saved = false;
    return resp;
  }

  const created = await User.create({
    UserName,
    Email,
    Password,
    Role,
    ImageURL,
    IsActive,
  });

  const resp = new SaveResponse();
  resp.ID = created.UserID;
  resp.Status = "success";
  resp.Saved = true;

  return resp;
}

async function AuthenticateUser(user) {
  await connectDb();

  const { Email, Password, Role } = user;

  const found = await User.findOne({ Email, Password, Role }).lean();

  const resp = new SaveResponse();

  if (found) {
    resp.Status = "success";
    resp.Saved = true;
    resp.ID = found.UserID;
  } else {
    resp.Status = "failed";
    resp.Saved = false;
  }

  return resp;
}

async function GetUserDetails(UserID) {
  await connectDb();

  const user = await User.findById(UserID).lean();
  return user ? [user] : [];
}

async function DeleteUser(UserID) {
  await connectDb();

  const result = await User.findByIdAndDelete(UserID);
  return result ? UserID : null;
}

module.exports = {
  getUsers,
  saveUser,
  AuthenticateUser,
  GetUserDetails,
  DeleteUser,
};

