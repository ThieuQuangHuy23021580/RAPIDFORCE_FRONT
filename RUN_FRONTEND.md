python -m http.server 5500

netstat -ano | findstr LISTENING

netstat -ano | findstr :5500

taskkill /PID <port> /F

