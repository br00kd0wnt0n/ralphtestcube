const express = require('express');
const path = require('path');
const app = express();

// Get port from environment variable or use 3002 as fallback
const PORT = process.env.PORT || 3002;

// Basic request logging with more details
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR,
        cwd: process.cwd(),
        __dirname: __dirname
    });
    next();
});

// Health check endpoint with more details
app.get('/health', (req, res) => {
    try {
        const publicDir = path.join(__dirname, 'public');
        const indexPath = path.join(publicDir, 'index.html');
        
        console.log('Health check - Checking paths:');
        console.log('Public directory:', publicDir);
        console.log('Index path:', indexPath);
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: {
                NODE_ENV: process.env.NODE_ENV,
                PORT: process.env.PORT,
                RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR,
                cwd: process.cwd(),
                __dirname: __dirname
            },
            paths: {
                public: publicDir,
                index: indexPath
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            stack: error.stack
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        status: 'error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public'), {
    fallthrough: true,
    dotfiles: 'allow'
}));

// Handle all other routes by serving index.html
app.get('*', (req, res, next) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log('Serving index.html from:', indexPath);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error serving index.html:', err);
            next(err);
        }
    });
});

// Start the server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log('Current directory:', process.cwd());
    console.log('Server directory:', __dirname);
    console.log('Public directory:', path.join(__dirname, 'public'));
    console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR
    });
});

server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
    }
}); 