create table if not exists banIPs
(
    ip        char(255)                             not null
        primary key,
    steamID64 text                                  null,
    discordID text                                  null,
    name      text                                  null,
    banDate   timestamp default current_timestamp() not null,
    banTime   int       default 0                   not null,
    admin     text                                  null,
    reason    text                                  null
);

create table if not exists banUsers
(
    steamID64 char(255)                             null,
    discordID text                                  null,
    ip        text                                  null,
    name      text                                  null,
    banDate   timestamp default current_timestamp() not null,
    banTime   int       default 0                   not null,
    admin     text                                  null,
    reason    text                                  null,
    permanent tinyint(1)                            null,
    unbanDate timestamp                             null
);

create table if not exists ban_list
(
    steamid   text null,
    steamid64 text null,
    discordid text null,
    ip        text null
);

create table if not exists devUsers
(
    steamID64 char(255) not null
        primary key
);

create table if not exists gm_emergency
(
    guild char(255) not null
        primary key
);

create table if not exists gm_errors
(
    id         int auto_increment
        primary key,
    realm      text                                  null,
    date       timestamp default current_timestamp() null,
    error      text                                  null,
    stack      text                                  null,
    name       text                                  null,
    identifier text                                  null,
    workshopID text                                  null,
    uptime     int                                   null
);

create table if not exists gm_gmodstore_purchases
(
    steamID64 char(255)                             not null
        primary key,
    guild     text                                  null,
    `revoke`  tinyint(1)                            null,
    buyDate   timestamp default current_timestamp() null,
    editDate  timestamp default current_timestamp() null on update current_timestamp()
);

create table if not exists gm_guild_member
(
    guild_id char(255)                             not null,
    user_id  char(255)                             not null,
    date     timestamp default current_timestamp() null,
    primary key (guild_id, user_id)
);

create table if not exists gm_guild_suggest
(
    id              int auto_increment
        primary key,
    userSuggestorID int                                    not null,
    suggest         text                                   null,
    creationTime    timestamp  default current_timestamp() null,
    finalState      tinyint(1)                             null,
    category        char(255)                              null,
    enable          tinyint(1) default 0                   not null
);

create table if not exists gm_guild_suggest_category
(
    id      int auto_increment
        primary key,
    guildID text                 null,
    name    text                 null,
    enable  tinyint(1) default 0 null
);

create table if not exists gm_guild_tickets
(
    guildID        char(255)                                                not null,
    threadID       char(255)                                                not null,
    userID         text                                                     not null,
    adminsIDS      longtext collate utf8mb4_bin default '[]'                null,
    title          text                                                     null,
    description    text                                                     null,
    adminMessageID text                                                     null,
    userMessageID  text                                                     null,
    creationDate   timestamp                    default current_timestamp() null,
    adminChannelID text                                                     null,
    primary key (guildID, threadID)
);

create table if not exists gm_log_api
(
    server_id char(255)  null,
    request   text       null,
    is_post   tinyint(1) null,
    body      text       null
);

create table if not exists gm_role
(
    guild   char(255)            not null,
    id      char(255)            not null,
    is_give int        default 1 null,
    enable  tinyint(1) default 0 null,
    primary key (guild, id)
);

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

create table if not exists gm_server_logs
(
    serverID  char(255)                             null,
    type      text                                  not null,
    data      text                                  not null,
    timeStamp timestamp default current_timestamp() not null,
    constraint gm_server_logs_gm_server_id_fk
        foreign key (serverID) references gm_server (id)
            on update cascade on delete cascade
);

create table if not exists gm_server_roles
(
    id            int auto_increment
        primary key,
    serverID      char(17)             null,
    role          text                 null,
    roleName      text                 null,
    prefix        text                 null,
    discordRoleID text                 null,
    enablePrefix  tinyint(1) default 0 null,
    enableSync    tinyint(1) default 0 null,
    constraint gm_server_roles_gm_server_id_fk
        foreign key (serverID) references gm_server (id)
            on update cascade on delete cascade
);

create table if not exists gm_server_settings
(
    serverID char(255) not null,
    setting  char(255) not null,
    value    text      null,
    primary key (serverID, setting),
    constraint gm_server_settings_gm_server_id_fk
        foreign key (serverID) references gm_server (id)
            on update cascade on delete cascade
);

create table if not exists gm_server_subscription
(
    serverID     char(255)                             null,
    discordID    char(255)                             null,
    subscription text                                  null,
    createDate   timestamp default current_timestamp() null,
    lastRenew    timestamp                             null
);

create table if not exists gm_setting
(
    id      char(255) not null,
    setting char(255) not null,
    value   text      null,
    primary key (id, setting)
);

create table if not exists gm_server_stat_session
(
    serverID            char(255)                             null,
    steamID64           char(255)                             null,
    time                int                                   null,
    deaths              int                                   null,
    kills               int                                   null,
    customValues        text                                  null,
    sessionEndTimeStamp timestamp default current_timestamp() not null,
    constraint gm_server_stat_session_1_gm_user_steam_steam_id_fk
        foreign key (serverID) references gm_server (id)
            on update cascade on delete cascade,
    constraint gm_server_stat_session_gm_user_steam_steam_id_fk
        foreign key (steamID64) references gm_user_steam (steam_id)
            on update cascade on delete cascade
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
