#!/bin/bash

# Get the directory path of the script
SCRIPT_PATH="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Create logs directory if it doesn't exist
LOGS_DIR="${SCRIPT_PATH}/logs"
if [ ! -d "$LOGS_DIR" ]; then
    mkdir -p "$LOGS_DIR"
fi

# Change to the API directory
cd "${SCRIPT_PATH}"

# Start the API as a background process in logs and with the date in the log name
nohup node "${SCRIPT_PATH}/gm_integration_api.js" > "${LOGS_DIR}/$(date +"%Y-%m-%d").log" 2>&1 &

echo "API Started"
