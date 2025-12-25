const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require("path");
require('dotenv').config();

// import routes and controllers
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/question');
const matchRoutes = require('./routes/match');
const practiceMatchRoutes = require('./routes/practicematch');
const friendRoutes = require('./routes/friend')
const adminRoutes = require('./routes/admin')



const app = express();
const server = http.createServer(app);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// initialize Socket.IO
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// make io accessible in controllers via req.app.get('io')
app.set('io', io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// register routes
app.use('/api/auth', authRoutes);
app.use('/api/question', questionRoutes);
app.use('/api/practice', practiceMatchRoutes)
app.use('/api/friend', friendRoutes)
app.use('/api/match', matchRoutes);
app.use('/api/admin', adminRoutes);
require('./controller/pvpController')(io);

app.get('/', (req, res) =>{
  res.json({
    success: true,
    message: "server is up and running"
  })
} );




// handle mongoose connection and server start
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    server.listen(process.env.port, () => {
      console.log(`Server is running on port ${process.env.port}`);
    });
  })
  .catch(err => console.error('Mongo connection error:', err));

// listen for room creation to bind socket logic
// this assumes matchRoutes.createChallenge attaches roomId to res.locals
// io.on('connection', socket => {
//   console.log('Global socket connected:', socket.id);
// });
