const postgree = require("../db");
const e = require("express");

const UserModel = {
  getAllUsers: async () => {
      const result = await postgree.query("SELECT id, fname, lname, tg_id, post FROM users ORDER BY role, lname;");
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
  },

  vacUsers: async (id_user, startHoliday, endHoliday) => {
      const query = 'INSERT INTO vacation(id_user, start_holiday, end_holiday) VALUES ($1, $2, $3);';
      const values = [id_user, startHoliday, endHoliday];
      const result = await postgree.query(query, values);
      return result.rows[0];
  },

  allVacUsers: async() => {
      const result = await postgree.query('SELECT fname, lname, start_holiday, end_holiday FROM vacation INNER JOIN users ON vacation.id_user = users.id;');
      return result.rows;
  },

    checkTeamUser: async (id_user) => {
        const result = await postgree.query(
            `SELECT teams_name.name_team 
         FROM teams_name 
         INNER JOIN teams ON teams_name.id = teams.id_team_name 
         INNER JOIN users ON teams.id_user = users.id 
         WHERE users.id = $1;`,
            [id_user]
        );

        if (result.rows.length === 0) {
            return "Отсутствует"; // Возвращаем сообщение, если нет записей
        }

        return result.rows[0].name_team; // Возвращаем название команды
    },

    checkCountTaskUser: async(id_user) => {
        const result = await postgree.query(`SELECT * FROM task_list WHERE status = 'false' AND id_user = $1 ;`,[id_user]);
        return result.rows;
    },

    checkVacationUser: async (id_user) => {
        const result = await postgree.query(
            `SELECT start_holiday, end_holiday 
         FROM vacation 
         WHERE id_user = $1 
         AND CURRENT_DATE BETWEEN start_holiday AND end_holiday;`,
            [id_user]
        );

        if (result.rows.length === 0) {
            return "Отсутствует";
        }

        return result.rows[0];
    }

};

module.exports = UserModel;