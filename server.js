const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Get port from environment variable or use 3000 as fallback
const PORT = process.env.PORT || 3000;

// Get absolute paths
const ROOT_DIR = process.cwd();
const SERVER_DIR = __dirname;
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');
const INDEX_PATH = path.resolve(PUBLIC_DIR, 'index.html');

// Log absolute paths
console.log('Absolute paths:');
console.log('- Root directory:', ROOT_DIR);
console.log('- Server directory:', SERVER_DIR);
console.log('- Public directory:', PUBLIC_DIR);
console.log('- Index file path:', INDEX_PATH);

// Add detailed logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    console.log(`[${timestamp}] Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[${timestamp}] Environment:`, process.env.NODE_ENV);
    console.log(`[${timestamp}] Working directory:`, ROOT_DIR);
    console.log(`[${timestamp}] Process user:`, process.getuid ? process.getuid() : 'unknown');
    console.log(`[${timestamp}] Process group:`, process.getgid ? process.getgid() : 'unknown');
    next();
});

// Log startup information
console.log('Server startup information:');
console.log('- Current working directory:', ROOT_DIR);
console.log('- Server directory:', SERVER_DIR);
console.log('- Public directory:', PUBLIC_DIR);
console.log('- Environment:', process.env.NODE_ENV || 'development');
console.log('- Port:', PORT);
console.log('- Process user:', process.getuid ? process.getuid() : 'unknown');
console.log('- Process group:', process.getgid ? process.getgid() : 'unknown');

// Verify public directory exists and is accessible
try {
    const stats = fs.statSync(PUBLIC_DIR);
    console.log('- Public directory stats:', {
        isDirectory: stats.isDirectory(),
        mode: stats.mode.toString(8),
        uid: stats.uid,
        gid: stats.gid,
        size: stats.size,
        path: PUBLIC_DIR
    });
} catch (error) {
    console.error('ERROR: Could not access public directory:', error);
    console.error('Attempted path:', PUBLIC_DIR);
    process.exit(1);
}

// List files in public directory with detailed stats
try {
    const files = fs.readdirSync(PUBLIC_DIR);
    console.log('- Files in public directory:');
    files.forEach(file => {
        try {
            const filePath = path.join(PUBLIC_DIR, file);
            const stats = fs.statSync(filePath);
            console.log(`  ${file}:`, {
                isDirectory: stats.isDirectory(),
                mode: stats.mode.toString(8),
                uid: stats.uid,
                gid: stats.gid,
                size: stats.size,
                path: filePath
            });
        } catch (error) {
            console.error(`  Error getting stats for ${file}:`, error);
        }
    });
} catch (error) {
    console.error('ERROR: Could not read public directory:', error);
    console.error('Attempted path:', PUBLIC_DIR);
    process.exit(1);
}

// Verify index.html exists and is readable
try {
    const stats = fs.statSync(INDEX_PATH);
    console.log('- index.html stats:', {
        exists: true,
        mode: stats.mode.toString(8),
        uid: stats.uid,
        gid: stats.gid,
        size: stats.size,
        path: INDEX_PATH
    });
    // Try to read the file
    fs.accessSync(INDEX_PATH, fs.constants.R_OK);
    console.log('- index.html is readable');
} catch (error) {
    console.error('ERROR: index.html is not accessible:', error);
    console.error('Attempted path:', INDEX_PATH);
    process.exit(1);
}

// Serve static files from the public directory with explicit options
app.use(express.static(PUBLIC_DIR, {
    dotfiles: 'ignore',
    etag: true,
    index: false,
    maxAge: '1h',
    fallthrough: false
}));

// Handle favicon requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Handle healthcheck explicitly
app.get('/', (req, res) => {
    console.log('Healthcheck request received');
    console.log('Checking index.html at:', INDEX_PATH);
    
    try {
        // Verify file exists and is readable
        try {
            fs.accessSync(INDEX_PATH, fs.constants.R_OK);
            console.log('index.html exists and is readable');
        } catch (error) {
            console.error('Error accessing index.html:', error);
            console.error('Attempted path:', INDEX_PATH);
            return res.status(500).json({ 
                error: 'Server configuration error', 
                details: 'index.html is not accessible',
                path: INDEX_PATH,
                errorMessage: error.message,
                rootDir: ROOT_DIR,
                publicDir: PUBLIC_DIR
            });
        }

        // Set security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

        // Try to read and send the file
        fs.readFile(INDEX_PATH, (err, data) => {
            if (err) {
                console.error('Error reading index.html:', err);
                console.error('Attempted path:', INDEX_PATH);
                return res.status(500).json({ 
                    error: 'Error reading index.html',
                    details: err.message,
                    path: INDEX_PATH,
                    rootDir: ROOT_DIR,
                    publicDir: PUBLIC_DIR
                });
            }
            console.log('Successfully read index.html, size:', data.length);
            res.sendFile(INDEX_PATH, (err) => {
                if (err) {
                    console.error('Error sending index.html:', err);
                    console.error('Attempted path:', INDEX_PATH);
                    return res.status(500).json({ 
                        error: 'Error sending index.html',
                        details: err.message,
                        path: INDEX_PATH,
                        rootDir: ROOT_DIR,
                        publicDir: PUBLIC_DIR
                    });
                }
                console.log('Successfully sent index.html');
            });
        });
    } catch (error) {
        console.error('Error in healthcheck handler:', error);
        res.status(500).json({ 
            error: 'Internal server error during healthcheck',
            details: error.message,
            stack: error.stack,
            path: INDEX_PATH,
            rootDir: ROOT_DIR,
            publicDir: PUBLIC_DIR
        });
    }
});

// Serve index.html for all other routes
app.get('*', (req, res, next) => {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    console.log(`[${new Date().toISOString()}] Attempting to serve index.html from:`, indexPath);
    
    // Verify index.html exists
    if (!fs.existsSync(indexPath)) {
        console.error('ERROR: index.html not found at:', indexPath);
        return res.status(500).send('Server configuration error: index.html not found');
    }

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            next(err);
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
    const host = server.address();
    console.log(`Server is running on ${host.address}:${host.port}`);
    console.log(`Server URL: http://${host.address}:${host.port}`);
    
    // Verify we can read index.html after server starts
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    fs.readFile(indexPath, (err, data) => {
        if (err) {
            console.error('ERROR: Could not read index.html after server start:', err);
            process.exit(1);
        }
        console.log('Successfully verified index.html after server start, size:', data.length);
    });
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
    }
    process.exit(1);
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
}); 