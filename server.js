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
        
        // List files in public directory
        const fs = require('fs');
        const publicFiles = fs.readdirSync(publicDir);
        const backgroundFiles = fs.readdirSync(path.join(publicDir, 'backgrounds'));
        
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

// Serve static files from the public directory with detailed logging
const staticMiddleware = express.static(path.join(__dirname, 'public'), {
    fallthrough: true,
    dotfiles: 'allow'
});

app.use((req, res, next) => {
    const originalSendFile = res.sendFile;
    res.sendFile = function(path, options, callback) {
        console.log('Serving file:', {
            requestedPath: req.path,
            resolvedPath: path,
            exists: require('fs').existsSync(path)
        });
        return originalSendFile.call(this, path, options, callback);
    };
    next();
});

app.use(staticMiddleware);

// Handle all other routes by serving index.html
app.get('*', (req, res, next) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log('Serving index.html for route:', {
        requestedPath: req.path,
        indexPath: indexPath,
        exists: require('fs').existsSync(indexPath)
    });
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
    
    // List files in public directory on startup
    const fs = require('fs');
    try {
        const publicFiles = fs.readdirSync(path.join(__dirname, 'public'));
        const backgroundFiles = fs.readdirSync(path.join(__dirname, 'public', 'backgrounds'));
        console.log('Available files:', {
            public: publicFiles,
            backgrounds: backgroundFiles
        });
    } catch (error) {
        console.error('Error listing files:', error);
    }
});

server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
    }
}); 