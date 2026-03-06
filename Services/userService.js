const connectDb = require("../dbConfig");
const SaveResponse = require("../Shared/SaveResponse");
const User = require("../Models/User");

async function getUsers() {
  await connectDb();
  const users = await User.find({ IsActive: true }).select("-Password").lean();
  return users.map((u) => ({
    ...u,
    UserID: u._id.toString(),
  }));
}

async function saveUser(user) {
  await connectDb();

  const { UserName, Email, Password, Role, ImageURL, IsActive } = user;

  const existing = await User.findOne({ Email }).select("_id").lean();
  if (existing) {
    const resp = new SaveResponse();
    resp.ID = existing._id.toString();
    resp.Status = "exists";
    resp.Saved = false;
    return resp;
  }

  // Enforce single-admin rule:
  // - If an admin already exists, every new user is forced to Role = 0.
  // - If no admin exists yet, allow Role = 1 only for this first user.
  const adminExists = await User.exists({ Role: 1 });
  let roleToSave = 0;
  if (!adminExists && Role === 1) {
    roleToSave = 1;
  }

  const created = await User.create({
    UserName,
    Email,
    Password,
    Role: roleToSave,
    ImageURL,
    IsActive,
  });

  const resp = new SaveResponse();
  resp.ID = created._id.toString();
  resp.Status = "success";
  resp.Saved = true;

  return resp;
}

async function AuthenticateUser(user) {
  await connectDb();

  const { Email, Password } = user;

  const found = await User.findOne({ Email, Password })
    .select("_id Role")
    .lean();

  const resp = new SaveResponse();

  if (found) {
    resp.Status = "success";
    resp.Saved = true;
    resp.ID = found._id.toString();
    resp.Role = found.Role;
  } else {
    resp.Status = "failed";
    resp.Saved = false;
  }

  return resp;
}

async function GetUserDetails(UserID) {
  await connectDb();

  const user = await User.findById(UserID).select("-Password").lean();
  if (!user) return [];

  return [
    {
      ...user,
      UserID: user._id.toString(),
    },
  ];
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

