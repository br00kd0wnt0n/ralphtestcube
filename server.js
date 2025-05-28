const express = require('express');
const path = require('path');
const app = express();

// Get port from environment variable or use 3000 as fallback
const PORT = process.env.PORT || 3000;

// Add detailed logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    next();
});

// Serve static files from the public directory with explicit options
app.use(express.static(path.join(__dirname, 'public'), {
    dotfiles: 'ignore',
    etag: true,
    index: false,
    maxAge: '1h'
}));

// Handle favicon requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content for favicon
});

// Explicitly handle root path
app.get('/', (req, res) => {
    console.log('Handling root path request');
    try {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        console.log('Attempting to serve index.html from:', indexPath);
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error('Error sending index.html:', err);
                res.status(500).send('Error loading page');
            }
        });
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Serve the main HTML file for all other routes
app.get('*', (req, res) => {
    console.log('Handling wildcard route:', req.url);
    try {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        console.log('Attempting to serve index.html from:', indexPath);
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error('Error sending index.html:', err);
                res.status(500).send('Error loading page');
            }
        });
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).send('Internal Server Error');
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
    const host = server.address();
    console.log(`Server is running on ${host.address}:${host.port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Current working directory: ${process.cwd()}`);
    console.log(`Public directory path: ${path.join(__dirname, 'public')}`);
    console.log(`Available files in public directory:`, require('fs').readdirSync(path.join(__dirname, 'public')));
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
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