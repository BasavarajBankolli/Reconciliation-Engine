const app = require('./app');
const mongoose = require('mongoose');

const PORT = 5000;
// 127.0.0.1 is standard localhost for your local machine
const MONGO_URI = 'mongodb://127.0.0.1:27017/crypto-reconciler';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB service!');
        app.listen(PORT, () => {
            console.log(`Server running at: http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('DB connection failed! Error:', err.message);
    });
