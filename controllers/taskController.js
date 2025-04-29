const TaskModel = require("../models/taskModel");

const TaskController = {
    getAllTasks: async (req, res) => {
        try {
            const tasks = await TaskModel.getAllTasks();
            res.json(tasks);
        } catch (err) {
            console.error(err.message);
            res.status(500).json({ error: "Internal Server Error" });
        }
    },
    // getTaskById: async (req, res) => {
    //     const { id } = req.params;
    //     try {
    //         const task = await TaskModel.getTaskById(id);
    //         if (!task) {
    //             return res.status(404).json({ error: "Task not found" });
    //         }
    //         res.json(task);
    //     } catch (err) {
    //         console.error(err.message);
    //         res.status(500).json({ error: "Internal Server Error" });
    //     }
    // },
    // updateTaskStatus: async (req, res) => {
    //     const { id } = req.params;
    //     const { status } = req.body;
    //     try {
    //         const updatedTask = await TaskModel.updateTaskStatus(id, status);
    //         if (!updatedTask) {
    //             return res.status(404).json({ error: "Task not found" });
    //         }
    //         res.json(updatedTask);
    //     } catch (err) {
    //         console.error(err.message);
    //         res.status(500).json({ error: "Internal Server Error" });
    //     }
    // },
};

module.exports = TaskController;


// app.get("/tasks", async(req, res) => {
//     try{
//         const allTasks = await postgree.query("SELECT * FROM task_list;");
//         res.json(allTasks.rows);
//     } catch (err){
//         console.error(err.message);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });