const postgree = require("../db");

const UserModel = {
  getAllUsers: async () => {
      const result = await postgree.query("SELECT id, fname, lname, tg_id, post FROM users;");
      return result.rows;
  },

  updateUserInfo: async (id, fname, lname, post) => {
      const query = 'UPDATE users SET fname = $1, lname = $2, post = $3 WHERE id = $4 RETURNING *;';
      const values = [fname, lname, post, id];
      const result = await postgree.query(query, values);
      return result.rows[0];
  },

  deleteUser: async  (id) => {
      const query = 'DELETE FROM users WHERE id = $1;';
      const value = [id];
      const result = await postgree.query(query, value);
      return result.rows[0];
  }
};

module.exports = UserModel;