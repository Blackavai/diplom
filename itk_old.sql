-- Начальная схема нового экземпляра. Реальных данных и стандартных паролей нет.
-- PostgreSQL выполняет этот файл только при первом запуске с пустым каталогом данных.
-- Первого менеджера создаёт явная команда backend/scripts/create-manager.js.

CREATE TABLE role (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name_role varchar(255) NOT NULL
);

INSERT INTO role (name_role) VALUES ('Менеджер'), ('Работник');

CREATE TABLE users (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fname varchar(255) NOT NULL,
    lname varchar(255) NOT NULL,
    tg_id varchar(255) NOT NULL,
    role integer NOT NULL REFERENCES role(id),
    post varchar(255) NOT NULL,
    password text,
    session_version integer NOT NULL DEFAULT 0,
    question varchar(255),
    answer varchar(255),
    chat_id bigint,
    pending_report boolean DEFAULT false
);

CREATE TABLE teams_name (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name_team varchar(255) NOT NULL,
    description_team varchar(255)
);
CREATE TABLE teams (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_team_name bigint NOT NULL REFERENCES teams_name(id),
    id_user bigint NOT NULL REFERENCES users(id)
);
CREATE TABLE task_list (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content varchar(255) NOT NULL,
    id_user bigint NOT NULL REFERENCES users(id),
    end_date date NOT NULL,
    start_date date NOT NULL,
    status boolean NOT NULL
);
CREATE TABLE report_list (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_task bigint NOT NULL REFERENCES task_list(id),
    id_user bigint NOT NULL,
    text_report varchar(255) NOT NULL,
    end_date date NOT NULL,
    status_task boolean NOT NULL,
    check_report boolean DEFAULT false
);
CREATE TABLE vacation (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_user bigint NOT NULL REFERENCES users(id),
    start_holiday date NOT NULL,
    end_holiday date NOT NULL
);

CREATE TABLE daily_reports (
    id integer PRIMARY KEY,
    chat_id bigint,
    name text,
    report text,
    "timestamp" timestamp without time zone
);

ALTER TABLE users ADD CONSTRAINT users_tg_id_unique UNIQUE (tg_id);
ALTER TABLE teams ADD CONSTRAINT teams_membership_unique UNIQUE (id_team_name, id_user);
ALTER TABLE report_list ADD CONSTRAINT report_author_fk FOREIGN KEY (id_user) REFERENCES users(id);

CREATE TABLE request_idempotency (
    user_id integer NOT NULL,
    operation varchar(32) NOT NULL,
    request_key varchar(36) NOT NULL,
    request_hash varchar(64) NOT NULL,
    result jsonb,
    PRIMARY KEY (user_id, operation, request_key)
);

ALTER TABLE task_list ADD CONSTRAINT task_date_range CHECK (start_date <= end_date);
ALTER TABLE vacation ADD CONSTRAINT vacation_date_range CHECK (start_holiday <= end_holiday);
