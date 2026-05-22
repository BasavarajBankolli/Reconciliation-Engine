const app = require('./app');

// Use port 5000 directly
const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server is running at: http://localhost:${PORT}`);
});
