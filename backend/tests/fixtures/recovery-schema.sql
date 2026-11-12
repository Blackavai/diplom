-- Synthetic schema subset for A02/A04 tests. Never load the production dump.
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
