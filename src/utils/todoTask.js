const getConnection = require('../database/connection');

function addTodoTask(task, data) {
    getConnection().then(connection => {
        connection.query('INSERT INTO gm_todo_task (task, data) VALUES (?, ?)', [task, data], (error) => {
            if (error) throw error;
        });
    });
}

module.exports = {
    addTodoTask
};