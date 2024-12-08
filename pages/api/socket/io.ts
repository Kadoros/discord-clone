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
  if (!res.socket.server.io) {
    const path = "/api/socket/io";
    const httpServer: NetServer = res.socket.server as any;
    const io = new ServerIO(httpServer, {
      path: path,
      addTrailingSlash: true,
    });

    // server-side connection handler
    io.on("connection", (socket: Socket) => {
        socket.on("join_room", (roomName, done) => {
          socket.join(roomName);
          console.log(`User joined room: ${roomName}`);
          socket.to(roomName).emit("welcome"); // Emit "welcome" to everyone in the room
        });
      });

    res.socket.server.io = io;
  }
  res.end();
};

export default ioHandler;
