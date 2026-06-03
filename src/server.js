const express = require('express');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

// Serve static educational dashboard files
app.use(express.static(path.join(__dirname, '../public')));

// Simple Rate Limiter to prevent abuse of the backend execution shells
const requestCounts = {};
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

const rateLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!requestCounts[ip]) {
        requestCounts[ip] = [];
    }
    
    // Filter out requests older than the window
    requestCounts[ip] = requestCounts[ip].filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);
    
    if (requestCounts[ip].length >= MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).json({ 
            error: "Too many optimization requests. Please wait a minute before trying again." 
        });
    }
    
    requestCounts[ip].push(now);
    next();
};

// In-Memory Database Fallback to guarantee zero-configuration runs for interviewers
const jobQueue = {};

// Optional: Mongoose integration if MONGO_URI is defined
let mongooseConnected = false;
let JobModel = null;

if (process.env.MONGO_URI) {
    try {
        const mongoose = require('mongoose');
        mongoose.connect(process.env.MONGO_URI);
        
        const jobSchema = new mongoose.Schema({
            id: { type: String, required: true, unique: true },
            status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'queued' },
            backend: { type: String, required: true },
            coordinates: { type: Array, required: true },
            results: { type: Array, default: null },
            error: { type: String, default: null },
            createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours
        });
        
        JobModel = mongoose.model('Job', jobSchema);
        mongooseConnected = true;
        console.log("[Database] Connected successfully to MongoDB Atlas.");
    } catch (err) {
        console.warn("[Database] MongoDB connection failed. Falling back to persistent in-memory engine.", err.message);
    }
} else {
    console.log("[Database] No MONGO_URI found in .env. Operating in high-speed, zero-config in-memory mode.");
}

// Helper to update job state across both MongoDB and the in-memory queue fallback
async function updateJobState(jobId, updates) {
    jobQueue[jobId] = { ...jobQueue[jobId], ...updates };
    
    if (mongooseConnected && JobModel) {
        try {
            await JobModel.updateOne({ id: jobId }, { $set: updates });
        } catch (err) {
            console.error(`[Database] Failed to persist job update for ${jobId}:`, err.message);
        }
    }
}

// API Route: Initiate Quantum/Classical Solver Job
app.post('/api/quantum/solve', rateLimiter, async (req, res) => {
    const { coordinates, useCloud } = req.body;
    
    // Validation Rule 1: Verify layout format
    if (!coordinates || !Array.isArray(coordinates)) {
        return res.status(400).json({ error: "Invalid coordinate grid layout." });
    }

    // Validation Rule 2: Limit node scale to protect cloud budgets and prevent hanging simulations
    if (coordinates.length < 2) {
        return res.status(400).json({ error: "Please place at least two traffic light hubs to optimize." });
    }
    if (coordinates.length > 12) {
        return res.status(400).json({ error: "The educational sandbox is capped at 12 nodes to ensure responsive execution." });
    }

    // Validation Rule 3: Coordinate bounds check
    for (const coord of coordinates) {
        if (!Array.isArray(coord) || coord.length !== 2) {
            return res.status(400).json({ error: "Each coordinate must be a valid [x, y] pair." });
        }
        const [x, y] = coord;
        if (x < 0 || x > 10 || y < 0 || y > 10) {
            return res.status(400).json({ error: "Coordinates must fit inside the 0 to 10 micrometer grid range." });
        }
    }

    const jobId = uuidv4();
    const jobData = {
        id: jobId,
        status: "queued",
        backend: useCloud ? "pasqal_cloud" : "local_emulator",
        coordinates,
        results: null,
        error: null
    };

    jobQueue[jobId] = jobData;

    if (mongooseConnected && JobModel) {
        try {
            const dbJob = new JobModel(jobData);
            await dbJob.save();
        } catch (err) {
            console.error("[Database] Failed to write initial job record:", err.message);
        }
    }

    const scriptTarget = useCloud ? 'src/quantum/cloud_solver.py' : 'src/quantum/local_emulator.py';
    
    console.log(`[Gateway] Dispatching async workflow job ${jobId} via ${scriptTarget}`);
    
    // Explicit environment pass down to protect runtime packages
    const worker = spawn('python3', [scriptTarget, JSON.stringify(coordinates)], { 
        shell: true,
        env: process.env,
        windowsVerbatimArguments: true
    });
    
    await updateJobState(jobId, { status: "processing" });

    let stdoutData = "";
    let stderrData = "";
    
    worker.stdout.on('data', (data) => { stdoutData += data.toString(); });
    worker.stderr.on('data', (data) => { stderrData += data.toString(); });
    
    worker.on('close', async (code) => {
        try {
            const jsonStartIndex = stdoutData.indexOf('{');
            const jsonEndIndex = stdoutData.lastIndexOf('}');
            
            if (jsonStartIndex === -1 || jsonEndIndex === -1) {
                throw new Error("No clean JSON payload detected in execution stream.");
            }
            
            const cleanJsonStr = stdoutData.substring(jsonStartIndex, jsonEndIndex + 1);
            const response = JSON.parse(cleanJsonStr);
            
            if (response.status === "success") {
                await updateJobState(jobId, {
                    status: "completed",
                    results: response.data
                });
            } else {
                await updateJobState(jobId, {
                    status: "failed",
                    error: response.message
                });
            }
        } catch (err) {
            await updateJobState(jobId, {
                status: "failed",
                error: stderrData.trim() || "Failed to process internal output parameters."
            });
        }
        console.log(`[Gateway] Job ${jobId} updated to state: ${jobQueue[jobId].status}`);
    });

    return res.status(202).json({ 
        message: "Asynchronous simulation processing initiated.", 
        jobId,
        backend: useCloud ? "Pasqal Cloud (SA Region)" : "Local Quantum Emulator"
    });
});

// API Route: Poll Job Execution Status
app.get('/api/quantum/jobs/:id', async (req, res) => {
    const jobId = req.params.id;
    let job = jobQueue[jobId];
    
    if (!job && mongooseConnected && JobModel) {
        try {
            job = await JobModel.findOne({ id: jobId }).lean();
        } catch (err) {
            console.error("[Database] Error querying job database records:", err.message);
        }
    }
    
    if (!job) {
        return res.status(404).json({ error: "The requested job tracking reference is missing or expired." });
    }
    
    return res.json(job);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[MVP Online] Enterprise Quantum API Interface on port ${PORT}`));