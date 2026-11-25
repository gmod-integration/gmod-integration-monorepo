-- Bound server analytics by both server and event time instead of scanning every recorded session.
CREATE INDEX `gm_server_stat_session_serverID_end_idx`
  ON `gm_server_stat_session` (`serverID`, `sessionEndTimeStamp`);

-- First recorded arrivals are grouped and counted within the selected server and time window.
CREATE INDEX `gm_server_stat_server_id_first_join_idx`
  ON `gm_server_stat` (`server_id`, `first_join`);
