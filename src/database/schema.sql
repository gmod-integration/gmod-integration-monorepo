create table if not exists gm_role_auto
(
    guild   char(255) not null,
    id      char(255) not null,
    channel text      null,
    primary key (guild, id)
);

create table if not exists gm_server_generate
(
    token         char(255)                              not null
        primary key,
    ip            text                                   null,
    port          text                                   null,
    name          text                                   null,
    used          tinyint(1) default 0                   null,
    creation_time timestamp  default current_timestamp() null
);

create table if not exists users
(
    steamID64  char(255)                    not null
        primary key,
    steamID    text                         null,
    name       text                         null,
    lastIP     text                         null,
    IPS        longtext collate utf8mb4_bin null
        check (json_valid(`IPS`)),
    lastUpdate timestamp                    null
);


create table if not exists gm_server_sync_chat_rules_preset
(
    id       int auto_increment
        primary key,
    field    text null,
    operator text null,
    value    text null,
    action   text null
);

create table if not exists gm_server_sync_chat_rules
(
    id                int auto_increment
        primary key,
    serverID          char(255)                      null,
    field             text       default 'message'   null,
    operator          text       default 'startWith' null,
    value             text       default '/cmd'      null,
    action            text       default 'block'     null,
    enable            tinyint(1) default 0           null,
    presetOverwriteID int                            null,
    constraint gm_server_sync_chat_rules_gm_server_id_fk
        foreign key (serverID) references gm_server (id)
            on update cascade on delete cascade,
    constraint gm_server_sync_chat_rules_gm_server_sync_chat_rules_preset_id_fk
        foreign key (presetOverwriteID) references gm_server_sync_chat_rules_preset (id)
);
