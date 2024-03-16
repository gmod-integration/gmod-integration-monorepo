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

create table if not exists gm_discordToken
(
    discordID      char(255) not null
        primary key,
    accessToken    text      null,
    refreshToken   text      null,
    creationDate   timestamp null,
    expirationDate timestamp null
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

create table if not exists gm_guild
(
    guild    char(255) charset utf8mb4 not null
        primary key,
    name     text                      null,
    member   int                       null,
    language text                      null
)
    collate = utf8mb4_unicode_ci;

create table if not exists gm_guild_member
(
    guild_id char(255)                             not null,
    user_id  char(255)                             not null,
    date     timestamp default current_timestamp() null,
    primary key (guild_id, user_id)
);

create table if not exists gm_guild_not_verify_role
(
    guildID char(255) not null
        primary key,
    roleID  text      null
);

create table if not exists gm_guild_settings
(
    guildID char(255) not null,
    setting char(255) not null,
    value   text      null,
    primary key (guildID, setting)
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

create table if not exists gm_guild_verify_channel
(
    guildID   char(255) not null
        primary key,
    channelID text      null
);

create table if not exists gm_guild_verify_message
(
    guildID   char(255) not null
        primary key,
    channelID text      null,
    messageID text      null
);

create table if not exists gm_guild_verify_roles
(
    guildID char(255)            not null,
    roleID  char(255)            not null,
    isGive  tinyint(1) default 1 null,
    enable  tinyint(1) default 0 null,
    primary key (guildID, roleID)
);

create table if not exists gm_link
(
    id     int auto_increment
        primary key,
    guild  text charset utf8mb4                     not null,
    alias  text       default 'example'             not null,
    url    text       default 'https://example.com' not null,
    active tinyint(1) default 0                     not null
)
    collate = utf8mb4_unicode_ci;

create table if not exists gm_log_api
(
    server_id char(255)  null,
    request   text       null,
    is_post   tinyint(1) null,
    body      text       null
);

create table if not exists gm_panelToken
(
    discordID      char(255) not null
        primary key,
    accessToken    text      null,
    creationDate   text      null,
    expirationDate text      null
);

create table if not exists gm_premium
(
    guild          char(255)                            not null
        primary key,
    expired        tinyint(1)                           null,
    creationDate   datetime default current_timestamp() null,
    expirationDate datetime default current_timestamp() null,
    transaction    text                                 null,
    buyer          text                                 null
);

create table if not exists gm_report
(
    id     int auto_increment
        primary key,
    guild  text null,
    admin  text null,
    user   text null,
    reason text null,
    proof  text null
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

create table if not exists gm_server
(
    id              char(255)                       not null
        primary key,
    token           char(255)                       not null,
    publicTempToken text                            null,
    guild           text                            not null,
    ip              text       default '127.0.0.1'  not null,
    port            text       default '27015'      not null,
    name            text       default 'New Server' not null,
    image           text       default ''           not null,
    verified        tinyint(1) default 0            not null,
    bump            int        default 0            null
);

create table if not exists gm_server_ban
(
    id       int auto_increment
        primary key,
    server   text null,
    steamid  text null,
    duration text null,
    reason   text null,
    `by`     text null
);

create table if not exists gm_server_customValues
(
    serverID char(255) null,
    value    char(255) null,
    enable   tinyint   null
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

create table if not exists gm_server_leaderboard_options
(
    serverID     char(17)                              not null,
    messageID    char(255)                             not null,
    category     text                                  null,
    limitValue   int                                   null,
    offsetValue  int                                   null,
    orderValue   text                                  null,
    page         int                                   null,
    totalPages   int                                   null,
    creationDate timestamp default current_timestamp() null,
    updateDate   timestamp default current_timestamp() null on update current_timestamp(),
    total        int                                   null,
    primary key (messageID, serverID),
    constraint gm_server_leaderboard_options_gm_server_id_fk
        foreign key (serverID) references gm_server (id)
);

create table if not exists gm_server_link
(
    id     int auto_increment
        primary key,
    guild  text null,
    server text null,
    name   text null,
    url    text null
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

create table if not exists gm_server_screenshot_channels
(
    guildID   char(255)            not null,
    serverID  char(255)            not null,
    adminCmd  tinyint(1) default 0 not null,
    channelID text                 null,
    webhook   text                 null,
    token     text                 null,
    primary key (serverID, guildID, adminCmd),
    constraint gm_server_screenshot_channels_gm_server_id_fk
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

create table if not exists gm_server_status
(
    id          char(255) charset utf8mb4                        not null
        primary key,
    ip          text                                             null,
    port        text                                             null,
    last_update timestamp            default current_timestamp() null,
    hostname    text                 default 'Gmod Server'       null,
    maxplayers  int                  default 0                   null,
    players     int                  default 0                   null,
    map         text charset utf8mb4 default 'gm_construct'      null,
    gamemode    text charset utf8mb4 default 'sandbox'           null,
    constraint gm_server_status_gm_server_id_fk
        foreign key (id) references gm_server (id)
            on update cascade on delete cascade
)
    collate = utf8mb4_unicode_ci;

create table if not exists gm_server_status_v3
(
    serverID   char(255) not null
        primary key,
    players    int       null,
    maxPlayers int       null,
    map        text      null,
    hostname   text      null,
    gameMode   text      null,
    port       text      null,
    ip         text      null,
    uptime     int       null,
    constraint gm_server_status_v3_gm_server_id_fk
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

create table if not exists gm_stat_discord
(
    guild        int null,
    guildMembers int null,
    id           int null
);

create table if not exists gm_status
(
    guild   char(255) not null,
    server  char(255) not null,
    message char(255) not null,
    channel text      null,
    primary key (guild, server),
    constraint gm_status_gm_server_id_fk
        foreign key (server) references gm_server (id)
            on update cascade on delete cascade
);

create table if not exists gm_status_button
(
    id     int auto_increment
        primary key,
    guild  text charset utf8mb4                               null,
    server char(255) charset utf8mb4                          null,
    name   text charset utf8mb4 default 'example'             null,
    url    text charset utf8mb4 default 'https://example.com' null,
    emoji  text                 default ''                    null,
    enable tinyint(1)           default 0                     null,
    constraint gm_status_button_gm_server_id_fk
        foreign key (server) references gm_server (id)
            on update cascade on delete cascade
)
    collate = utf8mb4_unicode_ci;

create table if not exists gm_sync_chat
(
    guild   char(255) not null,
    channel char(255) not null,
    server  char(255) not null,
    id      text      null,
    token   text      null,
    primary key (guild, server),
    constraint gm_sync_chat_gm_server_id_fk
        foreign key (server) references gm_server (id)
            on update cascade on delete cascade
);

create table if not exists gm_todo_task
(
    id    int auto_increment
        primary key,
    task  text                         null,
    data  longtext collate utf8mb4_bin null
        check (json_valid(`data`)),
    error text                         null
);

create table if not exists gm_token
(
    token char(255)            not null
        primary key,
    ip    text                 null,
    port  text                 null,
    name  text                 null,
    rcon  text                 null,
    `use` tinyint(1) default 0 null
);

create table if not exists gm_user
(
    id         char(30)            not null
        primary key,
    `rank`     text default 'user' null,
    steam      text                null,
    email      text                null,
    username   text                null,
    last_oauth timestamp           null,
    trust      int  default 50     null
);

create table if not exists gm_server_bump
(
    memberID char(255)                             not null,
    serverID char(255)                             not null,
    date     timestamp default current_timestamp() null,
    primary key (serverID, memberID),
    constraint gm_server_bump_gm_server_id_fk
        foreign key (serverID) references gm_server (id)
            on update cascade on delete cascade,
    constraint gm_server_bump_gm_user_id_fk
        foreign key (memberID) references gm_user (id)
            on update cascade on delete cascade
);

create table if not exists gm_user_invoices
(
    discordID text null,
    invoiceID text null
);

create table if not exists gm_user_steam
(
    steam_id      char(30)                              not null
        primary key,
    username      text                                  null,
    last_ip       text                                  null,
    last_connect  timestamp default current_timestamp() null,
    total_time    int       default 0                   null,
    total_death   int       default 0                   null,
    total_kill    int       default 0                   null,
    total_connect int       default 1                   null
);

create table if not exists gm_server_stat
(
    steam_id          char(30)                               not null,
    server_id         char(255)                              not null,
    name              text       default 'unknown'           null,
    `rank`            text       default 'user'              null,
    total_time        int        default 0                   not null,
    total_death       int        default 0                   not null,
    total_kill        int        default 0                   not null,
    total_money       int        default 0                   not null,
    total_connect     int        default 0                   not null,
    last_connect      timestamp  default current_timestamp() not null,
    first_join        timestamp  default current_timestamp() not null,
    custom_values     longtext   default '{}'                null,
    bypassMaintenance tinyint(1) default 0                   null,
    primary key (server_id, steam_id),
    constraint gm_server_stat_gm_server_id_fk
        foreign key (server_id) references gm_server (id)
            on update cascade on delete cascade,
    constraint gm_server_stat_gm_user_steam_steam_id_fk
        foreign key (steam_id) references gm_user_steam (steam_id)
            on update cascade on delete cascade
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

create table if not exists gm_user_username
(
    discord_id char(255) not null,
    guild_id   char(255) not null,
    steam_id   text      null,
    username   text      null,
    primary key (discord_id, guild_id)
);

create table if not exists server_stat
(
    server_name text                                             null,
    server_ip   char(32) charset utf8mb4                         not null
        primary key,
    nb_players  text charset utf8mb4                             null,
    timestamp   text charset utf8mb4 default current_timestamp() null,
    version     text charset utf8mb4                             null
)
    collate = utf8mb4_unicode_ci;

create table if not exists server_warn
(
    steamid64   char(17) not null
        primary key,
    steamid     text     null,
    reason      text     null,
    server_name text     null,
    gravity     int      null
);

create table if not exists shadowBanUsers
(
    steamID64 char(255) not null
        primary key,
    reason    text      null
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
    serverID          char(255)  null,
    field             text       null,
    operator          text       null,
    value             text       null,
    action            text       null,
    enable            tinyint(1) null,
    presetOverwriteID int        null,
    constraint gm_server_sync_chat_rules_gm_server_id_fk
        foreign key (serverID) references gm_server (id)
            on update cascade on delete cascade,
    constraint gm_server_sync_chat_rules_gm_server_sync_chat_rules_preset_id_fk
        foreign key (presetOverwriteID) references gm_server_sync_chat_rules_preset (id)
);