#!/bin/bash

# Define the script path and log file
SCRIPT_PATH="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
LOG_FILE="${SCRIPT_PATH}/logs/monitor.log"

# Function to check if the process is running
check_process() {
    # Check if the API process is running
    if pgrep -f "node src/gm_integration_api.js" > /dev/null
    then
        echo "$(date +%F_%T) - API is running" >> "${LOG_FILE}"
    else
        echo "$(date +%F_%T) - API is not running, starting now..." >> "${LOG_FILE}"
        cd "${SCRIPT_PATH}"
        npm run start
    fi
}

# Run the check_process function
check_process