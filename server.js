const express = require('express');
const path = require('path');
const fs = require('fs');
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
        
        // List files in public directory with stats
        const publicFiles = fs.readdirSync(publicDir).map(file => {
            const filePath = path.join(publicDir, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                permissions: stats.mode.toString(8),
                isDirectory: stats.isDirectory()
            };
        });
        
        const backgroundFiles = fs.readdirSync(path.join(publicDir, 'backgrounds')).map(file => {
            const filePath = path.join(publicDir, 'backgrounds', file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                permissions: stats.mode.toString(8)
            };
        });
        
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

// Custom static file middleware with detailed logging
const staticMiddleware = (req, res, next) => {
    const publicDir = path.join(__dirname, 'public');
    const requestedPath = req.path;
    const fullPath = path.join(publicDir, requestedPath);
    
    console.log('Static file request:', {
        requestedPath,
        fullPath,
        exists: fs.existsSync(fullPath),
        isFile: fs.existsSync(fullPath) ? fs.statSync(fullPath).isFile() : false,
        permissions: fs.existsSync(fullPath) ? fs.statSync(fullPath).mode.toString(8) : null
    });

    // Check if file exists and is accessible
    try {
        if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
                // File exists and is accessible, let express.static handle it
                return express.static(publicDir)(req, res, next);
            }
        }
        // File doesn't exist or isn't accessible
        console.log('File not found or not accessible:', {
            requestedPath,
            fullPath,
            error: 'File not found or not accessible'
        });
        next();
    } catch (error) {
        console.error('Error accessing file:', {
            requestedPath,
            fullPath,
            error: error.message
        });
        next(error);
    }
};

app.use(staticMiddleware);

// Handle all other routes by serving index.html
app.get('*', (req, res, next) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log('Serving index.html for route:', {
        requestedPath: req.path,
        indexPath: indexPath,
        exists: fs.existsSync(indexPath),
        permissions: fs.existsSync(indexPath) ? fs.statSync(indexPath).mode.toString(8) : null
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
    
    // List files in public directory on startup with stats
    try {
        const publicFiles = fs.readdirSync(path.join(__dirname, 'public')).map(file => {
            const filePath = path.join(__dirname, 'public', file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                permissions: stats.mode.toString(8),
                isDirectory: stats.isDirectory()
            };
        });
        
        const backgroundFiles = fs.readdirSync(path.join(__dirname, 'public', 'backgrounds')).map(file => {
            const filePath = path.join(__dirname, 'public', 'backgrounds', file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                permissions: stats.mode.toString(8)
            };
        });
        
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