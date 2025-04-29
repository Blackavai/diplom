const http = require('node:http');
const {Client} = require("pg");

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {

    const client = new Client ({
        user: 'postgres',
        host: 'localhost',
        database: 'OggettoDailyDB',
        password: 'root',
        port: 5432,
    });

    client.connect()
        .then(() => console.log('Подключено к базе данных'))
        .catch(err => console.error('Ошибка подключения', err.stack));

    const selectUser = 'SELECT * FROM users;';

    client.query(selectUser)
        .then(res => {
            console.log('Пользователи: ', res.rows);
        })
        .catch(err => console.error('ошибка чтения данных', err.stack));

});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});




const http = require('node:http');
const { Client } = require("pg");

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer(function(request, response) {
    const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'OggettoDailyDB',
        password: 'root',
        port: 5432,
    });

    if(request.url === "/login")
    {
        res.sendFile('login.html');

    }

    if (request.url === "/tasks") {
        client.connect()
            .then(() => {
                console.log('Подключено к базе данных');
                return client.query('SELECT * FROM task_list INNER JOIN users ON task_list.id_user = users.id;');
            })
            .then(res => {
                let htmlResponse = '<h1>Задачи</h1>';
                res.rows.forEach(task_list => {
                    const endDate = new Date(task_list.end_date);
                    const formattedEndDate = endDate.toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                    });

                    htmlResponse += `
                        <div style="border: 1px solid black; margin-bottom: 20px; padding: 20px">
                            <p>${task_list.content}</p>
                            <p>Сотрудник: ${task_list.fname + " " + task_list.lname}</p>
                            <p>Дата окончания: ${formattedEndDate}</p>
                            <p>Статус задачи: ${task_list.status ? "Выполнено" : "Не выполнено"}</p>
                        </div>
                     `;
                });

                response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                response.end(htmlResponse);
            })
            .catch(err => {
                console.error('Ошибка чтения данных', err.stack);
                response.writeHead(500, { 'Content-Type': 'text/plain' });
                response.end('Ошибка сервера');
            })
            .finally(() => {
                client.end();
            });
    } else {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('404 Not Found');
    }
});

server.listen(port, hostname, () => {
    console.log(`Сервер запущен на http://${hostname}:${port}/`);
});
