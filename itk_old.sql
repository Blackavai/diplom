--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.4

-- Started on 2026-05-10 16:03:01

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 217 (class 1259 OID 33445)
-- Name: daily_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.daily_reports (
    id integer NOT NULL,
    chat_id bigint,
    name text,
    report text,
    "timestamp" timestamp without time zone
);


ALTER TABLE public.daily_reports OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 33450)
-- Name: report_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_list (
    id integer NOT NULL,
    id_task bigint NOT NULL,
    id_user bigint NOT NULL,
    text_report character varying(255) NOT NULL,
    end_date date NOT NULL,
    status_task boolean NOT NULL,
    check_report boolean DEFAULT false
);


ALTER TABLE public.report_list OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 33454)
-- Name: report_list_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.report_list ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.report_list_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 220 (class 1259 OID 33455)
-- Name: role; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role (
    id integer NOT NULL,
    name_role character varying(255) NOT NULL
);


ALTER TABLE public.role OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 33458)
-- Name: role_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.role ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 222 (class 1259 OID 33459)
-- Name: task_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_list (
    id integer NOT NULL,
    content character varying(255) NOT NULL,
    id_user bigint NOT NULL,
    end_date date NOT NULL,
    status boolean NOT NULL,
    start_date date NOT NULL
);


ALTER TABLE public.task_list OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 33462)
-- Name: task_list_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.task_list ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.task_list_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 224 (class 1259 OID 33463)
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    id integer NOT NULL,
    id_team_name bigint NOT NULL,
    id_user bigint NOT NULL
);


ALTER TABLE public.teams OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 33466)
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.teams ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.teams_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 33467)
-- Name: teams_name; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams_name (
    id integer NOT NULL,
    name_team character varying(255) NOT NULL,
    description_team character varying(255)
);


ALTER TABLE public.teams_name OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 33472)
-- Name: teams_name_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.teams_name ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.teams_name_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 228 (class 1259 OID 33473)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    fname character varying(255) NOT NULL,
    lname character varying(255) NOT NULL,
    tg_id character varying(255) NOT NULL,
    role integer NOT NULL,
    post character varying(255) NOT NULL,
    password text,
    question character varying(255),
    answer character varying(255),
    chat_id bigint,
    pending_report boolean DEFAULT false
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 33479)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 230 (class 1259 OID 33480)
-- Name: vacation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vacation (
    id integer NOT NULL,
    id_user bigint NOT NULL,
    start_holiday date NOT NULL,
    end_holiday date NOT NULL
);


ALTER TABLE public.vacation OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 33483)
-- Name: vacation_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vacation ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vacation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 4899 (class 0 OID 33445)
-- Dependencies: 217
-- Data for Name: daily_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.daily_reports (id, chat_id, name, report, "timestamp") FROM stdin;
\.


--
-- TOC entry 4900 (class 0 OID 33450)
-- Dependencies: 218
-- Data for Name: report_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_list (id, id_task, id_user, text_report, end_date, status_task, check_report) FROM stdin;
5	12	1	Возникли трудности	2025-09-03	f	t
6	16	17	Получилось але луя	2025-09-10	t	t
7	15	15	вау, я отправил отчёт по чужой задаче	2025-09-10	f	t
8	18	15	презентацию я не сделал, но мб найду баги	2025-10-14	t	t
9	18	15	блин я не сделал отчёт	2025-10-14	f	t
10	15	15	я проверил кто придёт	2025-09-10	f	t
11	6	2	чёрт его знает от кого придёт этот отчёт	2025-05-11	f	t
13	40	3	1234567	2025-12-12	f	t
14	42	2	ЛолОлОЛол	2025-10-01	t	t
12	6	2	эмм эээ	2025-05-11	f	t
15	45	21	Скоро сделаю	2025-09-28	f	t
16	35	3	🫠	2025-09-18	f	t
18	50	21	Скоро сделаю	2025-10-05	f	f
19	51	21	Отчёт	2025-10-05	f	f
17	49	20	в процессе	2025-10-09	f	t
20	55	2	Веб-панель доделана	2025-10-07	f	f
21	56	21	Ну я не обещаю конечно	2025-10-07	f	f
22	57	21	скоро сделаю	2025-10-10	f	f
\.


--
-- TOC entry 4902 (class 0 OID 33455)
-- Dependencies: 220
-- Data for Name: role; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role (id, name_role) FROM stdin;
1	Менеджер
2	Работник
\.


--
-- TOC entry 4904 (class 0 OID 33459)
-- Dependencies: 222
-- Data for Name: task_list; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.task_list (id, content, id_user, end_date, status, start_date) FROM stdin;
5	Задача	1	2025-01-01	t	2024-01-01
11	Создать документацию к проекту	1	2025-09-03	f	2024-01-01
12	Руководить сотрудниками	1	2027-08-09	f	2024-01-01
17	Написать пояснительную записку	18	2025-10-14	f	2024-01-01
14	ава	1	2025-09-17	t	2024-01-01
16	Связать бота с базой данных	17	2025-09-10	t	2024-01-01
35	🫵💀	3	2025-09-18	f	2025-09-18
15	Спрашивать кто будет сегодня	15	2025-09-10	f	2024-01-01
18	Сделать презентацию к предзащите	15	2025-10-14	f	2024-01-01
40	123	3	2025-12-12	f	2025-09-24
6	Написать логику сайта	2	2025-05-11	t	2024-01-01
41	dkfjdkgfndkg	3	2025-11-12	t	2025-09-24
43	Быстро сделай задачу!!!	21	2025-09-26	t	2025-09-25
42	пройти silksong за ночь	2	2025-10-01	t	2025-09-24
44	Задача	21	2025-09-27	t	2025-09-26
45	Задача	21	2025-09-28	t	2025-09-26
46	радоваться	3	2026-11-21	f	2025-09-28
8	Работать	3	2025-05-20	t	2024-01-01
47	Отчёт	19	2025-10-01	f	2025-09-29
48	Доделать презентацию	20	2025-10-09	t	2025-10-02
49	Переделать презентацию с учетом замечаний	20	2025-10-09	f	2025-10-02
50	Нужно сделать	21	2025-10-05	t	2025-10-04
51	задачка	21	2025-10-05	t	2025-10-04
52	задача	21	2025-10-06	t	2025-10-04
53	Написать документацию к Веб-панели	2	2025-10-14	t	2025-10-06
54	Нужно доделать веб панель	2	2025-10-07	f	2025-10-06
55	До завтра доделать веб панель!	2	2025-10-07	t	2025-10-06
56	До завтра нужно пофиксить баги	21	2025-10-07	t	2025-10-06
57	добавить формат логина	21	2025-10-10	t	2025-10-09
58	Прийти на пару	3	2025-10-28	f	2025-10-27
\.


--
-- TOC entry 4906 (class 0 OID 33463)
-- Dependencies: 224
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teams (id, id_team_name, id_user) FROM stdin;
22	6	17
50	3	15
52	5	2
55	3	18
\.


--
-- TOC entry 4908 (class 0 OID 33467)
-- Dependencies: 226
-- Data for Name: teams_name; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teams_name (id, name_team, description_team) FROM stdin;
6	Telegram bot	Сотрудники для бота
5	Web-панель	Сотрудники для веб-панели
3	Маркетологи	описание коммерческой части
\.


--
-- TOC entry 4910 (class 0 OID 33473)
-- Dependencies: 228
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, fname, lname, tg_id, role, post, password, question, answer, chat_id, pending_report) FROM stdin;
15	Анастасия	Медяник	@Lotus_no_hana	2	Менеджер	123	\N	\N	\N	f
18	Мария	Хомутова	@pmhr_b	2	Маркетолог	123	\N	\N	\N	f
19	Евгения	Красовская	@evasweet06	2	Дизайнер	123	\N	\N	\N	f
3	Артём	Бардин	@fero_fox	2	Тестировщик	123	Любимая еда?	Да	\N	f
11	Марина	Доленко	@m_podoprigora	1	Наставник 	123	Имя собаки?	Бобик	\N	f
1	Любовь	Чумичева (Пирская)	@lpirskaya	1	Наставник	123	Кто ты?	Любовь	528365378	f
17	Илья	Валентинов	@V_111_S	2	Backend	123	\N	\N	\N	f
2	Артём	Башкатов	@blackavai	1	Frontend	123	Кто ты?	Артём	894382582	f
21	Данил	Ганин	@daniluua	2	Backend	123	\N	\N	1047669398	f
20	Софья	Прожирко	@Isoffyss	2	Дизайнер	123	\N	\N	\N	f
\.


--
-- TOC entry 4912 (class 0 OID 33480)
-- Dependencies: 230
-- Data for Name: vacation; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vacation (id, id_user, start_holiday, end_holiday) FROM stdin;
22	20	2025-09-14	2025-09-15
23	18	2025-09-29	2025-09-30
25	11	2025-10-05	2025-10-05
26	3	2025-10-05	2025-10-11
27	3	2025-10-12	2025-10-18
\.


--
-- TOC entry 4919 (class 0 OID 0)
-- Dependencies: 219
-- Name: report_list_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.report_list_id_seq', 22, true);


--
-- TOC entry 4920 (class 0 OID 0)
-- Dependencies: 221
-- Name: role_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.role_id_seq', 5, true);


--
-- TOC entry 4921 (class 0 OID 0)
-- Dependencies: 223
-- Name: task_list_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.task_list_id_seq', 58, true);


--
-- TOC entry 4922 (class 0 OID 0)
-- Dependencies: 225
-- Name: teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.teams_id_seq', 55, true);


--
-- TOC entry 4923 (class 0 OID 0)
-- Dependencies: 227
-- Name: teams_name_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.teams_name_id_seq', 20, true);


--
-- TOC entry 4924 (class 0 OID 0)
-- Dependencies: 229
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 44, true);


--
-- TOC entry 4925 (class 0 OID 0)
-- Dependencies: 231
-- Name: vacation_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vacation_id_seq', 27, true);


--
-- TOC entry 4732 (class 2606 OID 33485)
-- Name: daily_reports daily_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_pkey PRIMARY KEY (id);


--
-- TOC entry 4734 (class 2606 OID 33487)
-- Name: report_list report_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_list
    ADD CONSTRAINT report_list_pkey PRIMARY KEY (id);


--
-- TOC entry 4736 (class 2606 OID 33489)
-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (id);


--
-- TOC entry 4738 (class 2606 OID 33491)
-- Name: task_list task_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_list
    ADD CONSTRAINT task_list_pkey PRIMARY KEY (id);


--
-- TOC entry 4742 (class 2606 OID 33493)
-- Name: teams_name teams_name_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams_name
    ADD CONSTRAINT teams_name_pkey PRIMARY KEY (id);


--
-- TOC entry 4740 (class 2606 OID 33495)
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- TOC entry 4744 (class 2606 OID 33497)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4746 (class 2606 OID 33499)
-- Name: vacation vacation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vacation
    ADD CONSTRAINT vacation_pkey PRIMARY KEY (id);


--
-- TOC entry 4747 (class 2606 OID 33500)
-- Name: report_list report_list_fk1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_list
    ADD CONSTRAINT report_list_fk1 FOREIGN KEY (id_task) REFERENCES public.task_list(id);


--
-- TOC entry 4748 (class 2606 OID 33505)
-- Name: task_list task_list_fk2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_list
    ADD CONSTRAINT task_list_fk2 FOREIGN KEY (id_user) REFERENCES public.users(id);


--
-- TOC entry 4749 (class 2606 OID 33510)
-- Name: task_list task_list_fk_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_list
    ADD CONSTRAINT task_list_fk_user FOREIGN KEY (id_user) REFERENCES public.users(id);


--
-- TOC entry 4750 (class 2606 OID 33515)
-- Name: teams teams_fk1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_fk1 FOREIGN KEY (id_team_name) REFERENCES public.teams_name(id);


--
-- TOC entry 4751 (class 2606 OID 33520)
-- Name: teams teams_fk2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_fk2 FOREIGN KEY (id_user) REFERENCES public.users(id);


--
-- TOC entry 4752 (class 2606 OID 33525)
-- Name: users users_fk4; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_fk4 FOREIGN KEY (role) REFERENCES public.role(id);


--
-- TOC entry 4753 (class 2606 OID 33530)
-- Name: vacation vacation_fk1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vacation
    ADD CONSTRAINT vacation_fk1 FOREIGN KEY (id_user) REFERENCES public.users(id);


-- Completed on 2026-05-10 16:03:01

--
-- PostgreSQL database dump complete
--

