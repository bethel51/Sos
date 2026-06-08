const { Server } = require('socket.io');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket client connected: ${socket.id}`);

    // Join room for a specific user's SOS tracking
    socket.on('join_user_room', (userId) => {
      socket.join(userId);
      console.log(`Socket ${socket.id} joined room: ${userId}`);
    });

    // Join room for admin monitoring
    socket.on('join_admin_room', () => {
      socket.join('admin');
      console.log(`Socket ${socket.id} joined admin room.`);
    });

    // Forward live audio chunks to the user's room
    socket.on('audio_stream_chunk', (data) => {
      if (data && data.userId && data.chunk) {
        socket.to(data.userId).emit('live_audio_chunk', data);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

// Broadcast incident updates to listening contacts and administrators
function broadcastIncidentUpdate(userId, eventName, data) {
  if (io) {
    // Emit to contacts watching this user
    io.to(userId).emit(eventName, data);
    // Emit to admin monitoring dashboard
    io.to('admin').emit(eventName, data);
  }
}

module.exports = {
  initSocket,
  getIO,
  broadcastIncidentUpdate
};
