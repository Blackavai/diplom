-- Synthetic schema for access-control and recovery tests. Never load the production dump.
CREATE TABLE role (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name_role varchar(255) NOT NULL
);

INSERT INTO role (name_role) VALUES ('Test manager'), ('Test worker');

CREATE TABLE users (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fname varchar(255) NOT NULL,
    lname varchar(255) NOT NULL,
    tg_id varchar(255) NOT NULL,
    role integer NOT NULL REFERENCES role(id),
    post varchar(255) NOT NULL,
    password text,
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
