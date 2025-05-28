const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Get port from environment variable or use 3000 as fallback
const PORT = process.env.PORT || 3000;

// Basic logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Simple health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: {
            NODE_ENV: process.env.NODE_ENV,
            RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR,
            PORT: PORT,
            CWD: process.cwd(),
            __dirname: __dirname
        }
    });
});

// Serve static files from public directory
app.use(express.static('public'));

// Handle root path
app.get('/', (req, res) => {
    const indexPath = path.join(process.cwd(), 'public', 'index.html');
    console.log('Attempting to serve index.html from:', indexPath);
    
    // Check if file exists
    if (!fs.existsSync(indexPath)) {
        console.error('index.html not found at:', indexPath);
        return res.status(500).json({
            error: 'Server configuration error',
            details: 'index.html not found',
            path: indexPath,
            cwd: process.cwd(),
            env: {
                NODE_ENV: process.env.NODE_ENV,
                RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR
            }
        });
    }

    // Send the file
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            res.status(500).json({
                error: 'Error sending index.html',
                details: err.message,
                path: indexPath,
                cwd: process.cwd()
            });
        }
    });
});

// Handle all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'), (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            res.status(500).json({
                error: 'Error sending index.html',
                details: err.message,
                path: path.join(process.cwd(), 'public', 'index.html'),
                cwd: process.cwd()
            });
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Current working directory:', process.cwd());
    console.log('__dirname:', __dirname);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('RAILWAY_WORKSPACE_DIR:', process.env.RAILWAY_WORKSPACE_DIR);
    
    // List files in public directory
    const publicDir = path.join(process.cwd(), 'public');
    try {
        const files = fs.readdirSync(publicDir);
        console.log('Files in public directory:', files);
    } catch (error) {
        console.error('Error reading public directory:', error);
    }
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}); 