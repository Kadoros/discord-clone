import { Server as NetServer } from "http";
import { NextApiRequest } from "next";
import { Server as ServerIO, Socket } from "socket.io";

import { NextApiResponseServerIo } from "@/types";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ioHandler = (req: NextApiRequest, res: NextApiResponseServerIo) => {
  // Check if the socket server is already initialized
  if (res.socket.server.io) {
    console.log("Socket server already initialized");
    res.end();
    return;
  }

  const path = "/api/socket/io";
  const httpServer: NetServer = res.socket.server as any;
  const io = new ServerIO(httpServer, {
    path: path,
    addTrailingSlash: false,
    cors: {
      origin: "https://wisto.vercel.app",
      methods: ["GET", "POST"],
    },
  });

  // server-side connection handler
  io.on("connection", (socket: Socket) => {
    console.log("New socket connection");

    socket.on("join_room", (roomName) => {
      socket.join(roomName);
      console.log(`User joined room: ${roomName}`);

      io.to(roomName).except(socket.id).emit("welcome", { roomName });
      console.log(`emiting welcone to: ${roomName}`);
    });
    socket.on("offer", (offer, roomName) => {
      socket.to(roomName).emit("offer", offer);
    });

    socket.on("answer", (answer, roomName) => {
      socket.to(roomName).emit("answer", answer);
    });

    socket.on("ice", (ice, roomName) => {
      socket.to(roomName).emit("ice", ice);
    });

    // Add more event listeners as needed
    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });
  });

  // Save the io server instance
  res.socket.server.io = io;

  // Important: send a response to complete the request
  res.end();
};

export default ioHandler;
