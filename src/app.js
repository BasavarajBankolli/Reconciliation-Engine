const express = require('express');
const app = express();

app.use(express.json());

// Simple home route
app.get('/', (req, res) => {
    res.send('Crypto Reconciler Server is running!');
});

// A test API route
app.get('/api', (req, res) => {
    res.json({ message: "Hello! The connection is working." });
});

module.exports = app;
