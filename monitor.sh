if pgrep -f "node src/gm_integration_api.js" > /dev/null
    then
    # YYYY-MM-DD[space]HH:MM:SS
        echo "[$(date +%F) $(date +%T)]  API is Running" >> "logs/monitor.log"
    else
        echo "[$(date +%F) $(date +%T)} - API is NOT Running" >> "logs/monitor.log"
        npm run start
    fi