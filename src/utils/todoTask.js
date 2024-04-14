import {getConnectionPromise} from "../database/connection.js";

export async function addTodoTask(task, data) {
    const connection = await getConnectionPromise();
    connection.query('INSERT INTO gm_todo_task (task, data) VALUES (?, ?)', [task, data], (error) => {
        if (error) throw error;
    });
}