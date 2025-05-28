const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Get port from environment variable or use 3002 as fallback
const PORT = process.env.PORT || 3002;

// Basic request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const publicDir = path.join(__dirname, 'public');
        const indexPath = path.join(publicDir, 'index.html');
        
        // List files in public directory
        const publicFiles = await fs.promises.readdir(publicDir);
        const backgroundFiles = await fs.promises.readdir(path.join(publicDir, 'backgrounds'));
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: {
                NODE_ENV: process.env.NODE_ENV || 'development',
                PORT: PORT,
                cwd: process.cwd(),
                __dirname: __dirname
            },
            paths: {
                public: publicDir,
                index: indexPath
            },
            files: {
                public: publicFiles,
                backgrounds: backgroundFiles
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true
}));

// Handle all other routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Current directory:', process.cwd());
    console.log('Server directory:', __dirname);
    console.log('Public directory:', path.join(__dirname, 'public'));
    console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: PORT
    });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    server.close(() => {
        console.log('Server closed. Exiting process...');
        process.exit(0);
    });
});

server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
    }
}); 