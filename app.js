const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Simple REST API test route
app.get("/", (req, res) => {
    res.send({ status: "ok", message: "Device Sync Socket backend is running" });
});

// Create HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map<dbId: string, Map<deviceId: string, WebSocket>>
const devices = new Map();

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
    console.log("New WebSocket client connected");

    // Extract query parameters from the request URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryParams = url.searchParams;
    const deviceId = queryParams.get("deviceId");

    // Add Device if not existing
    if (deviceId) {
        let dbDevices = devices.get(deviceId);

        if (!dbDevices) {
            dbDevices = new Map();
        }
        devices.set(deviceId, ws);
        console.log("\n\ndevices = ", devices.keys());
    } else {
        console.log("Unable to connect without a device Id");
        return;
    }

    ws.on("message", (message) => {
        const data = message.toString();
        let parsed;
        try {
            parsed = JSON.parse(data);
        } catch (err) {
            console.error("Invalid JSON received:", err);
            return;
        }

        console.log("\nparsed = ", parsed);
        if (!parsed.dbId || !parsed.toDeviceId || !parsed.fromDeviceId) {
            console.error("Missing Ids in message");
            return;
        }

        const { dbId, fromDeviceId, toDeviceId } = parsed;
        console.log(`Received message from ${fromDeviceId} in db ${dbId} to ${toDeviceId}`);

        if (toDeviceId === "broadcast") {
            for (const device of parsed.devices) {
                const deviceWS = devices.get(device);
                if (!deviceWS || deviceWS.readyState !== WebSocket.OPEN) continue;

                deviceWS.send(data);
            }
        } else {
            const targetWs = devices.get(toDeviceId);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(data);
            } else {
                console.log(`Target ${toDeviceId} not found or not open`);
            }
        }
    });

    ws.on("close", () => {
        console.log("WebSocket client disconnecting");
        for (const [deviceId, dWs] of devices.entries()) {
            if (dWs === ws) {
                devices.delete(deviceId);
                console.log(deviceId + " disconnected.\n");
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`WebSocket ready at ws://localhost:${PORT}`);
});
