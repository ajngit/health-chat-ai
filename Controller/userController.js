const userService = require("../Services/userService");

async function getUser(req, res) {
    try {
        const userId = req.query.UserID;
        
        if (userId) {
            const details = await userService.GetUserDetails(userId);
            if (details && details.length > 0) {
                res.json(details[0]);
            } else {
                res.status(404).json({ error: "User not found" });
            }
        } else {
            const users = await userService.getUsers();
            res.json(users);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function saveUser(req, res) {
    try {
        
        const user = req.body; // Extract user data from request body
       
        const resp =await userService.saveUser(user); // Call the service to save the user data
        
        
        res.status(201).json(resp);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function AuthenticateUser(req, res) {
    try {
        
        const user = req.body; // Extract user data from request body
       
        const resp =await userService.AuthenticateUser(user); // Call the service to save the user data
        
        
        res.status(201).json(resp);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function GetUserDetails(req, res) {
    try {
       
        const UserID = req.query.UserID;
        const user = await userService.GetUserDetails(UserID);
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: "Page not found" });
        }
       
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function DeleteUser(req, res) {
    try {
       
        const UserID = parseInt(req.query.UserID);
        const user = await userService.DeleteUser(UserID);
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: "Page not found" });
        }
       
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
module.exports = {
    getUser,saveUser,AuthenticateUser,GetUserDetails,DeleteUser
};
