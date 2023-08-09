#!/bin/bash

# Get the directory path of the script
SCRIPT_PATH="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Check if the API process is running
if pgrep -f "node ${SCRIPT_PATH}/gm_integration_api.js" > /dev/null
then
    # Kill the API process if it's running
    pkill -f "node ${SCRIPT_PATH}/gm_integration_api.js"
    echo "API Stopped"
else
    echo "API is not Running"
fi
